import { Inject, Injectable } from '@nestjs/common';
import {
  invoiceNumber,
  invoiceNumberIn,
  seriesCode,
  todayInSpain,
  type DraftProblem,
  type FiscalData,
  type Invoice,
  type InvoiceEvent,
  type InvoiceHistoryEntry,
  type InvoiceRecordStatus,
  type InvoiceSnapshot,
  type InvoiceStatus,
  isRecordUnconfirmed,
} from '@verifiq/domain';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { recordAuditEvent, type AuditAction } from '../audit/audit.js';
import { DATABASE, inTransaction, type Database, type Queryable } from '../database/database.module.js';
import { auditEvents, invoiceRecords, invoices, issuers, seriesCounters, users } from '../database/schema.js';
import { DraftsService } from '../drafts/drafts.js';
import { RepresentationService } from '../issuers/representation.js';
import { InvoicePdfsService } from './invoice-pdfs.js';
import { SubmissionQueue } from './submission-queue.js';

// Every method takes the issuer id resolved by the isolation layer (issuer-context.ts) and filters by it.

export class InvoiceNotFoundError extends Error {}

/** The audit events an invoice's history shows, as the events of its timeline. */
const HISTORY_EVENTS: Record<AuditAction, InvoiceEvent> = {
  'invoice-issued': 'issued',
  'invoice-record-submitted': 'submitted',
  'invoice-record-blocked': 'blocked',
  'invoice-pdf-generated': 'pdf-generated',
  'invoice-record-accepted': 'accepted',
  'invoice-record-accepted-with-errors': 'accepted-with-errors',
  'invoice-record-rejected': 'rejected',
};

/** Without its key at the connector and a valid Representation, the issuer cannot issue. */
export class CannotIssueError extends Error {}

export class DraftNotReadyError extends Error {
  constructor(readonly problems: DraftProblem[]) {
    super('The draft cannot be issued yet');
  }
}

/** The issuer's fiscal data, and its ordinary series of the year of `issueDate` (ADR 0004). */
async function issuerAndSeries(db: Queryable, issuerId: string, issueDate: string) {
  const [issuer] = await db
    .select({
      name: issuers.name,
      taxId: issuers.taxId,
      address: issuers.address,
      postalCode: issuers.postalCode,
      municipality: issuers.municipality,
      province: issuers.province,
      email: issuers.email,
      phone: issuers.phone,
      iban: issuers.iban,
      seriesPrefix: issuers.seriesPrefix,
    })
    .from(issuers)
    .where(eq(issuers.id, issuerId));
  if (!issuer?.seriesPrefix) throw new Error(`Issuer ${issuerId} has no series`);
  const { seriesPrefix, ...fiscalData } = issuer;
  const year = Number(issueDate.slice(0, 4));
  return { prefix: seriesPrefix, year, series: seriesCode(seriesPrefix, year), fiscalData: fiscalData satisfies FiscalData };
}

/**
 * Issuance (ADR 0002) and issued invoices. Issuing is one transaction: it locks the draft and the
 * counter of the series, assigns the next number, freezes a copy of the invoice, creates its
 * InvoiceRecord and queues its submission. Anything that fails rolls it all back: no number is lost.
 */
@Injectable()
export class InvoicesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly drafts: DraftsService,
    private readonly representation: RepresentationService,
    private readonly queue: SubmissionQueue,
    private readonly pdfs: InvoicePdfsService,
  ) {}

  /** Issues the draft, which becomes the invoice. Returns the invoice. */
  async issue(issuerId: string, userId: string, draftId: string): Promise<Invoice> {
    if (!(await this.representation.canIssue(issuerId))) throw new CannotIssueError();
    const invoiceId = await inTransaction(this.db, async (tx, client) => {
      const draft = await this.drafts.find(issuerId, draftId, { db: tx, lock: true });
      if (draft.problems.length > 0 || !draft.recipient) throw new DraftNotReadyError(draft.problems);
      const { issueDate, recipient } = draft;
      const { series, fiscalData } = await issuerAndSeries(tx, issuerId, issueDate);

      // The counter's row stays locked until the transaction ends: Issuances in a series take turns.
      const [counter] = await tx
        .insert(seriesCounters)
        .values({ issuerId, series, lastNumber: 1 })
        .onConflictDoUpdate({
          target: [seriesCounters.issuerId, seriesCounters.series],
          set: { lastNumber: sql`${seriesCounters.lastNumber} + 1` },
        })
        .returning({ number: seriesCounters.lastNumber });
      const number = counter!.number;

      const snapshot: InvoiceSnapshot = {
        issuer: fiscalData,
        recipient: {
          name: recipient.name,
          taxId: recipient.taxId,
          address: recipient.address,
          postalCode: recipient.postalCode,
          municipality: recipient.municipality,
          province: recipient.province,
        },
        billingPeriod: draft.billingPeriod,
        operationDate: draft.operationDate,
        operationDescription: draft.operationDescription,
        lines: draft.lines,
        withholding: draft.withholding,
        breakdown: draft.breakdown,
      };
      const status: InvoiceStatus = 'issued';
      const [invoice] = await tx
        .insert(invoices)
        .values({ issuerId, recipientId: recipient.id, series, number, issueDate, status, snapshot, issuedBy: userId })
        .returning({ id: invoices.id });
      const recordStatus: InvoiceRecordStatus = 'pending-submission';
      const [record] = await tx
        .insert(invoiceRecords)
        .values({ issuerId, invoiceId: invoice!.id, status: recordStatus, idempotencyKey: randomUUID() })
        .returning({ id: invoiceRecords.id });
      await this.queue.enqueue({ invoiceRecordId: record!.id }, client);

      await recordAuditEvent(tx, {
        issuerId,
        actorUserId: userId,
        action: 'invoice-issued',
        subjectType: 'invoice',
        subjectId: invoice!.id,
        details: {
          number: invoiceNumberIn(series, number),
          issueDate,
          draftId,
          recipientId: recipient.id,
          recipientTaxId: recipient.taxId,
          totalAmount: draft.breakdown.totalAmount,
          amountDue: draft.breakdown.amountDue,
        },
      });
      await this.drafts.delete(issuerId, draftId, { db: tx });
      return invoice!.id;
    });
    return this.find(issuerId, invoiceId);
  }

  async find(issuerId: string, id: string): Promise<Invoice> {
    const [row] = await this.db
      .select({ invoice: invoices, record: invoiceRecords })
      .from(invoices)
      .innerJoin(invoiceRecords, eq(invoiceRecords.invoiceId, invoices.id))
      .where(and(eq(invoices.issuerId, issuerId), eq(invoices.id, id)))
      .orderBy(desc(invoiceRecords.createdAt))
      .limit(1);
    if (!row) throw new InvoiceNotFoundError();
    const { invoice, record } = row;
    const snapshot = invoice.snapshot as InvoiceSnapshot;
    const pdfVersion = await this.pdfs.currentVersion(invoice.id);
    const recordStatus = record.status as InvoiceRecordStatus;
    return {
      id: invoice.id,
      number: invoiceNumberIn(invoice.series, invoice.number),
      issueDate: invoice.issueDate,
      status: invoice.status as InvoiceStatus,
      record: {
        status: recordStatus,
        verificationUrl: record.verificationUrl,
        rejection:
          record.status === 'blocked' && record.rejectionCode !== null
            ? { code: record.rejectionCode, message: record.rejectionMessage ?? '' }
            : null,
        confirmedAt: record.confirmedAt?.toISOString() ?? null,
        registrationCode: record.registrationCode,
        aeatError:
          record.aeatErrorCode !== null ? { code: record.aeatErrorCode, message: record.aeatErrorMessage ?? '' } : null,
        unconfirmed: isRecordUnconfirmed(recordStatus, record.createdAt),
      },
      history: await this.history(issuerId, invoice.id),
      pdf: pdfVersion === null ? null : { version: pdfVersion },
      recipientId: invoice.recipientId,
      ...snapshot,
      issuedAt: invoice.createdAt.toISOString(),
    };
  }

  /** What happened to the invoice, oldest first: its audit events, with who acted (null for the system). */
  private async history(issuerId: string, invoiceId: string): Promise<InvoiceHistoryEntry[]> {
    const events = await this.db
      .select({ action: auditEvents.action, occurredAt: auditEvents.occurredAt, actor: users.name })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .where(
        and(
          eq(auditEvents.issuerId, issuerId),
          eq(auditEvents.subjectType, 'invoice'),
          eq(auditEvents.subjectId, invoiceId),
        ),
      )
      .orderBy(asc(auditEvents.occurredAt));
    return events.flatMap(({ action, occurredAt, actor }) => {
      const event = HISTORY_EVENTS[action as AuditAction];
      return event ? [{ event, occurredAt: occurredAt.toISOString(), actor }] : [];
    });
  }

  /** The number an Issuance today would assign, unless another one comes first. */
  async nextNumber(issuerId: string): Promise<string> {
    const { prefix, year, series } = await issuerAndSeries(this.db, issuerId, todayInSpain());
    const [counter] = await this.db
      .select({ lastNumber: seriesCounters.lastNumber })
      .from(seriesCounters)
      .where(and(eq(seriesCounters.issuerId, issuerId), eq(seriesCounters.series, series)));
    return invoiceNumber(prefix, year, (counter?.lastNumber ?? 0) + 1);
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { InvoiceRecordStatus } from '@verifiq/domain';
import { and, desc, eq } from 'drizzle-orm';
import { recordAuditEvent } from '../audit/audit.js';
import { DATABASE, type Database, type Queryable } from '../database/database.module.js';
import { invoiceRecords, invoices, issuers, webhookDeliveries } from '../database/schema.js';
import {
  VERIFACTU_CONNECTOR,
  type RecordResult,
  type RecordStatus,
  type VerifactuConnector,
  type WebhookDelivery,
} from '../verifactu/connector.js';

type Verdict = Extract<InvoiceRecordStatus, 'accepted' | 'accepted-with-errors' | 'rejected'>;

/** How a verdict reached Verifiq: the results webhook, or the poll that backs it up. */
export type VerdictSource = 'webhook' | 'poll';

/** The AEAT's verdict in a record status; null while it has none (or it is not about a submission). */
function verdictOf({ state, aeatError }: RecordStatus): { verdict: Verdict; aeatError: RecordStatus['aeatError'] } | null {
  switch (state) {
    case 'accepted':
    case 'accepted-with-errors':
    case 'rejected':
      return { verdict: state, aeatError };
    // The AEAT already had a record with the same series, number and date: this one was not registered.
    case 'duplicate':
      return {
        verdict: 'rejected',
        aeatError: aeatError ?? { code: 'duplicate', message: 'La AEAT ya tiene un registro con este número y fecha.' },
      };
    case 'pending':
    case 'voided':
      return null;
  }
}

/**
 * Applies the AEAT's verdicts on submitted InvoiceRecords: Aceptado, Aceptado con errores or
 * Rechazado. They arrive through the connector's results webhook, backed up by a periodic poll.
 * Only a record still waiting for its verdict takes one, so repeating a verdict changes nothing.
 */
@Injectable()
export class RecordVerdicts {
  private readonly logger = new Logger(RecordVerdicts.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VERIFACTU_CONNECTOR) private readonly connector: VerifactuConnector,
  ) {}

  /**
   * Applies a delivery of the results webhook, once: a delivery already received is ignored.
   * Returns false when its signature is not valid, without looking at it.
   */
  async receive(delivery: WebhookDelivery): Promise<boolean> {
    const read = this.connector.readResultsDelivery(delivery);
    if (!read) return false;
    await this.db.transaction(async (tx) => {
      // A retry waits here for the first delivery's transaction, then finds its id taken.
      const [inserted] = await tx
        .insert(webhookDeliveries)
        .values({ id: read.id, body: delivery.body.toString('utf8') })
        .onConflictDoNothing()
        .returning({ id: webhookDeliveries.id });
      if (!inserted) return;
      for (const result of read.results) {
        const recordId = await this.submittedRecordOf(tx, result);
        if (recordId) await this.apply(tx, recordId, result.status, 'webhook');
        else this.logger.warn(`Webhook ${read.id}: no submitted record for ${result.issuerTaxId} ${result.invoice.series}${result.invoice.number}`);
      }
    });
    return true;
  }

  /** Gives the record its verdict, if it has one and the record is still waiting for it. */
  async apply(db: Queryable, recordId: string, status: RecordStatus, source: VerdictSource): Promise<void> {
    const settled = verdictOf(status);
    if (!settled) return;
    const { verdict, aeatError } = settled;
    const registrationCode = verdict === 'rejected' ? null : (status.registrationCode ?? null);
    const [record] = await db
      .update(invoiceRecords)
      .set({
        status: verdict,
        confirmedAt: new Date(),
        aeatErrorCode: aeatError?.code ?? null,
        aeatErrorMessage: aeatError?.message ?? null,
        registrationCode,
        updatedAt: new Date(),
      })
      .where(and(eq(invoiceRecords.id, recordId), eq(invoiceRecords.status, 'submitted')))
      .returning({ issuerId: invoiceRecords.issuerId, invoiceId: invoiceRecords.invoiceId });
    if (!record) return;
    await recordAuditEvent(db, {
      issuerId: record.issuerId,
      actorUserId: null,
      action: `invoice-record-${verdict}`,
      subjectType: 'invoice',
      subjectId: record.invoiceId,
      details: {
        invoiceRecordId: recordId,
        source,
        ...(aeatError && { aeatError }),
        ...(registrationCode && { registrationCode }),
      },
    });
  }

  /** The record of the invoice a result names that is waiting for its verdict. */
  private async submittedRecordOf(db: Queryable, { issuerTaxId, invoice }: RecordResult): Promise<string | null> {
    const number = Number(invoice.number);
    if (!Number.isSafeInteger(number)) return null;
    const [row] = await db
      .select({ id: invoiceRecords.id })
      .from(invoiceRecords)
      .innerJoin(invoices, eq(invoices.id, invoiceRecords.invoiceId))
      .innerJoin(issuers, eq(issuers.id, invoices.issuerId))
      .where(
        and(
          eq(issuers.taxId, issuerTaxId),
          eq(invoices.series, invoice.series),
          eq(invoices.number, number),
          eq(invoices.issueDate, invoice.issueDate),
          eq(invoiceRecords.status, 'submitted'),
        ),
      )
      .orderBy(desc(invoiceRecords.createdAt))
      .limit(1);
    return row?.id ?? null;
  }
}

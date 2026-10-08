import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  exemptionGround,
  serialNumber,
  splitInvoiceNumber,
  sumAmounts,
  voidingFlagsOf,
  type InvoiceRecordStatus,
  type InvoiceSnapshot,
  type VerifactuExemptionCode,
} from '@verifiq/domain';
import { and, asc, eq, lt } from 'drizzle-orm';
import { recordAuditEvent } from '../audit/audit.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { invoiceRecords, invoices } from '../database/schema.js';
import {
  VERIFACTU_CONNECTOR,
  type ConnectorResult,
  type InvoiceKey,
  type QueuedRecord,
  type QueuedVoiding,
  type RecordInvoice,
  type RecordLine,
  type VerifactuConnector,
} from '../verifactu/connector.js';
import { InvoicePdfsService } from './invoice-pdfs.js';
import { SUBMISSION_OPTIONS, SubmissionQueue, type SubmissionOptions } from './submission-queue.js';

/** The connector did not answer: the record is still to be sent, with the same idempotency key. */
export class SubmissionPostponedError extends Error {}

/** The series, number and issue date that name an invoice at VeriFactu: F2026-0001 travels as series F2026- and number 0001. */
function invoiceKeyOf(invoice: { series: string; number: number; issueDate: string }): InvoiceKey {
  return { series: invoice.series, number: serialNumber(invoice.number), issueDate: invoice.issueDate };
}

/**
 * What VeriFactu receives of an issued invoice: its key, recipient and tax breakdown, never its items.
 * A corrective invoice goes as its R1/R4 type, by differences, referring to the invoice it corrects.
 */
export function recordInvoiceOf(
  invoice: { series: string; number: number; issueDate: string },
  snapshot: InvoiceSnapshot,
): RecordInvoice {
  const { breakdown } = snapshot;
  // Copies issued before corrective invoices existed have no correction.
  const correction = snapshot.correction ?? null;
  const exemptBases = new Map<VerifactuExemptionCode, string[]>();
  for (const { ground, base } of breakdown.exempt) {
    const code = exemptionGround(ground).verifactuCode;
    exemptBases.set(code, [...(exemptBases.get(code) ?? []), base]);
  }
  const lines: RecordLine[] = [
    ...breakdown.taxed.map(({ rate, base, taxAmount }): RecordLine => ({ kind: 'taxed', taxBase: base, vatRate: rate, taxAmount })),
    ...[...exemptBases].map(([code, bases]): RecordLine => ({
      kind: 'exempt',
      taxBase: sumAmounts(bases),
      exemptionCode: code,
    })),
  ];
  return {
    ...invoiceKeyOf(invoice),
    type: correction?.type ?? 'F1',
    ...(snapshot.operationDate && snapshot.operationDate !== invoice.issueDate
      ? { operationDate: snapshot.operationDate }
      : {}),
    operationDescription: snapshot.operationDescription,
    recipient: { taxId: snapshot.recipient.taxId, name: snapshot.recipient.name },
    lines,
    totalAmount: breakdown.totalAmount,
    ...(correction && {
      corrects: [{ ...splitInvoiceNumber(correction.invoice.number), issueDate: correction.invoice.issueDate }],
    }),
  };
}

/**
 * Sends InvoiceRecords to the VeriFactu connector (the worker service), then draws the invoice's PDF
 * with the QR it answered. Each record is sent with its idempotency key, so retrying after a timeout
 * never registers an invoice twice; a job is done only once its invoice has its PDF.
 */
@Injectable()
export class SubmissionWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(SubmissionWorker.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VERIFACTU_CONNECTOR) private readonly connector: VerifactuConnector,
    @Inject(SUBMISSION_OPTIONS) private readonly options: SubmissionOptions,
    private readonly queue: SubmissionQueue,
    private readonly pdfs: InvoicePdfsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.options.work) return;
    await this.queue.work(({ invoiceRecordId }) => this.submit(invoiceRecordId));
    this.logger.log('Sending invoice records');
  }

  /** Runs the jobs ready now, once each; a job that fails is left for its retry. Tests drive the worker with it. */
  async runPending(): Promise<void> {
    for (let jobs = await this.queue.fetch(); jobs.length > 0; jobs = await this.queue.fetch()) {
      for (const job of jobs) {
        try {
          await this.submit(job.data.invoiceRecordId);
          await this.queue.complete(job);
        } catch (error) {
          await this.queue.fail(job, error);
        }
      }
    }
  }

  /**
   * Sends the record if it is still pending, then generates the invoice's PDF once the record has its
   * QR. Throws when it has to be retried.
   */
  async submit(invoiceRecordId: string): Promise<void> {
    const [row] = await this.db
      .select({ record: invoiceRecords, invoice: invoices })
      .from(invoiceRecords)
      .innerJoin(invoices, eq(invoices.id, invoiceRecords.invoiceId))
      .where(eq(invoiceRecords.id, invoiceRecordId));
    if (!row) return;
    if (row.record.status === 'pending-submission') await this.send(row);
    // Does nothing without QR (blocked), when the record's PDF exists or once the record was sent again:
    // a retry only draws what is missing.
    await this.pdfs.generateForRecord(invoiceRecordId);
  }

  /**
   * Sends the record (an Amendment or a Voiding, if it is one) and keeps the fingerprint, QR and
   * verification URL the connector answers (a Voiding has no QR), or blocks the record if it refuses it.
   * Throws when it has to be retried.
   */
  private async send({
    record,
    invoice,
  }: {
    record: typeof invoiceRecords.$inferSelect;
    invoice: typeof invoices.$inferSelect;
  }): Promise<void> {
    // What the record sends is the copy it keeps (records before migration 0011 have none: the invoice's).
    const snapshot = (record.snapshot ?? invoice.snapshot) as InvoiceSnapshot;

    const issuer = { issuerId: invoice.issuerId, taxId: snapshot.issuer.taxId };
    const exchange = { invoiceRecordId: record.id, idempotencyKey: record.idempotencyKey };
    const submission = { ...exchange, invoice: recordInvoiceOf(invoice, snapshot) };
    let result: ConnectorResult<QueuedRecord | QueuedVoiding>;
    if (record.operation === 'voiding') {
      const flags = voidingFlagsOf(await this.recordsBefore(record));
      result = await this.connector.voidRecord(issuer, { ...exchange, invoice: invoiceKeyOf(invoice), ...flags });
    } else if (record.operation === 'amendment') {
      result = await this.connector.amendRecord(issuer, { ...submission, previousRejection: record.previousRejection ?? 'none' });
    } else {
      result = await this.connector.submitRecord(issuer, submission);
    }
    if (result.outcome === 'transient') {
      throw new SubmissionPostponedError(`${result.reason}: ${result.message}`);
    }

    await this.db.transaction(async (tx) => {
      const pending = and(eq(invoiceRecords.id, record.id), eq(invoiceRecords.status, 'pending-submission'));
      const audit = { issuerId: invoice.issuerId, actorUserId: null, subjectType: 'invoice', subjectId: invoice.id } as const;
      if (result.outcome === 'ok') {
        const { connectorRecordId, fingerprint } = result.value;
        const { verificationUrl = null, qrPng = null } = 'qrPng' in result.value ? result.value : {};
        const updated = await tx
          .update(invoiceRecords)
          .set({
            status: 'submitted',
            connectorRecordId,
            fingerprint,
            verificationUrl,
            qrPng,
            submittedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(pending)
          .returning({ id: invoiceRecords.id });
        if (updated.length === 0) return;
        await recordAuditEvent(tx, {
          ...audit,
          action: 'invoice-record-submitted',
          details: { invoiceRecordId: record.id, operation: record.operation, connectorRecordId, fingerprint, verificationUrl },
        });
      } else {
        const updated = await tx
          .update(invoiceRecords)
          .set({ status: 'blocked', rejectionCode: result.code, rejectionMessage: result.message, updatedAt: new Date() })
          .where(pending)
          .returning({ id: invoiceRecords.id });
        if (updated.length === 0) return;
        await recordAuditEvent(tx, {
          ...audit,
          action: 'invoice-record-blocked',
          details: { invoiceRecordId: record.id, code: result.code, message: result.message },
        });
      }
    });
  }

  /** The invoice's records before this one, oldest first. */
  private async recordsBefore(record: typeof invoiceRecords.$inferSelect) {
    const rows = await this.db
      .select({ operation: invoiceRecords.operation, status: invoiceRecords.status })
      .from(invoiceRecords)
      .where(and(eq(invoiceRecords.invoiceId, record.invoiceId), lt(invoiceRecords.createdAt, record.createdAt)))
      .orderBy(asc(invoiceRecords.createdAt));
    return rows.map(({ operation, status }) => ({ voiding: operation === 'voiding', status: status as InvoiceRecordStatus }));
  }

}

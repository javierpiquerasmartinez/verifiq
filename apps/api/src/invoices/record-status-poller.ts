import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { invoiceNumberIn, UNCONFIRMED_RECORD_HOURS } from '@verifiq/domain';
import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { invoiceRecords, invoices, issuers } from '../database/schema.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { VERIFACTU_CONNECTOR, type VerifactuConnector } from '../verifactu/connector.js';
import { unconfirmedRecordsEmail, type UnconfirmedRecord } from './emails.js';
import { RecordVerdicts } from './record-verdicts.js';
import { SUBMISSION_OPTIONS, SubmissionQueue, type SubmissionOptions } from './submission-queue.js';

const MINUTE = 60_000;
/** The webhook usually brings the verdict within minutes: only records sent before this are asked about. */
const POLL_AFTER_MS = 10 * MINUTE;
const UNCONFIRMED_AFTER_MS = UNCONFIRMED_RECORD_HOURS * 60 * MINUTE;

/**
 * Backs up the results webhook (every 15 minutes, in the worker): asks the connector for the status
 * of the records sent more than 10 minutes ago that still have no verdict, and alerts the operator
 * once about each record still unconfirmed 24 h after its Issuance.
 */
@Injectable()
export class RecordStatusPoller implements OnApplicationBootstrap {
  private readonly logger = new Logger(RecordStatusPoller.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VERIFACTU_CONNECTOR) private readonly connector: VerifactuConnector,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(SUBMISSION_OPTIONS) private readonly options: SubmissionOptions,
    private readonly queue: SubmissionQueue,
    private readonly verdicts: RecordVerdicts,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.options.work) return;
    await this.queue.every15Minutes(() => this.pollOnce());
    this.logger.log('Polling the status of submitted records every 15 minutes');
  }

  /** One round of the poll, as of `now`. Tests drive it with a clock of their own. */
  async pollOnce(now = new Date()): Promise<void> {
    await this.pollSubmitted(now);
    await this.alertUnconfirmed(now);
  }

  private async pollSubmitted(now: Date): Promise<void> {
    const due = await this.db
      .select({
        id: invoiceRecords.id,
        connectorRecordId: invoiceRecords.connectorRecordId,
        issuerId: invoiceRecords.issuerId,
        taxId: issuers.taxId,
      })
      .from(invoiceRecords)
      .innerJoin(issuers, eq(issuers.id, invoiceRecords.issuerId))
      .where(
        and(
          eq(invoiceRecords.status, 'submitted'),
          lte(invoiceRecords.submittedAt, new Date(now.getTime() - POLL_AFTER_MS)),
        ),
      );
    for (const record of due) {
      // A record that cannot be asked about now is asked again on the next round.
      try {
        const result = await this.connector.recordStatus(
          { issuerId: record.issuerId, taxId: record.taxId },
          { invoiceRecordId: record.id, connectorRecordId: record.connectorRecordId! },
        );
        if (result.outcome !== 'ok') {
          this.logger.warn(`Status of record ${record.id} not available: ${result.message}`);
          continue;
        }
        await this.verdicts.apply(this.db, record.id, result.value, 'poll');
      } catch (error) {
        this.logger.error(`Could not poll the status of record ${record.id}`, error);
      }
    }
  }

  /** Marks the records unconfirmed for 24 h as alerted and emails the operator; a failed email alerts again next round. */
  private async alertUnconfirmed(now: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      const alerted = await tx
        .update(invoiceRecords)
        .set({ unconfirmedAlertedAt: now })
        .where(
          and(
            inArray(invoiceRecords.status, ['pending-submission', 'submitted']),
            lte(invoiceRecords.createdAt, new Date(now.getTime() - UNCONFIRMED_AFTER_MS)),
            isNull(invoiceRecords.unconfirmedAlertedAt),
          ),
        )
        .returning({ id: invoiceRecords.id, invoiceId: invoiceRecords.invoiceId, createdAt: invoiceRecords.createdAt });
      if (alerted.length === 0) return;

      const rows = await tx
        .select({ id: invoices.id, series: invoices.series, number: invoices.number, taxId: issuers.taxId })
        .from(invoices)
        .innerJoin(issuers, eq(issuers.id, invoices.issuerId))
        .where(inArray(invoices.id, alerted.map((record) => record.invoiceId)));
      const invoiceOf = new Map(rows.map((row) => [row.id, row]));
      const records = alerted.map((record): UnconfirmedRecord => {
        const invoice = invoiceOf.get(record.invoiceId)!;
        return {
          invoiceRecordId: record.id,
          invoiceNumber: invoiceNumberIn(invoice.series, invoice.number),
          issuerTaxId: invoice.taxId,
          issuedAt: record.createdAt,
        };
      });

      const { operatorEmail } = this.options;
      if (operatorEmail) await this.mailer.send(unconfirmedRecordsEmail(operatorEmail, records));
      else this.logger.warn(`OPERATOR_EMAIL is not set. Records unconfirmed for ${UNCONFIRMED_RECORD_HOURS} h: ${records.map((r) => r.invoiceRecordId).join(', ')}`);
    });
  }
}

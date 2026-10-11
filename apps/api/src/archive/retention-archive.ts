import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { and, asc, desc, gte, inArray, lt, or, type AnyColumn, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  archiveRuns,
  auditEvents,
  connectorExchanges,
  invoicePdfs,
  invoiceRecords,
  invoices,
  webhookDeliveries,
} from '../database/schema.js';
import { SUBMISSION_OPTIONS, SubmissionQueue, type SubmissionOptions } from '../invoices/submission-queue.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';

const MINUTE = 60_000;
/** A round leaves the last minutes to the next one: rows of transactions still open then commit with an earlier time. */
const SETTLE_MS = 5 * MINUTE;
/** Where the archive lives in object storage: a bucket lock keeps everything under it for 6 years. */
export const ARCHIVE_PREFIX = 'archive/';

/**
 * Keeps the evidence of every issued invoice outside the database for the legal retention (6 years),
 * even after its issuer leaves (spec, story 97). Every day, in the worker, it copies to object storage,
 * under `archive/`, what changed since its last round: each changed invoice as a new version (its frozen
 * copy and every record with what it sent and what the AEAT answered), each new PDF, and the new rows
 * of the connector exchanges, the audit log and the results webhook. It only ever adds objects, so a
 * bucket lock on `archive/` can forbid overwriting or deleting them.
 */
@Injectable()
export class RetentionArchive implements OnApplicationBootstrap {
  private readonly logger = new Logger(RetentionArchive.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(SUBMISSION_OPTIONS) private readonly options: SubmissionOptions,
    private readonly queue: SubmissionQueue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.options.work) return;
    await this.queue.scheduleRetentionArchive(() => this.exportOnce());
    this.logger.log('Archiving the evidence of the invoices every day');
  }

  /**
   * One round, as of `now`: exports what changed after the previous round, up to a few minutes before
   * `now`. A round that fails records nothing, so the next one exports its changes again.
   */
  async exportOnce(now = new Date()): Promise<void> {
    const [previous] = await this.db
      .select({ coveredUntil: archiveRuns.coveredUntil })
      .from(archiveRuns)
      .orderBy(desc(archiveRuns.coveredUntil))
      .limit(1);
    const from = previous?.coveredUntil ?? null;
    const until = new Date(now.getTime() - SETTLE_MS);
    if (from && until <= from) return;

    const window = new Window(from, until);
    await this.exportInvoices(window);
    await this.exportPdfs(window);
    await this.exportByIssuer(window, connectorExchanges, connectorExchanges.recordedAt, 'connector-exchanges');
    await this.exportByIssuer(window, auditEvents, auditEvents.occurredAt, 'audit-events');
    await this.exportWebhookDeliveries(window);

    await this.db.insert(archiveRuns).values({ coveredUntil: until });
    this.logger.log(`Archived the changes up to ${until.toISOString()}`);
  }

  /** A new version of every invoice that changed: itself, its records or its PDFs. */
  private async exportInvoices(window: Window): Promise<void> {
    const changedRecords = this.db
      .select({ invoiceId: invoiceRecords.invoiceId })
      .from(invoiceRecords)
      .where(window.covers(invoiceRecords.updatedAt));
    const changedPdfs = this.db
      .select({ invoiceId: invoicePdfs.invoiceId })
      .from(invoicePdfs)
      .where(window.covers(invoicePdfs.createdAt));
    const changed = await this.db
      .select()
      .from(invoices)
      .where(
        or(window.covers(invoices.updatedAt), inArray(invoices.id, changedRecords), inArray(invoices.id, changedPdfs)),
      );
    if (changed.length === 0) return;

    const ids = changed.map((invoice) => invoice.id);
    const records = await this.db
      .select()
      .from(invoiceRecords)
      .where(inArray(invoiceRecords.invoiceId, ids))
      .orderBy(asc(invoiceRecords.createdAt));
    const pdfs = await this.db
      .select()
      .from(invoicePdfs)
      .where(inArray(invoicePdfs.invoiceId, ids))
      .orderBy(asc(invoicePdfs.version));

    for (const invoice of changed) {
      const document = {
        archivedUntil: window.until,
        invoice,
        records: records.filter((record) => record.invoiceId === invoice.id),
        pdfs: pdfs.filter((pdf) => pdf.invoiceId === invoice.id),
      };
      await this.storage.put(`${invoicePrefix(invoice)}versions/${window.stamp}.json`, {
        body: Buffer.from(JSON.stringify(document, null, 2)),
        contentType: 'application/json',
      });
    }
  }

  /** A copy of every PDF version drawn in the window. */
  private async exportPdfs(window: Window): Promise<void> {
    const drawn = await this.db.select().from(invoicePdfs).where(window.covers(invoicePdfs.createdAt));
    for (const pdf of drawn) {
      const file = await this.storage.get(pdf.storageKey);
      // Lost evidence the archive cannot bring back: it must not hold back the rest.
      if (!file) {
        this.logger.error(`The file of PDF ${pdf.id} is missing: ${pdf.storageKey}`);
        continue;
      }
      await this.storage.put(
        `${invoicePrefix({ issuerId: pdf.issuerId, id: pdf.invoiceId })}pdfs/v${pdf.version}-${window.stamp}.pdf`,
        file,
      );
    }
  }

  /** The rows of an append-only table added in the window, one file per issuer. */
  private async exportByIssuer(
    window: Window,
    table: typeof connectorExchanges | typeof auditEvents,
    at: AnyColumn,
    name: string,
  ): Promise<void> {
    const rows: { issuerId: string }[] = await this.db.select().from(table).where(window.covers(at)).orderBy(asc(at));
    const byIssuer = new Map<string, unknown[]>();
    for (const row of rows) {
      if (!byIssuer.has(row.issuerId)) byIssuer.set(row.issuerId, []);
      byIssuer.get(row.issuerId)!.push(row);
    }
    for (const [issuerId, issuerRows] of byIssuer) {
      await this.storage.put(`${ARCHIVE_PREFIX}issuers/${issuerId}/${name}/${window.stamp}.ndjson`, ndjson(issuerRows));
    }
  }

  /** The deliveries of the results webhook received in the window: they name no issuer. */
  private async exportWebhookDeliveries(window: Window): Promise<void> {
    const rows = await this.db
      .select()
      .from(webhookDeliveries)
      .where(window.covers(webhookDeliveries.receivedAt))
      .orderBy(asc(webhookDeliveries.receivedAt));
    if (rows.length === 0) return;
    await this.storage.put(`${ARCHIVE_PREFIX}webhook-deliveries/${window.stamp}.ndjson`, ndjson(rows));
  }
}

/** The time a round covers: after the previous round (from the start, the first time) up to `until`. */
class Window {
  /** Names the objects of the round: every round writes new ones. */
  readonly stamp: string;

  constructor(
    readonly from: Date | null,
    readonly until: Date,
  ) {
    this.stamp = until.toISOString().replaceAll(':', '-');
  }

  covers(column: AnyColumn): SQL {
    const before = lt(column, this.until);
    return this.from ? and(gte(column, this.from), before)! : before;
  }
}

const invoicePrefix = (invoice: { issuerId: string; id: string }) =>
  `${ARCHIVE_PREFIX}issuers/${invoice.issuerId}/invoices/${invoice.id}/`;

const ndjson = (rows: unknown[]) => ({
  body: Buffer.from(rows.map((row) => JSON.stringify(row)).join('\n') + '\n'),
  contentType: 'application/x-ndjson',
});

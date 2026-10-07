import { Inject, Injectable } from '@nestjs/common';
import { invoiceNumberIn, type InvoiceSnapshot } from '@verifiq/domain';
import { and, desc, eq } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { recordAuditEvent } from '../audit/audit.js';
import { DATABASE, type Database, type Queryable } from '../database/database.module.js';
import { invoicePdfs, invoiceRecords, invoices, issuers } from '../database/schema.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { renderInvoicePdf, type InvoicePdfData } from './invoice-pdf.js';

/** The invoice has no PDF (its record has no QR yet, or never will: blocked), or not that version. */
export class InvoicePdfNotAvailableError extends Error {}

/** A version stored inside a transaction: its file is in the object storage before the transaction commits. */
export interface DrawnPdf {
  version: number;
  storageKey: string;
}

export interface InvoicePdfFile {
  /** Series and number, for the file name. */
  number: string;
  body: Buffer;
}

/**
 * The PDFs of issued invoices. A version is generated once per record, from the frozen copy, when the
 * record has its QR: without QR there is no PDF, so no unregistered invoice leaves Verifiq. Correcting
 * the copy after an incident sends a new record, and so a new version; correcting its withholding draws
 * one more with the same record's QR (ADR 0005). Each file is stored and never changes: a download
 * serves the current version, or an earlier one, as it was generated.
 */
@Injectable()
export class InvoicePdfsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /**
   * Generates the PDF version of the record, with its QR, unless it has one already or is no longer its
   * invoice's latest record: a record sent again after an incident is drawn from the corrected copy,
   * which an earlier record's QR never carries. The first record gets version 1; each later one, the next.
   */
  async generateForRecord(invoiceRecordId: string): Promise<void> {
    const [row] = await this.db
      .select({ invoice: invoices, qrPng: invoiceRecords.qrPng })
      .from(invoiceRecords)
      .innerJoin(invoices, eq(invoices.id, invoiceRecords.invoiceId))
      .where(eq(invoiceRecords.id, invoiceRecordId));
    if (!row?.qrPng) return;
    const [latest] = await this.db
      .select({ id: invoiceRecords.id })
      .from(invoiceRecords)
      .where(eq(invoiceRecords.invoiceId, row.invoice.id))
      .orderBy(desc(invoiceRecords.createdAt))
      .limit(1);
    if (latest?.id !== invoiceRecordId) return;
    if (await this.drawnFor(this.db, invoiceRecordId)) return;
    const { invoice } = row;
    const body = await this.render(this.db, invoice, row.qrPng);

    const stored: { pdf?: DrawnPdf } = {};
    try {
      await this.db.transaction(async (tx) => {
        // Locked as a correction of the withholding locks it: if one drew this record's version meanwhile,
        // from the corrected copy, that version stays.
        await tx.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, invoice.id)).for('update');
        if (await this.drawnFor(tx, invoiceRecordId)) return;
        stored.pdf = await this.store(tx, invoice, invoiceRecordId, body, null);
      });
    } catch (error) {
      if (stored.pdf) await this.discard(stored.pdf);
      throw error;
    }
  }

  /**
   * Draws a new version of the invoice's PDF from its copy, as it is now, with the QR of `record`, its
   * latest. Runs inside the transaction `db` that locked the invoice, which `actorUserId` acts in; if
   * that transaction fails, the caller discards it.
   */
  async drawIn(
    db: Queryable,
    invoice: typeof invoices.$inferSelect,
    record: { id: string; qrPng: string },
    actorUserId: string,
  ): Promise<DrawnPdf> {
    const body = await this.render(db, invoice, record.qrPng);
    return this.store(db, invoice, record.id, body, actorUserId);
  }

  /** Deletes the file of a version whose transaction failed: without its row, it is no version. */
  async discard(pdf: DrawnPdf): Promise<void> {
    await this.storage.delete(pdf.storageKey);
  }

  private async drawnFor(db: Queryable, invoiceRecordId: string): Promise<boolean> {
    const [drawn] = await db
      .select({ id: invoicePdfs.id })
      .from(invoicePdfs)
      .where(eq(invoicePdfs.invoiceRecordId, invoiceRecordId))
      .limit(1);
    return drawn !== undefined;
  }

  private async render(db: Queryable, invoice: typeof invoices.$inferSelect, qrPng: string): Promise<Buffer> {
    // The logo is not part of the frozen copy: the issuer's logo when the PDF is drawn.
    const [issuer] = await db.select({ logoKey: issuers.logoKey }).from(issuers).where(eq(issuers.id, invoice.issuerId));
    const logo = issuer?.logoKey ? await this.storage.get(issuer.logoKey) : null;
    return renderInvoicePdf({
      number: invoiceNumberIn(invoice.series, invoice.number),
      issueDate: invoice.issueDate,
      snapshot: invoice.snapshot as InvoiceSnapshot,
      qrPng: Buffer.from(qrPng, 'base64'),
      logo: logo && { data: logo.body, format: logo.contentType === 'image/png' ? 'png' : 'jpg' } satisfies InvoicePdfData['logo'],
    });
  }

  /** Stores the file as the invoice's next version, inside the transaction `db` that locked the invoice. */
  private async store(
    db: Queryable,
    invoice: typeof invoices.$inferSelect,
    invoiceRecordId: string,
    body: Buffer,
    actorUserId: string | null,
  ): Promise<DrawnPdf> {
    const version = ((await this.currentVersion(invoice.id, db)) ?? 0) + 1;
    const storageKey = `issuers/${invoice.issuerId}/invoices/${invoice.id}/v${version}-${randomUUID()}.pdf`;
    await this.storage.put(storageKey, { body, contentType: 'application/pdf' });
    try {
      await db
        .insert(invoicePdfs)
        .values({ issuerId: invoice.issuerId, invoiceId: invoice.id, invoiceRecordId, version, storageKey });
      await recordAuditEvent(db, {
        issuerId: invoice.issuerId,
        actorUserId,
        action: 'invoice-pdf-generated',
        subjectType: 'invoice',
        subjectId: invoice.id,
        details: { version, invoiceRecordId, sha256: createHash('sha256').update(body).digest('hex') },
      });
    } catch (error) {
      await this.discard({ version, storageKey });
      throw error;
    }
    return { version, storageKey };
  }

  /** The number of the invoice's current PDF version, or null while it has none. */
  async currentVersion(invoiceId: string, db: Queryable = this.db): Promise<number | null> {
    const [pdf] = await db
      .select({ version: invoicePdfs.version })
      .from(invoicePdfs)
      .where(eq(invoicePdfs.invoiceId, invoiceId))
      .orderBy(desc(invoicePdfs.version))
      .limit(1);
    return pdf?.version ?? null;
  }

  /** The stored file of a version of the invoice's PDF: by default, its current one. */
  async file(issuerId: string, invoiceId: string, version?: number): Promise<InvoicePdfFile> {
    const [row] = await this.db
      .select({ storageKey: invoicePdfs.storageKey, series: invoices.series, number: invoices.number })
      .from(invoicePdfs)
      .innerJoin(invoices, eq(invoices.id, invoicePdfs.invoiceId))
      .where(
        and(
          eq(invoicePdfs.issuerId, issuerId),
          eq(invoicePdfs.invoiceId, invoiceId),
          version === undefined ? undefined : eq(invoicePdfs.version, version),
        ),
      )
      .orderBy(desc(invoicePdfs.version))
      .limit(1);
    if (!row) throw new InvoicePdfNotAvailableError();
    const file = await this.storage.get(row.storageKey);
    if (!file) throw new Error(`The PDF ${row.storageKey} is missing from the object storage`);
    return { number: invoiceNumberIn(row.series, row.number), body: file.body };
  }
}

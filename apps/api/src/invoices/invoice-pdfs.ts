import { Inject, Injectable } from '@nestjs/common';
import { invoiceNumberIn, type InvoiceSnapshot } from '@verifiq/domain';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { recordAuditEvent } from '../audit/audit.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { invoicePdfs, invoiceRecords, invoices, issuers } from '../database/schema.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { renderInvoicePdf, type InvoicePdfData } from './invoice-pdf.js';

/** The invoice has no PDF: its record has no QR yet, or never will (blocked). */
export class InvoicePdfNotAvailableError extends Error {}

export interface InvoicePdfFile {
  /** Series and number, for the file name. */
  number: string;
  body: Buffer;
}

/**
 * The PDFs of issued invoices. A version is generated once per record, from the frozen copy, when the
 * record has its QR: without QR there is no PDF, so no unregistered invoice leaves Verifiq. Correcting
 * the copy after an incident sends a new record, and so a new version. Each file is stored and every
 * download serves the current version as it was generated.
 */
@Injectable()
export class InvoicePdfsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /**
   * Generates a new version of the invoice's PDF for its latest record with QR, unless that record
   * has one already. The first record gets version 1; a record sent again after an incident, the next.
   */
  async generateForLatestRecord(invoiceId: string): Promise<void> {
    const [row] = await this.db
      .select({ invoice: invoices, recordId: invoiceRecords.id, qrPng: invoiceRecords.qrPng, logoKey: issuers.logoKey })
      .from(invoices)
      .innerJoin(invoiceRecords, eq(invoiceRecords.invoiceId, invoices.id))
      .innerJoin(issuers, eq(issuers.id, invoices.issuerId))
      .where(and(eq(invoices.id, invoiceId), isNotNull(invoiceRecords.qrPng)))
      .orderBy(desc(invoiceRecords.createdAt))
      .limit(1);
    if (!row?.qrPng) return;
    const [drawn] = await this.db
      .select({ id: invoicePdfs.id })
      .from(invoicePdfs)
      .where(eq(invoicePdfs.invoiceRecordId, row.recordId))
      .limit(1);
    if (drawn) return;
    const { invoice, recordId } = row;

    // The logo is not part of the frozen copy: the issuer's logo when the PDF is drawn, seconds after issuing.
    const logo = row.logoKey ? await this.storage.get(row.logoKey) : null;
    const body = await renderInvoicePdf({
      number: invoiceNumberIn(invoice.series, invoice.number),
      issueDate: invoice.issueDate,
      snapshot: invoice.snapshot as InvoiceSnapshot,
      qrPng: Buffer.from(row.qrPng, 'base64'),
      logo: logo && { data: logo.body, format: logo.contentType === 'image/png' ? 'png' : 'jpg' } satisfies InvoicePdfData['logo'],
    });

    const version = ((await this.currentVersion(invoice.id)) ?? 0) + 1;
    const storageKey = `issuers/${invoice.issuerId}/invoices/${invoice.id}/v${version}-${randomUUID()}.pdf`;
    await this.storage.put(storageKey, { body, contentType: 'application/pdf' });
    const created = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(invoicePdfs)
        .values({ issuerId: invoice.issuerId, invoiceId: invoice.id, invoiceRecordId: recordId, version, storageKey })
        .onConflictDoNothing({ target: [invoicePdfs.invoiceId, invoicePdfs.version] })
        .returning({ id: invoicePdfs.id });
      if (inserted.length === 0) return false;
      await recordAuditEvent(tx, {
        issuerId: invoice.issuerId,
        actorUserId: null,
        action: 'invoice-pdf-generated',
        subjectType: 'invoice',
        subjectId: invoice.id,
        details: { version, invoiceRecordId: recordId, sha256: createHash('sha256').update(body).digest('hex') },
      });
      return true;
    });
    // Another run generated it first: its file is the one that stays.
    if (!created) await this.storage.delete(storageKey);
  }

  /** The number of the invoice's current PDF version, or null while it has none. */
  async currentVersion(invoiceId: string): Promise<number | null> {
    const [pdf] = await this.db
      .select({ version: invoicePdfs.version })
      .from(invoicePdfs)
      .where(eq(invoicePdfs.invoiceId, invoiceId))
      .orderBy(desc(invoicePdfs.version))
      .limit(1);
    return pdf?.version ?? null;
  }

  /** The stored file of the invoice's current PDF version. */
  async currentFile(issuerId: string, invoiceId: string): Promise<InvoicePdfFile> {
    const [row] = await this.db
      .select({ storageKey: invoicePdfs.storageKey, series: invoices.series, number: invoices.number })
      .from(invoicePdfs)
      .innerJoin(invoices, eq(invoices.id, invoicePdfs.invoiceId))
      .where(and(eq(invoicePdfs.issuerId, issuerId), eq(invoicePdfs.invoiceId, invoiceId)))
      .orderBy(desc(invoicePdfs.version))
      .limit(1);
    if (!row) throw new InvoicePdfNotAvailableError();
    const file = await this.storage.get(row.storageKey);
    if (!file) throw new Error(`The PDF ${row.storageKey} is missing from the object storage`);
    return { number: invoiceNumberIn(row.series, row.number), body: file.body };
  }
}

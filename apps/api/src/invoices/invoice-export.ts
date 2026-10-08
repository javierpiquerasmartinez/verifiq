import { Inject, Injectable } from '@nestjs/common';
import {
  invoiceExportCsv,
  invoiceNumberIn,
  type Breakdown,
  type ExportedInvoice,
  type InvoiceRecordStatus,
  type InvoiceStatus,
} from '@verifiq/domain';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { Zip, ZipDeflate, ZipPassThrough } from 'fflate';
import type { Writable } from 'node:stream';
import { DATABASE, type Database } from '../database/database.module.js';
import { invoicePdfs, invoiceRecords, invoices } from '../database/schema.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';

/** The summary CSV's name inside the ZIP; each PDF is named after its invoice's number. */
export const EXPORT_CSV_NAME = 'facturas.csv';

/** Resolves once `output` takes more, or is closed. */
function drained(output: Writable): Promise<void> {
  if (!output.writableNeedDrain) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      output.off('drain', done);
      output.off('close', done);
      resolve();
    };
    output.on('drain', done);
    output.on('close', done);
  });
}

/**
 * The export (spec story 85): every issued invoice of the issuer, in a ZIP with the current version of
 * its PDF (none while its record has no QR) and a summary CSV of their current copies. Nothing is
 * generated: the PDFs are the stored files. The ZIP is streamed, one PDF at a time and waiting for the
 * client to take each, so a large export holds a single PDF in memory and never blocks the API.
 */
@Injectable()
export class InvoiceExportService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  /** Streams the ZIP of the issuer's invoices to `output`, and ends it; stops if `output` closes first. */
  async writeTo(issuerId: string, output: Writable): Promise<void> {
    const listed = await this.invoices(issuerId);
    const zip = new Zip((error, chunk, final) => {
      if (error) output.destroy(error);
      else if (!output.destroyed) {
        output.write(chunk);
        if (final) output.end();
      }
    });

    const csv = new ZipDeflate(EXPORT_CSV_NAME, { level: 6 });
    zip.add(csv);
    csv.push(new TextEncoder().encode(invoiceExportCsv(listed.map(({ exported }) => exported))), true);

    for (const { exported, pdfKey } of listed) {
      if (pdfKey === null) continue;
      await drained(output);
      if (output.destroyed) return zip.terminate();
      const file = await this.storage.get(pdfKey);
      if (!file) throw new Error(`The PDF ${pdfKey} is missing from the object storage`);
      // A PDF is compressed already.
      const pdf = new ZipPassThrough(`${exported.number}.pdf`);
      zip.add(pdf);
      pdf.push(file.body, true);
    }
    zip.end();
  }

  /** The issuer's invoices, by issue date and then Issuance, with their latest record and current PDF. */
  private async invoices(issuerId: string): Promise<{ exported: ExportedInvoice; pdfKey: string | null }[]> {
    const record = this.db
      .selectDistinctOn([invoiceRecords.invoiceId], { invoiceId: invoiceRecords.invoiceId, status: invoiceRecords.status })
      .from(invoiceRecords)
      .where(eq(invoiceRecords.issuerId, issuerId))
      .orderBy(invoiceRecords.invoiceId, desc(invoiceRecords.createdAt))
      .as('record');
    const pdf = this.db
      .selectDistinctOn([invoicePdfs.invoiceId], { invoiceId: invoicePdfs.invoiceId, storageKey: invoicePdfs.storageKey })
      .from(invoicePdfs)
      .where(eq(invoicePdfs.issuerId, issuerId))
      .orderBy(invoicePdfs.invoiceId, desc(invoicePdfs.version))
      .as('pdf');
    const rows = await this.db
      .select({
        series: invoices.series,
        number: invoices.number,
        issueDate: invoices.issueDate,
        status: invoices.status,
        // Only what the CSV shows of the copy, the current one: with its withholding as corrected.
        recipientName: sql<string>`${invoices.snapshot} -> 'recipient' ->> 'name'`,
        recipientTaxId: sql<string>`${invoices.snapshot} -> 'recipient' ->> 'taxId'`,
        breakdown: sql<Breakdown>`${invoices.snapshot} -> 'breakdown'`,
        corrects: sql<string | null>`${invoices.snapshot} -> 'correction' -> 'invoice' ->> 'number'`,
        recordStatus: record.status,
        pdfKey: pdf.storageKey,
      })
      .from(invoices)
      .innerJoin(record, eq(record.invoiceId, invoices.id))
      .leftJoin(pdf, eq(pdf.invoiceId, invoices.id))
      .where(eq(invoices.issuerId, issuerId))
      .orderBy(asc(invoices.issueDate), asc(invoices.createdAt), asc(invoices.id));
    return rows.map((row) => ({
      exported: {
        number: invoiceNumberIn(row.series, row.number),
        issueDate: row.issueDate,
        status: row.status as InvoiceStatus,
        recordStatus: row.recordStatus as InvoiceRecordStatus,
        recipient: { name: row.recipientName, taxId: row.recipientTaxId },
        breakdown: row.breakdown,
        corrects: row.corrects,
      },
      pdfKey: row.pdfKey,
    }));
  }
}

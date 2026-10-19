import { z } from 'zod';
import { draftDataSchema } from './draft.js';
import type { InvoiceStatus } from './invoice.js';

// "Corregir retención" (ADR 0005): the IRPF withholding is not part of the InvoiceRecord, so an error
// only in it is the one change an issued invoice allows. It keeps its number and its record; its PDF
// gets a new version, and the earlier ones stay.

/**
 * Whether the invoice's withholding can be corrected: not voided (it is read only), and its latest
 * record has the QR the new PDF version carries.
 */
export function isWithholdingCorrectable(invoice: { status: InvoiceStatus; hasQr: boolean }): boolean {
  return invoice.status !== 'voided' && invoice.hasQr;
}

/** Body of POST /invoices/:id/withholding-correction: the right IRPF withholding. */
export const withholdingCorrectionSchema = z.object({ withholding: draftDataSchema.shape.withholding });

export type WithholdingCorrection = z.infer<typeof withholdingCorrectionSchema>;

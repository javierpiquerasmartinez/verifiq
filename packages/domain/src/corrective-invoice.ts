import { z } from 'zod';
import type { DraftLine } from './draft.js';
import type { InvoiceRecordStatus, InvoiceStatus } from './invoice.js';

// A corrective invoice (ADR 0005) corrects an issued one, always by differences: its lines are the
// difference, negative if it lowers the amounts. It goes in its own series, linked to the invoice it
// corrects, with that invoice's operation date. Its type (R1 or R4) follows from a plain-language reason.

/** Plain-language reasons the user picks when correcting an issued invoice. */
export const CORRECTION_REASONS = [
  'price_change',
  'production_recalculated',
  'vat_error',
  'amounts_or_data_error',
  'other',
] as const;

export type CorrectionReason = (typeof CORRECTION_REASONS)[number];

export const correctionReasonSchema = z.enum(CORRECTION_REASONS);

/** VeriFactu corrective invoice type: R1 for art. 80.One/Two/Six of the VAT Act or an error of law, R4 for the rest. */
export const CORRECTIVE_INVOICE_TYPES = ['R1', 'R4'] as const;

export type CorrectiveInvoiceType = (typeof CORRECTIVE_INVOICE_TYPES)[number];

/**
 * Reason → type table. Configuration pending validation by a tax adviser
 * (see docs/research/rectificativas-y-fechas.md), so keep every mapping here.
 */
const CORRECTION_REASON_CONFIG: Record<CorrectionReason, { label: string; type: CorrectiveInvoiceType }> = {
  price_change: { label: 'Descuento, devolución o cambio de precio posterior', type: 'R1' },
  production_recalculated: { label: 'La clínica ha recalculado la producción', type: 'R1' },
  vat_error: { label: 'Error al aplicar el IVA', type: 'R1' },
  amounts_or_data_error: { label: 'Error en importes o datos', type: 'R4' },
  other: { label: 'Otro motivo', type: 'R4' },
};

export function correctiveInvoiceTypeFor(reason: CorrectionReason): CorrectiveInvoiceType {
  return CORRECTION_REASON_CONFIG[reason].type;
}

export function correctionReasonLabel(reason: CorrectionReason): string {
  return CORRECTION_REASON_CONFIG[reason].label;
}

/** The user's own words on why the invoice is corrected: printed on the corrective invoice. */
export const correctionNoteSchema = z
  .string()
  .trim()
  .min(1, 'Explica en pocas palabras qué se corrige')
  .max(250, 'Como mucho 250 caracteres');

/** What a corrective draft or invoice corrects, and why. */
export const correctionSchema = z.object({
  type: z.enum(CORRECTIVE_INVOICE_TYPES),
  reason: correctionReasonSchema,
  note: z.string(),
  /** The corrected invoice. */
  invoice: z.object({ id: z.uuid(), number: z.string(), issueDate: z.iso.date() }),
});

export type Correction = z.infer<typeof correctionSchema>;

/**
 * Body of POST /invoices/:id/corrective-draft. With `total` ("Rectificar totalmente"), the draft starts
 * with every line of the invoice negated, cancelling its effect; otherwise, with no lines.
 */
export const newCorrectiveDraftSchema = z.object({
  reason: correctionReasonSchema,
  note: correctionNoteSchema,
  total: z.boolean().default(false),
});

export type NewCorrectiveDraft = z.output<typeof newCorrectiveDraftSchema>;
export type NewCorrectiveDraftInput = z.input<typeof newCorrectiveDraftSchema>;

/** The lines with their quantity negated: the difference that cancels them. Rounding is symmetric, so every amount negates. */
export function negatedLines<T extends DraftLine>(lines: T[]): T[] {
  return lines.map((line) => ({ ...line, quantity: negate(line.quantity) }));
}

function negate(value: string): string {
  if (value.startsWith('-')) return value.slice(1);
  return /^[0.]+$/.test(value) ? value : `-${value}`;
}

/**
 * Whether an invoice can be rectified: the AEAT must have it (accepted, even with errors) and it must
 * not be voided, as Voiding and rectification are never combined. It may already be rectified. A
 * corrective invoice is not rectified itself: its original is rectified again.
 */
export function isRectifiable(invoice: { status: InvoiceStatus; recordStatus: InvoiceRecordStatus; corrective: boolean }): boolean {
  return (
    !invoice.corrective &&
    (invoice.status === 'issued' || invoice.status === 'rectified') &&
    (invoice.recordStatus === 'accepted' || invoice.recordStatus === 'accepted-with-errors')
  );
}

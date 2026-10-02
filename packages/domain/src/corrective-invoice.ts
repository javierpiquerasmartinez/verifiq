import { z } from 'zod';

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
export type CorrectiveInvoiceType = 'R1' | 'R4';

/**
 * Reason → type table. Configuration pending validation by a tax adviser
 * (see docs/research/rectificativas-y-fechas.md), so keep every mapping here.
 */
const CORRECTION_REASON_CONFIG: Record<CorrectionReason, { label: string; type: CorrectiveInvoiceType }> = {
  price_change: { label: 'Descuento, devolución o cambio de precio posterior', type: 'R1' },
  production_recalculated: { label: 'La clínica ha recalculado la producción', type: 'R1' },
  vat_error: { label: 'Error al aplicar el IVA', type: 'R1' },
  amounts_or_data_error: { label: 'Error en importes o datos', type: 'R4' },
  other: { label: 'Otro reason', type: 'R4' },
};

export function correctiveInvoiceTypeFor(reason: CorrectionReason): CorrectiveInvoiceType {
  return CORRECTION_REASON_CONFIG[reason].type;
}

export function correctionReasonLabel(reason: CorrectionReason): string {
  return CORRECTION_REASON_CONFIG[reason].label;
}

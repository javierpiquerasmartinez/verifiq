import { z } from 'zod';

/** Plain-language reasons the Usuario picks when rectifying an issued invoice. */
export const RECTIFICATION_REASONS = [
  'price_change',
  'production_recalculated',
  'iva_error',
  'amounts_or_data_error',
  'other',
] as const;

export type RectificationReason = (typeof RECTIFICATION_REASONS)[number];

export const rectificationReasonSchema = z.enum(RECTIFICATION_REASONS);

/** VeriFactu rectificativa type: R1 for art. 80.Uno/Dos/Seis LIVA or an error of law, R4 for the rest. */
export type RectificationType = 'R1' | 'R4';

/**
 * Reason → type table. Configuration pending validation by a tax adviser
 * (see docs/research/rectificativas-y-fechas.md), so keep every mapping here.
 */
const RECTIFICATION_REASON_CONFIG: Record<RectificationReason, { label: string; type: RectificationType }> = {
  price_change: { label: 'Descuento, devolución o cambio de precio posterior', type: 'R1' },
  production_recalculated: { label: 'La clínica ha recalculado la producción', type: 'R1' },
  iva_error: { label: 'Error al aplicar el IVA', type: 'R1' },
  amounts_or_data_error: { label: 'Error en importes o datos', type: 'R4' },
  other: { label: 'Otro motivo', type: 'R4' },
};

export function rectificationTypeFor(reason: RectificationReason): RectificationType {
  return RECTIFICATION_REASON_CONFIG[reason].type;
}

export function rectificationReasonLabel(reason: RectificationReason): string {
  return RECTIFICATION_REASON_CONFIG[reason].label;
}

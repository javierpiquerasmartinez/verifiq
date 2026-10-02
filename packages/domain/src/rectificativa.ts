import { z } from 'zod';

/** Plain-language reasons the Usuario picks when rectifying an issued invoice. */
export const MOTIVOS_RECTIFICACION = [
  'cambio_de_precio',
  'recalculo_de_produccion',
  'error_de_iva',
  'error_en_importes_o_datos',
  'otro',
] as const;

export type MotivoRectificacion = (typeof MOTIVOS_RECTIFICACION)[number];

export const motivoRectificacionSchema = z.enum(MOTIVOS_RECTIFICACION);

/** VeriFactu rectificativa type: R1 for art. 80.Uno/Dos/Seis LIVA or an error of law, R4 for the rest. */
export type TipoRectificativa = 'R1' | 'R4';

/**
 * Motivo → tipo table. Configuration pending validation by a tax adviser
 * (see docs/research/rectificativas-y-fechas.md), so keep every mapping here.
 */
const MOTIVOS_RECTIFICACION_CONFIG: Record<MotivoRectificacion, { label: string; type: TipoRectificativa }> = {
  cambio_de_precio: { label: 'Descuento, devolución o cambio de precio posterior', type: 'R1' },
  recalculo_de_produccion: { label: 'La clínica ha recalculado la producción', type: 'R1' },
  error_de_iva: { label: 'Error al aplicar el IVA', type: 'R1' },
  error_en_importes_o_datos: { label: 'Error en importes o datos', type: 'R4' },
  otro: { label: 'Otro motivo', type: 'R4' },
};

export function tipoRectificativaPara(motivo: MotivoRectificacion): TipoRectificativa {
  return MOTIVOS_RECTIFICACION_CONFIG[motivo].type;
}

export function motivoRectificacionLabel(motivo: MotivoRectificacion): string {
  return MOTIVOS_RECTIFICACION_CONFIG[motivo].label;
}

import { describe, expect, it } from 'vitest';
import {
  MOTIVOS_RECTIFICACION,
  motivoRectificacionLabel,
  motivoRectificacionSchema,
  tipoRectificativaPara,
} from './rectificativa.js';

describe('tipoRectificativaPara', () => {
  it.each([
    ['cambio_de_precio', 'R1'],
    ['recalculo_de_produccion', 'R1'],
    ['error_de_iva', 'R1'],
    ['error_en_importes_o_datos', 'R4'],
    ['otro', 'R4'],
  ] as const)('maps %s to %s', (motivo, type) => {
    expect(tipoRectificativaPara(motivo)).toBe(type);
  });

  it.each(MOTIVOS_RECTIFICACION)('%s has a plain-language label', (motivo) => {
    expect(motivoRectificacionLabel(motivo)).not.toBe('');
  });

  it('only accepts known reasons', () => {
    expect(motivoRectificacionSchema.safeParse('otro').success).toBe(true);
    expect(motivoRectificacionSchema.safeParse('R1').success).toBe(false);
  });
});

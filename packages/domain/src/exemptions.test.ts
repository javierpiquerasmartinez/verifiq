import { describe, expect, it } from 'vitest';
import { SUPUESTO_EXENCION_IDS, supuestoExencion, supuestoExencionSchema } from './exemptions.js';

describe('Supuestos de exención', () => {
  it('includes dentistry with its legal mention under art. 20.Uno.5º LIVA', () => {
    expect(supuestoExencion('odontologia')).toEqual({
      label: 'Servicios sanitarios — odontología (art. 20.Uno.5º LIVA)',
      mention:
        'Operación exenta de IVA en virtud del artículo 20.Uno.5º de la Ley 37/1992, del Impuesto sobre el Valor Añadido.',
      verifactuCode: 'E1',
    });
  });

  it.each(SUPUESTO_EXENCION_IDS)('%s is coded as E1 and carries a mention', (id) => {
    const supuesto = supuestoExencion(id);
    expect(supuesto.verifactuCode).toBe('E1');
    expect(supuesto.mention).toMatch(/artículo 20/);
  });

  it('is a closed catalogue', () => {
    expect(supuestoExencionSchema.safeParse('odontologia').success).toBe(true);
    expect(supuestoExencionSchema.safeParse('medicina').success).toBe(false);
  });
});

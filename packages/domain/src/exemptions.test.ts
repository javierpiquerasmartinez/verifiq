import { describe, expect, it } from 'vitest';
import { EXEMPTION_GROUND_IDS, exemptionGround, exemptionGroundSchema } from './exemptions.js';

describe('Exemption grounds', () => {
  it('includes dentistry with its legal mention under art. 20.One.5 of the VAT Act', () => {
    expect(exemptionGround('dentistry')).toEqual({
      label: 'Servicios sanitarios — odontología (art. 20.Uno.5º LIVA)',
      mention:
        'Operación exenta de IVA en virtud del artículo 20.Uno.5º de la Ley 37/1992, del Impuesto sobre el Valor Añadido.',
      verifactuCode: 'E1',
    });
  });

  it.each(EXEMPTION_GROUND_IDS)('%s is coded as E1 and carries a mention', (id) => {
    const ground = exemptionGround(id);
    expect(ground.verifactuCode).toBe('E1');
    expect(ground.mention).toMatch(/artículo 20/);
  });

  it('is a closed catalogue', () => {
    expect(exemptionGroundSchema.safeParse('dentistry').success).toBe(true);
    expect(exemptionGroundSchema.safeParse('medicina').success).toBe(false);
  });
});

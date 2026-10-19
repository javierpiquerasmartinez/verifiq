import { describe, expect, it } from 'vitest';
import { EXEMPTION_GROUND_IDS, exemptionGround, exemptionGroundSchema } from './exemptions.js';

const mentionOf = (precept: string) =>
  `Operación exenta de IVA en virtud del ${precept} de la Ley 37/1992, del Impuesto sobre el Valor Añadido.`;

describe('Exemption grounds', () => {
  it('lists the art. 20 exemptions a freelancer may invoice, ending with the generic one', () => {
    expect(EXEMPTION_GROUND_IDS).toEqual([
      'healthcare',
      'dentistry',
      'education',
      'privateTuition',
      'insuranceMediation',
      'authorsAndArtists',
      'otherArticle20',
    ]);
  });

  it.each([
    ['healthcare', 'artículo 20.Uno.3º', 'Servicios sanitarios'],
    ['dentistry', 'artículo 20.Uno.5º', 'Servicios odontológicos'],
    ['education', 'artículo 20.Uno.9º', 'Servicios de enseñanza'],
    ['privateTuition', 'artículo 20.Uno.10º', 'Clases particulares'],
    ['insuranceMediation', 'artículo 20.Uno.16º', 'Servicios de mediación de seguros'],
    ['authorsAndArtists', 'artículo 20.Uno.26º', 'Servicios profesionales'],
  ] as const)('%s cites %s of the VAT Act and calls its services «%s»', (id, precept, services) => {
    const ground = exemptionGround(id);
    expect(ground.mention).toBe(mentionOf(precept));
    expect(ground.services).toBe(services);
    expect(ground.label).toContain(`(art. ${precept.slice('artículo '.length)} LIVA)`);
    expect(ground.help).toBeUndefined();
  });

  it('the generic ground only says the operation is exempt under art. 20, and warns it is not for foreign clients', () => {
    expect(exemptionGround('otherArticle20')).toEqual({
      label: 'Otra exención del art. 20 LIVA',
      mention: mentionOf('artículo 20'),
      services: 'Servicios profesionales',
      help: 'Solo para exenciones del artículo 20. Las facturas a clientes extranjeros todavía no están disponibles en Verifiq.',
      verifactuCode: 'E1',
    });
  });

  it.each(EXEMPTION_GROUND_IDS)('%s is coded as E1 for VeriFactu', (id) => {
    expect(exemptionGround(id).verifactuCode).toBe('E1');
  });

  it('is a closed catalogue that still accepts dentistry, the ground saved before it grew', () => {
    expect(exemptionGroundSchema.safeParse('dentistry').success).toBe(true);
    expect(exemptionGroundSchema.safeParse('medicina').success).toBe(false);
  });
});

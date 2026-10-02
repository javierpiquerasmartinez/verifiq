import { describe, expect, it } from 'vitest';
import { emisorDefaultsSchema, fiscalDataSchema } from './emisor.js';

const valid = {
  name: 'Lucía Ferrer Albiol',
  nif: '24387612E',
  address: 'Carrer de Colón 12, 3º 2ª',
  postalCode: '46004',
  municipality: 'València',
  province: 'Valencia',
};

describe('fiscalDataSchema', () => {
  it('accepts the required data alone, leaving the optional fields empty', () => {
    expect(fiscalDataSchema.parse(valid)).toEqual({
      ...valid,
      email: null,
      phone: null,
      iban: null,
    });
  });

  it('normalises the NIF and the IBAN, and trims the text', () => {
    const parsed = fiscalDataSchema.parse({
      ...valid,
      name: '  Lucía Ferrer Albiol ',
      nif: '24.387.612-e',
      email: ' lucia@example.com ',
      phone: '+34 600 123 456',
      iban: 'es91 2100 0418 4502 0005 1332',
    });

    expect(parsed).toMatchObject({
      name: 'Lucía Ferrer Albiol',
      nif: '24387612E',
      email: 'lucia@example.com',
      phone: '+34 600 123 456',
      iban: 'ES9121000418450200051332',
    });
  });

  it('treats blank optional fields as not given', () => {
    const parsed = fiscalDataSchema.parse({ ...valid, email: '', phone: '  ', iban: '' });

    expect(parsed).toMatchObject({ email: null, phone: null, iban: null });
  });

  it.each([
    ['a NIF with the wrong letter', { nif: '24387612A' }],
    ['a blank name', { name: ' ' }],
    ['a name longer than VeriFactu allows', { name: 'x'.repeat(121) }],
    ['no fiscal address', { address: '' }],
    ['a short postal code', { postalCode: '4600' }],
    ['a postal code outside the Spanish provinces', { postalCode: '53001' }],
    ['a postal code of province 00', { postalCode: '00001' }],
    ['no municipality', { municipality: '' }],
    ['no province', { province: '' }],
    ['a malformed email', { email: 'lucia@' }],
    ['a phone without digits', { phone: 'llámame' }],
    ['an IBAN with wrong check digits', { iban: 'ES9121000418450200051333' }],
  ])('rejects %s', (_, change) => {
    expect(fiscalDataSchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});

describe('emisorDefaultsSchema', () => {
  it.each([
    { retencionIrpf: 15, iva: { kind: 'taxed', rate: 21 } },
    { retencionIrpf: 7, iva: { kind: 'taxed', rate: 0 } },
    { retencionIrpf: 0, iva: { kind: 'exempt', supuesto: 'odontologia' } },
  ])('accepts %j', (defaults) => {
    expect(emisorDefaultsSchema.parse(defaults)).toEqual(defaults);
  });

  it.each([
    ['a Retención de IRPF outside 15/7/0', { retencionIrpf: 19, iva: { kind: 'taxed', rate: 21 } }],
    ['an IVA rate outside 21/10/4/0', { retencionIrpf: 15, iva: { kind: 'taxed', rate: 16 } }],
    ['Exenta without a Supuesto de exención', { retencionIrpf: 15, iva: { kind: 'exempt' } }],
    ['no IVA', { retencionIrpf: 15 }],
  ])('rejects %s', (_, defaults) => {
    expect(emisorDefaultsSchema.safeParse(defaults).success).toBe(false);
  });
});

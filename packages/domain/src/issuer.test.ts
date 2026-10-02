import { describe, expect, it } from 'vitest';
import { issuerDefaultsSchema, fiscalDataSchema } from './issuer.js';

const valid = {
  name: 'Lucía Ferrer Albiol',
  taxId: '24387612E',
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
      taxId: '24.387.612-e',
      email: ' lucia@example.com ',
      phone: '+34 600 123 456',
      iban: 'es91 2100 0418 4502 0005 1332',
    });

    expect(parsed).toMatchObject({
      name: 'Lucía Ferrer Albiol',
      taxId: '24387612E',
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
    ['a NIF with the wrong letter', { taxId: '24387612A' }],
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

describe('issuerDefaultsSchema', () => {
  it.each([
    { withholding: 15, vat: { kind: 'taxed', rate: 21 } },
    { withholding: 7, vat: { kind: 'taxed', rate: 0 } },
    { withholding: 0, vat: { kind: 'exempt', ground: 'dentistry' } },
  ])('accepts %j', (defaults) => {
    expect(issuerDefaultsSchema.parse(defaults)).toEqual(defaults);
  });

  it.each([
    ['a withholding outside 15/7/0', { withholding: 19, vat: { kind: 'taxed', rate: 21 } }],
    ['a VAT rate outside 21/10/4/0', { withholding: 15, vat: { kind: 'taxed', rate: 16 } }],
    ['exempt without an exemption ground', { withholding: 15, vat: { kind: 'exempt' } }],
    ['no VAT', { withholding: 15 }],
  ])('rejects %s', (_, defaults) => {
    expect(issuerDefaultsSchema.safeParse(defaults).success).toBe(false);
  });
});

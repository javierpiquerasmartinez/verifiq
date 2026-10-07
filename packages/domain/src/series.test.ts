import { describe, expect, it } from 'vitest';
import { invoiceNumber, seriesCode, seriesSchema, splitInvoiceNumber } from './series.js';

describe('seriesCode', () => {
  it('appends the year to the prefix', () => {
    expect(seriesCode('F', 2026)).toBe('F2026-');
    expect(seriesCode('VQR', 2027)).toBe('VQR2027-');
  });
});

describe('invoiceNumber', () => {
  it.each([
    [1, 'F2026-0001'],
    [14, 'F2026-0014'],
    [9999, 'F2026-9999'],
    [10000, 'F2026-10000'],
  ])('numbers invoice %i of the series as %s', (number, expected) => {
    expect(invoiceNumber('F', 2026, number)).toBe(expected);
  });
});

describe('splitInvoiceNumber', () => {
  it.each([
    ['F2026-0009', { series: 'F2026-', number: '0009' }],
    ['R2026-10000', { series: 'R2026-', number: '10000' }],
    ['VQ2R2027-0001', { series: 'VQ2R2027-', number: '0001' }],
  ])('splits %s into its series and its correlative number', (number, expected) => {
    expect(splitInvoiceNumber(number)).toEqual(expected);
  });
});

describe('seriesSchema', () => {
  it('normalises both prefixes to uppercase without spaces', () => {
    expect(seriesSchema.parse({ prefix: ' vq ', correctivePrefix: 'vqr' })).toEqual({
      prefix: 'VQ',
      correctivePrefix: 'VQR',
    });
  });

  it.each([
    ['the same prefix for both', { prefix: 'F', correctivePrefix: 'F' }],
    ['the same prefix in another case', { prefix: 'f', correctivePrefix: 'F' }],
    ['an empty prefix', { prefix: '', correctivePrefix: 'R' }],
    ['a symbol', { prefix: 'F-', correctivePrefix: 'R' }],
    ['more than 10 characters', { prefix: 'INVOICESVQ1', correctivePrefix: 'R' }],
    ['a non-ASCII letter', { prefix: 'Ñ', correctivePrefix: 'R' }],
    ['a leading digit, which would blur into the year', { prefix: '1F', correctivePrefix: 'R' }],
    ['a trailing digit, which would blur into the year', { prefix: 'F2', correctivePrefix: 'R' }],
  ])('rejects %s', (_, input) => {
    expect(seriesSchema.safeParse(input).success).toBe(false);
  });
});

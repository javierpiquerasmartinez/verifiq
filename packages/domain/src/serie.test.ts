import { describe, expect, it } from 'vitest';
import { invoiceNumber, serieCode, seriesSchema } from './serie.js';

describe('serieCode', () => {
  it('appends the year to the prefix', () => {
    expect(serieCode('F', 2026)).toBe('F2026-');
    expect(serieCode('VQR', 2027)).toBe('VQR2027-');
  });
});

describe('invoiceNumber', () => {
  it.each([
    [1, 'F2026-0001'],
    [14, 'F2026-0014'],
    [9999, 'F2026-9999'],
    [10000, 'F2026-10000'],
  ])('numbers invoice %i of the Serie as %s', (number, expected) => {
    expect(invoiceNumber('F', 2026, number)).toBe(expected);
  });
});

describe('seriesSchema', () => {
  it('normalises both prefixes to uppercase without spaces', () => {
    expect(seriesSchema.parse({ prefix: ' vq ', rectificativaPrefix: 'vqr' })).toEqual({
      prefix: 'VQ',
      rectificativaPrefix: 'VQR',
    });
  });

  it.each([
    ['the same prefix for both', { prefix: 'F', rectificativaPrefix: 'F' }],
    ['the same prefix in another case', { prefix: 'f', rectificativaPrefix: 'F' }],
    ['an empty prefix', { prefix: '', rectificativaPrefix: 'R' }],
    ['a symbol', { prefix: 'F-', rectificativaPrefix: 'R' }],
    ['more than 10 characters', { prefix: 'FACTURASVQ1', rectificativaPrefix: 'R' }],
    ['a non-ASCII letter', { prefix: 'Ñ', rectificativaPrefix: 'R' }],
    ['a leading digit, which would blur into the year', { prefix: '1F', rectificativaPrefix: 'R' }],
    ['a trailing digit, which would blur into the year', { prefix: 'F2', rectificativaPrefix: 'R' }],
  ])('rejects %s', (_, input) => {
    expect(seriesSchema.safeParse(input).success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { invoiceNumber, seriesCode, seriesSchema } from './series.js';

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

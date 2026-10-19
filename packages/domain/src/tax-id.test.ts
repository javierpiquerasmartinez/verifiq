import { describe, expect, it } from 'vitest';
import { parseTaxId, taxIdSchema } from './tax-id.js';

describe('parseTaxId', () => {
  it.each([
    ['12345678Z', 'NIF'],
    ['00000000T', 'NIF'],
    ['99999999R', 'NIF'],
    ['K1234567L', 'NIF'],
    ['L1234567L', 'NIF'],
    ['M1234567L', 'NIF'],
    ['X1234567L', 'NIE'],
    ['Y1234567X', 'NIE'],
    ['Z1234567R', 'NIE'],
    ['B12345674', 'CIF'],
    ['A58818501', 'CIF'],
    ['Q2826000H', 'CIF'],
    ['P1234567D', 'CIF'],
    ['G12345674', 'CIF'],
    ['G1234567D', 'CIF'],
  ])('accepts %s as a valid %s', (input, kind) => {
    expect(parseTaxId(input)).toEqual({ valid: true, kind, value: input });
  });

  it.each([
    ['12345678A', 'wrong NIF letter'],
    ['1234567Z', 'NIF too short'],
    ['123456789Z', 'NIF too long'],
    ['12345678', 'NIF without letter'],
    ['K1234567A', 'wrong K-NIF letter'],
    ['X1234567A', 'wrong NIE letter'],
    ['W12345678', 'NIE with an unknown prefix'],
    ['X123456L', 'NIE too short'],
    ['B12345675', 'wrong CIF control digit'],
    ['B1234567D', 'letter control on a CIF that requires a digit'],
    ['P12345674', 'digit control on a CIF that requires a letter'],
    ['G1234567E', 'wrong CIF control letter'],
    ['I12345674', 'CIF with an unknown entity letter'],
    ['', 'empty'],
    ['ABCDEFGHI', 'letters only'],
  ])('rejects %s (%s)', (input) => {
    expect(parseTaxId(input)).toEqual({ valid: false });
  });

  it('normalises case, spaces, dots and hyphens', () => {
    expect(parseTaxId(' 12.345.678-z ')).toEqual({ valid: true, kind: 'NIF', value: '12345678Z' });
    expect(parseTaxId('x-1234567-l')).toEqual({ valid: true, kind: 'NIE', value: 'X1234567L' });
    expect(parseTaxId('b 1234567 4')).toEqual({ valid: true, kind: 'CIF', value: 'B12345674' });
  });
});

describe('taxIdSchema', () => {
  it('outputs the normalised identifier', () => {
    expect(taxIdSchema.parse(' 12345678-z')).toBe('12345678Z');
  });

  it('fails for an invalid identifier', () => {
    expect(taxIdSchema.safeParse('12345678A').success).toBe(false);
  });
});

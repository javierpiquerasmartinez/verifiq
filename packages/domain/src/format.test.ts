import { describe, expect, it } from 'vitest';
import { formatAmount, formatIban, formatWithheld } from './format.js';

describe('formatAmount', () => {
  it.each([
    ['5140.00', '5.140,00 €'],
    ['4369.00', '4.369,00 €'],
    ['1234567.89', '1.234.567,89 €'],
    ['999.99', '999,99 €'],
    ['0.00', '0,00 €'],
    ['-771.00', '−771,00 €'],
    ['2340', '2.340,00 €'],
    ['2340.5', '2.340,50 €'],
    ['33.3333', '33,3333 €'],
  ])('formats %s as %s', (amount, expected) => {
    expect(formatAmount(amount)).toBe(expected);
  });
});

describe('formatWithheld', () => {
  it('shows the withholding negative, unless there is none', () => {
    expect(formatWithheld('613.50')).toBe('−613,50 €');
    expect(formatWithheld('0.00')).toBe('0,00 €');
  });
});

describe('formatIban', () => {
  it('groups the IBAN in fours', () => {
    expect(formatIban('ES9121000418450200051332')).toBe('ES91 2100 0418 4502 0005 1332');
  });
});

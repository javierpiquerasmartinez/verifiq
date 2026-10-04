import { describe, expect, it } from 'vitest';
import { decimalInputOf, parseDecimalInput } from './format';

describe('parseDecimalInput', () => {
  it.each([
    ['2340', '2340'],
    ['2340,5', '2340.5'],
    ['2.340,50', '2340.50'],
    ['1.234.567,8', '1234567.8'],
    ['2.340', '2340'],
    ['10.5', '10.5'],
    ['0,1234', '0.1234'],
    [' 1 650,00 ', '1650.00'],
    ['', '0'],
    ['12,', '12'],
  ])('reads %j as %j', (input, expected) => {
    expect(parseDecimalInput(input, 4)).toBe(expected);
  });

  it.each(['abc', '1,2,3', '1,23456', '-5', '1.23.4'])('refuses %j', (input) => {
    expect(parseDecimalInput(input, 4)).toBeNull();
  });

  it('refuses more decimals than allowed', () => {
    expect(parseDecimalInput('1,234', 2)).toBeNull();
  });
});

describe('decimalInputOf', () => {
  it('shows a decimal string the way it is typed in Spain', () => {
    expect(decimalInputOf('2340.5000')).toBe('2340,5000');
    expect(decimalInputOf('1')).toBe('1');
  });
});

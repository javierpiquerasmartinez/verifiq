import { describe, expect, it } from 'vitest';
import { decimalInputOf, formatDate, formatDateTime, parseDecimalInput } from './format';

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

  it.each([
    ['-5', '-5'],
    ['−2.340,50', '-2340.50'],
    ['- 1', '-1'],
    ['-0', '0'],
    ['5', '5'],
  ])('reads %j as %j where negatives are allowed', (input, expected) => {
    expect(parseDecimalInput(input, 4, { signed: true })).toBe(expected);
  });

  it.each(['--5', '5-', '-'])('refuses %j where negatives are allowed', (input) => {
    expect(parseDecimalInput(input, 4, { signed: true })).toBeNull();
  });
});

describe('decimalInputOf', () => {
  it('shows a decimal string the way it is typed in Spain', () => {
    expect(decimalInputOf('2340.5000')).toBe('2340,5000');
    expect(decimalInputOf('1')).toBe('1');
  });
});

describe('formatDateTime', () => {
  it.each([
    // Summer time: UTC+2.
    ['2026-08-01T08:42:10.000Z', '01/08/2026 · 10:42'],
    // Winter time, and a day that changes at Madrid's midnight.
    ['2026-12-31T23:05:00.000Z', '01/01/2027 · 00:05'],
  ])('shows %j in Spanish time as %j', (instant, expected) => {
    expect(formatDateTime(instant)).toBe(expected);
  });
});

describe('formatDate', () => {
  it('shows the day in Spanish time', () => {
    expect(formatDate('2026-07-14T08:00:00.000Z')).toBe('14/07/2026');
    expect(formatDate('2026-12-31T23:05:00.000Z')).toBe('01/01/2027');
  });
});

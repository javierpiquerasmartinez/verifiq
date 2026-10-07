import { describe, expect, it } from 'vitest';
import { computeBreakdown, withWithholding, type BreakdownInput } from './amounts.js';
import { isWithholdingCorrectable } from './withholding-correction.js';

describe('withWithholding', () => {
  const lines: BreakdownInput['lines'] = [
    { quantity: '1', unitPrice: '2340', vat: { kind: 'exempt', ground: 'dentistry' } },
    { quantity: '3', unitPrice: '120.55', vat: { kind: 'exempt', ground: 'dentistry' } },
    { quantity: '1', unitPrice: '100', vat: { kind: 'taxed', rate: 21 } },
  ];

  it.each([
    [15, 7],
    [15, 0],
    [0, 15],
    [7, 15],
  ] as const)('changes a %i %% withholding to %i %% as if the invoice had always had it', (before, after) => {
    const breakdown = computeBreakdown({ lines, withholding: before });
    expect(withWithholding(breakdown, after)).toEqual(computeBreakdown({ lines, withholding: after }));
  });

  it('rounds the withholding of a corrective invoice away from zero, like its Issuance', () => {
    const negated = lines.map((line) => ({ ...line, quantity: `-${line.quantity}` }));
    expect(withWithholding(computeBreakdown({ lines: negated, withholding: 15 }), 7)).toEqual(
      computeBreakdown({ lines: negated, withholding: 7 }),
    );
  });

  it('changes nothing but the withholding and the total to pay', () => {
    const breakdown = computeBreakdown({ lines, withholding: 15 });
    const { withholding, amountDue, ...rest } = withWithholding(breakdown, 7);
    expect({ ...breakdown, ...rest }).toEqual(breakdown);
    // 7 % of the 2801.65 tax base, off the 2822.65 total amount.
    expect(withholding).toEqual({ rate: 7, amount: '196.12' });
    expect(amountDue).toBe('2626.53');
  });
});

describe('isWithholdingCorrectable', () => {
  it.each(['issued', 'rectified'] as const)('corrects an %s invoice whose record has its QR', (status) => {
    expect(isWithholdingCorrectable({ status, hasQr: true })).toBe(true);
  });

  it('never corrects a voided invoice: it is read only', () => {
    expect(isWithholdingCorrectable({ status: 'voided', hasQr: true })).toBe(false);
  });

  it('waits for the QR its new PDF version carries', () => {
    expect(isWithholdingCorrectable({ status: 'issued', hasQr: false })).toBe(false);
  });
});

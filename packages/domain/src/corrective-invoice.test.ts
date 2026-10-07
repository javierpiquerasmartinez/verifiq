import { describe, expect, it } from 'vitest';
import { computeBreakdown } from './amounts.js';
import {
  CORRECTION_REASONS,
  correctionReasonLabel,
  correctionReasonSchema,
  correctiveInvoiceTypeFor,
  isRectifiable,
  negatedLines,
} from './corrective-invoice.js';

describe('correctiveInvoiceTypeFor', () => {
  it.each([
    ['price_change', 'R1'],
    ['production_recalculated', 'R1'],
    ['vat_error', 'R1'],
    ['amounts_or_data_error', 'R4'],
    ['other', 'R4'],
  ] as const)('maps %s to %s', (reason, type) => {
    expect(correctiveInvoiceTypeFor(reason)).toBe(type);
  });

  it.each(CORRECTION_REASONS)('%s has a plain-language label', (reason) => {
    expect(correctionReasonLabel(reason)).not.toBe('');
  });

  it('labels the residual reason in Spanish', () => {
    expect(correctionReasonLabel('other')).toBe('Otro motivo');
  });

  it('only accepts known reasons', () => {
    expect(correctionReasonSchema.safeParse('other').success).toBe(true);
    expect(correctionReasonSchema.safeParse('R1').success).toBe(false);
  });
});

describe('negatedLines', () => {
  const exempt = { kind: 'exempt', ground: 'dentistry' } as const;
  const lines = [
    { concept: 'Endodoncias', quantity: '3', unitPrice: '120.5', discountPercent: '10', vat: exempt },
    { concept: 'Material', quantity: '1', unitPrice: '33.3333', vat: { kind: 'taxed', rate: 21 } as const },
    { concept: 'Sin cantidad', quantity: '0', unitPrice: '50', vat: exempt },
  ];

  it('negates the quantity of every line and keeps the rest', () => {
    expect(negatedLines(lines)).toEqual([
      { concept: 'Endodoncias', quantity: '-3', unitPrice: '120.5', discountPercent: '10', vat: exempt },
      { concept: 'Material', quantity: '-1', unitPrice: '33.3333', vat: { kind: 'taxed', rate: 21 } },
      { concept: 'Sin cantidad', quantity: '0', unitPrice: '50', vat: exempt },
    ]);
  });

  it('turns a negative line positive again', () => {
    expect(negatedLines(negatedLines(lines))).toEqual(lines);
  });

  it('negates every amount of the breakdown, roundings included', () => {
    const original = computeBreakdown({ lines, withholding: 15 });
    const negated = computeBreakdown({ lines: negatedLines(lines), withholding: 15 });
    const negate = (amount: string) => (amount === '0.00' ? amount : amount.startsWith('-') ? amount.slice(1) : `-${amount}`);
    expect(negated.totalAmount).toBe(negate(original.totalAmount));
    expect(negated.amountDue).toBe(negate(original.amountDue));
    expect(negated.withholding.amount).toBe(negate(original.withholding.amount));
    expect(negated.taxed.map(({ taxAmount }) => taxAmount)).toEqual(original.taxed.map(({ taxAmount }) => negate(taxAmount)));
  });
});

describe('isRectifiable', () => {
  const accepted = { status: 'issued', recordStatus: 'accepted', corrective: false } as const;

  it('rectifies an invoice the AEAT has, even with errors or already rectified', () => {
    expect(isRectifiable(accepted)).toBe(true);
    expect(isRectifiable({ ...accepted, recordStatus: 'accepted-with-errors' })).toBe(true);
    expect(isRectifiable({ ...accepted, status: 'rectified' })).toBe(true);
  });

  it('never rectifies a voided invoice: Voiding and rectification are never combined', () => {
    expect(isRectifiable({ ...accepted, status: 'voided' })).toBe(false);
  });

  it.each(['pending-submission', 'submitted', 'rejected', 'blocked'] as const)(
    'waits for the AEAT to have the invoice: not while its record is %s',
    (recordStatus) => {
      expect(isRectifiable({ ...accepted, recordStatus })).toBe(false);
    },
  );

  it('corrects a corrective invoice through its original instead', () => {
    expect(isRectifiable({ ...accepted, corrective: true })).toBe(false);
  });
});

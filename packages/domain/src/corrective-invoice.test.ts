import { describe, expect, it } from 'vitest';
import {
  CORRECTION_REASONS,
  correctionReasonLabel,
  correctionReasonSchema,
  correctiveInvoiceTypeFor,
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

  it('only accepts known reasons', () => {
    expect(correctionReasonSchema.safeParse('other').success).toBe(true);
    expect(correctionReasonSchema.safeParse('R1').success).toBe(false);
  });
});

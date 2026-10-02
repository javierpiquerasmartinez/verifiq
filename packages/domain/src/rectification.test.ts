import { describe, expect, it } from 'vitest';
import {
  RECTIFICATION_REASONS,
  rectificationReasonLabel,
  rectificationReasonSchema,
  rectificationTypeFor,
} from './rectification.js';

describe('rectificationTypeFor', () => {
  it.each([
    ['price_change', 'R1'],
    ['production_recalculated', 'R1'],
    ['iva_error', 'R1'],
    ['amounts_or_data_error', 'R4'],
    ['other', 'R4'],
  ] as const)('maps %s to %s', (reason, type) => {
    expect(rectificationTypeFor(reason)).toBe(type);
  });

  it.each(RECTIFICATION_REASONS)('%s has a plain-language label', (reason) => {
    expect(rectificationReasonLabel(reason)).not.toBe('');
  });

  it('only accepts known reasons', () => {
    expect(rectificationReasonSchema.safeParse('other').success).toBe(true);
    expect(rectificationReasonSchema.safeParse('R1').success).toBe(false);
  });
});

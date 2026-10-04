import { describe, expect, it } from 'vitest';
import { isRecordUnconfirmed } from './invoice.js';

describe('isRecordUnconfirmed', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

  it('is a record still awaiting its verdict 24 h after the Issuance', () => {
    expect(isRecordUnconfirmed('submitted', hoursAgo(24), now)).toBe(true);
    expect(isRecordUnconfirmed('pending-submission', hoursAgo(30), now)).toBe(true);
    expect(isRecordUnconfirmed('submitted', hoursAgo(23.9), now)).toBe(false);
  });

  it('never is a record with a verdict, or blocked', () => {
    for (const status of ['accepted', 'accepted-with-errors', 'rejected', 'blocked'] as const) {
      expect(isRecordUnconfirmed(status, hoursAgo(48), now)).toBe(false);
    }
  });
});

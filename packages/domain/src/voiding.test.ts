import { describe, expect, it } from 'vitest';
import { canResendVoiding, isVoidable, voidingFlagsOf } from './voiding.js';

describe('isVoidable', () => {
  const accepted = { status: 'issued', recordStatus: 'accepted', corrective: false } as const;

  it.each(['accepted', 'accepted-with-errors', 'rejected', 'blocked'] as const)(
    'voids an issued invoice whose record is %s',
    (recordStatus) => {
      expect(isVoidable({ ...accepted, recordStatus })).toBe(true);
    },
  );

  it.each(['pending-submission', 'submitted'] as const)('waits for the AEAT’s verdict: not while its record is %s', (recordStatus) => {
    expect(isVoidable({ ...accepted, recordStatus })).toBe(false);
  });

  it('never voids a rectified invoice: Voiding and rectification are never combined', () => {
    expect(isVoidable({ ...accepted, status: 'rectified' })).toBe(false);
  });

  it('voids an invoice once', () => {
    expect(isVoidable({ ...accepted, status: 'voided' })).toBe(false);
  });

  it('never voids a corrective invoice', () => {
    expect(isVoidable({ ...accepted, corrective: true })).toBe(false);
  });
});

describe('canResendVoiding', () => {
  it.each(['blocked', 'rejected'] as const)('sends again a Voiding that is %s', (recordStatus) => {
    expect(canResendVoiding({ status: 'voided', recordStatus, voiding: true })).toBe(true);
  });

  it.each(['pending-submission', 'submitted', 'accepted'] as const)('not a Voiding that is %s', (recordStatus) => {
    expect(canResendVoiding({ status: 'voided', recordStatus, voiding: true })).toBe(false);
  });

  it('only resends a Voiding', () => {
    expect(canResendVoiding({ status: 'issued', recordStatus: 'rejected', voiding: false })).toBe(false);
  });
});

describe('voidingFlagsOf', () => {
  it('voids an invoice the AEAT has', () => {
    expect(voidingFlagsOf([{ voiding: false, status: 'accepted' }])).toEqual({ notRegistered: false, previouslyRejected: false });
    expect(
      voidingFlagsOf([
        { voiding: false, status: 'rejected' },
        { voiding: false, status: 'accepted-with-errors' },
      ]),
    ).toEqual({ notRegistered: false, previouslyRejected: false });
  });

  it('says the AEAT never registered an invoice it blocked or rejected', () => {
    expect(voidingFlagsOf([{ voiding: false, status: 'blocked' }])).toMatchObject({ notRegistered: true });
    expect(
      voidingFlagsOf([
        { voiding: false, status: 'rejected' },
        { voiding: false, status: 'rejected' },
      ]),
    ).toMatchObject({ notRegistered: true });
  });

  it('says the AEAT rejected the previous Voiding it received', () => {
    const accepted = { voiding: false, status: 'accepted' } as const;
    expect(voidingFlagsOf([accepted, { voiding: true, status: 'rejected' }])).toMatchObject({ previouslyRejected: true });
    // A blocked Voiding never reached the AEAT: the one before it did.
    expect(
      voidingFlagsOf([accepted, { voiding: true, status: 'rejected' }, { voiding: true, status: 'blocked' }]),
    ).toMatchObject({ previouslyRejected: true });
    expect(voidingFlagsOf([accepted, { voiding: true, status: 'blocked' }])).toMatchObject({ previouslyRejected: false });
  });
});

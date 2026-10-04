import { describe, expect, it } from 'vitest';
import { defaultOperationDescription, findDraftProblems } from './draft.js';

const dentistry = { kind: 'exempt', ground: 'dentistry' } as const;

describe('defaultOperationDescription', () => {
  it('names a whole calendar month', () => {
    expect(defaultOperationDescription({ start: '2026-09-01', end: '2026-09-30' }, dentistry)).toBe(
      'Servicios odontológicos septiembre 2026',
    );
  });

  it.each([
    [{ start: '2026-09-01', end: '2026-09-15' }, 'Servicios odontológicos del 01/09/2026 al 15/09/2026'],
    [{ start: '2026-08-16', end: '2026-09-30' }, 'Servicios odontológicos del 16/08/2026 al 30/09/2026'],
    [{ start: '2026-02-01', end: '2026-03-31' }, 'Servicios odontológicos del 01/02/2026 al 31/03/2026'],
    [{ start: '2026-10-07', end: '2026-10-07' }, 'Servicios odontológicos 07/10/2026'],
  ])('names any other period by its dates: %o', (period, expected) => {
    expect(defaultOperationDescription(period, dentistry)).toBe(expected);
  });

  it('knows a whole February, leap years included', () => {
    expect(defaultOperationDescription({ start: '2028-02-01', end: '2028-02-29' }, dentistry)).toBe(
      'Servicios odontológicos febrero 2028',
    );
    expect(defaultOperationDescription({ start: '2027-02-01', end: '2027-02-28' }, dentistry)).toBe(
      'Servicios odontológicos febrero 2027',
    );
  });

  it('calls taxed services professional services', () => {
    expect(defaultOperationDescription({ start: '2026-09-01', end: '2026-09-30' }, { kind: 'taxed', rate: 21 })).toBe(
      'Servicios profesionales septiembre 2026',
    );
  });
});

describe('findDraftProblems', () => {
  const today = '2026-10-04';
  const ready = {
    recipient: { censusStatus: 'identified' as const, archived: false },
    billingPeriod: { start: '2026-09-01', end: '2026-09-30' },
    operationDescription: 'Servicios odontológicos septiembre 2026',
    lines: [{ concept: 'Endodoncias' }],
  };

  it('finds none in a draft ready to issue', () => {
    expect(findDraftProblems(ready, today)).toEqual([]);
    expect(findDraftProblems({ ...ready, billingPeriod: null }, today)).toEqual([]);
  });

  it('needs a recipient whose tax ID the census confirmed', () => {
    expect(findDraftProblems({ ...ready, recipient: null }, today)).toEqual([{ code: 'recipient-missing' }]);
    expect(findDraftProblems({ ...ready, recipient: { censusStatus: 'unchecked', archived: false } }, today)).toEqual([
      { code: 'recipient-unchecked' },
    ]);
  });

  it('refuses a recipient archived after the draft picked it', () => {
    expect(findDraftProblems({ ...ready, recipient: { censusStatus: 'identified', archived: true } }, today)).toEqual([
      { code: 'recipient-archived' },
    ]);
  });

  it('needs the billing period to have ended by today: the AEAT refuses a future operation date', () => {
    expect(findDraftProblems({ ...ready, billingPeriod: { start: '2026-10-01', end: '2026-10-04' } }, today)).toEqual([]);
    expect(findDraftProblems({ ...ready, billingPeriod: { start: '2026-10-01', end: '2026-10-31' } }, today)).toEqual([
      { code: 'operation-date-in-future' },
    ]);
  });

  it('needs an operation description', () => {
    expect(findDraftProblems({ ...ready, operationDescription: '  ' }, today)).toEqual([
      { code: 'operation-description-missing' },
    ]);
  });

  it('needs at least one line, each with its concept', () => {
    expect(findDraftProblems({ ...ready, lines: [] }, today)).toEqual([{ code: 'lines-missing' }]);
    expect(
      findDraftProblems({ ...ready, lines: [{ concept: 'Endodoncias' }, { concept: ' ' }, { concept: '' }] }, today),
    ).toEqual([
      { code: 'line-concept-missing', line: 1 },
      { code: 'line-concept-missing', line: 2 },
    ]);
  });

  it('lists every problem, in the order of the form', () => {
    expect(
      findDraftProblems(
        { recipient: null, billingPeriod: { start: '2026-10-01', end: '2026-10-31' }, operationDescription: '', lines: [{ concept: '' }] },
        today,
      ),
    ).toEqual([
      { code: 'recipient-missing' },
      { code: 'operation-date-in-future' },
      { code: 'operation-description-missing' },
      { code: 'line-concept-missing', line: 0 },
    ]);
  });
});

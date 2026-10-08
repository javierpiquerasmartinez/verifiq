import { describe, expect, it } from 'vitest';
import { draftSnapshot, vatFor, vatOfChoice } from './draft-lines';

describe('draftSnapshot', () => {
  const form = {
    recipientId: null,
    periodStart: '',
    periodEnd: '',
    operationDescription: '',
    lines: [{ key: 1, concept: '', quantity: '1', unitPrice: '', discountPercent: '', vat: { kind: 'taxed', rate: 21 } as const }],
    withholding: 0 as const,
  };

  it('ignores the keys of the lines', () => {
    expect(draftSnapshot(form)).toBe(draftSnapshot({ ...form, lines: [{ ...form.lines[0]!, key: 7 }] }));
  });

  it('changes with what is typed', () => {
    expect(draftSnapshot(form)).not.toBe(draftSnapshot({ ...form, operationDescription: 'Consulta' }));
    expect(draftSnapshot(form)).not.toBe(draftSnapshot({ ...form, lines: [{ ...form.lines[0]!, concept: 'Consulta' }] }));
  });
});

describe('vatFor', () => {
  const taxed = { kind: 'taxed', rate: 21 } as const;
  const healthcare = { kind: 'exempt', ground: 'healthcare' } as const;

  it('keeps the ground of a line that is already exempt', () => {
    expect(vatFor('exempt', { kind: 'exempt', ground: 'education' }, healthcare)).toEqual({
      kind: 'exempt',
      ground: 'education',
    });
  });

  it('inherits the ground of the default VAT', () => {
    expect(vatFor('exempt', taxed, healthcare)).toEqual(healthcare);
  });

  it('falls back to the generic ground, whose mention fits any art. 20 exemption', () => {
    expect(vatFor('exempt', taxed, taxed)).toEqual({ kind: 'exempt', ground: 'otherArticle20' });
  });

  it('takes the chosen rate', () => {
    expect(vatFor('10', healthcare, healthcare)).toEqual({ kind: 'taxed', rate: 10 });
  });
});

describe('vatOfChoice', () => {
  it('is the chosen rate', () => {
    expect(vatOfChoice('21', '')).toEqual({ kind: 'taxed', rate: 21 });
    expect(vatOfChoice('0', 'dentistry')).toEqual({ kind: 'taxed', rate: 0 });
  });

  it('is exempt under the chosen ground', () => {
    expect(vatOfChoice('exempt', 'privateTuition')).toEqual({ kind: 'exempt', ground: 'privateTuition' });
  });

  it('is missing while no exemption ground has been chosen', () => {
    expect(vatOfChoice('exempt', '')).toBeNull();
  });
});

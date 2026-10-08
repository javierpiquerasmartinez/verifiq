import { describe, expect, it } from 'vitest';
import { draftSnapshot } from './draft-lines';

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

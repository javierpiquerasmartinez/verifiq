import { describe, expect, it } from 'vitest';
import { missingToIssue } from './draft-problems';

describe('missingToIssue', () => {
  it('names what is missing and the field that fixes it', () => {
    expect(missingToIssue({ code: 'recipient-missing' }, { corrective: false })).toEqual({
      text: 'el cliente',
      field: 'draft-recipient',
    });
    expect(missingToIssue({ code: 'operation-description-missing' }, { corrective: false })).toEqual({
      text: 'la descripción de la operación',
      field: 'description',
    });
    expect(missingToIssue({ code: 'line-concept-missing', line: 1 }, { corrective: false })).toEqual({
      text: 'el concepto de la línea 2',
      field: 'line-2-concept',
    });
    expect(missingToIssue({ code: 'lines-missing' }, { corrective: false })).toEqual({
      text: 'al menos una línea',
      field: 'add-line',
    });
  });

  it('has no field for the recipient of a corrective draft, which cannot change', () => {
    expect(missingToIssue({ code: 'recipient-unchecked' }, { corrective: true }).field).toBeUndefined();
  });
});

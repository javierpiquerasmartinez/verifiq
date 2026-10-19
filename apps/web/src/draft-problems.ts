import type { DraftProblem } from '@verifiq/domain';

// What a draft still lacks to be issued, as the editor lists it: never an error until the user tries
// to issue, since a draft is saved half done.

/** One thing missing to issue: its text after «Para emitir falta:», and the id of the field that fixes it. */
export interface MissingToIssue {
  text: string;
  field?: string;
}

/** Ids of the editor fields a problem points to. */
export const RECIPIENT_FIELD = 'draft-recipient';
export const PERIOD_END_FIELD = 'period-end';
export const DESCRIPTION_FIELD = 'description';
export const ADD_LINE_FIELD = 'add-line';
export const lineConceptField = (index: number) => `line-${index + 1}-concept`;

/** A corrective draft keeps the recipient of the invoice it corrects: no field changes it. */
export function missingToIssue(problem: DraftProblem, { corrective }: { corrective: boolean }): MissingToIssue {
  const recipient = corrective ? undefined : RECIPIENT_FIELD;
  switch (problem.code) {
    case 'recipient-missing':
      return { text: 'el cliente', field: recipient };
    case 'recipient-unchecked':
      return { text: 'que Hacienda confirme el NIF del cliente', field: recipient };
    case 'recipient-archived':
      return { text: 'un cliente activo: el elegido está archivado', field: recipient };
    case 'operation-date-in-future':
      return { text: 'que termine el periodo facturado', field: PERIOD_END_FIELD };
    case 'operation-description-missing':
      return { text: 'la descripción de la operación', field: DESCRIPTION_FIELD };
    case 'lines-missing':
      return { text: 'al menos una línea', field: ADD_LINE_FIELD };
    case 'line-concept-missing':
      return { text: `el concepto de la línea ${problem.line + 1}`, field: lineConceptField(problem.line) };
  }
}

import { EXEMPTION_GROUND_IDS, type DraftLine, type DraftLineInput, type ExemptionGroundId, type VAT_RATES, type VatTreatment } from '@verifiq/domain';
import { decimalInputOf, parseDecimalInput } from './format';

// Draft lines in the editor: kept as typed (Spanish style), parsed on every render.

export interface LineState {
  key: number;
  concept: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  vat: VatTreatment;
}

export type LineErrors = Partial<Record<'quantity' | 'unitPrice' | 'discountPercent', string>>;

let nextLineKey = 0;

export const emptyLine = (vat: VatTreatment): LineState => ({
  key: nextLineKey++,
  concept: '',
  quantity: '1',
  unitPrice: '',
  discountPercent: '',
  vat,
});

export const lineStateOf = (line: DraftLine): LineState => ({
  key: nextLineKey++,
  concept: line.concept,
  quantity: decimalInputOf(line.quantity),
  unitPrice: decimalInputOf(line.unitPrice),
  discountPercent: line.discountPercent ? decimalInputOf(line.discountPercent) : '',
  vat: line.vat,
});

/**
 * The line as the api takes it, or the errors of the fields that are not numbers. With `signed` (a
 * corrective draft, whose lines are the difference), the quantity and the price may be negative.
 */
export function parseLine(state: LineState, { signed = false } = {}): { line: DraftLineInput | null; errors: LineErrors } {
  const quantity = parseDecimalInput(state.quantity, 2, { signed });
  const unitPrice = parseDecimalInput(state.unitPrice, 4, { signed });
  const discount = state.discountPercent.trim() ? parseDecimalInput(state.discountPercent, 2) : undefined;
  const errors: LineErrors = {};
  if (quantity === null) errors.quantity = 'Cantidad no válida (hasta 2 decimales).';
  if (unitPrice === null) errors.unitPrice = 'Precio no válido (hasta 4 decimales).';
  if (discount === null || (discount && Number(discount) > 100)) {
    errors.discountPercent = 'El descuento debe estar entre 0 y 100 %.';
  }
  if (quantity === null || unitPrice === null || discount === null || errors.discountPercent) {
    return { line: null, errors };
  }
  return {
    line: { concept: state.concept, quantity, unitPrice, vat: state.vat, ...(discount ? { discountPercent: discount } : {}) },
    errors,
  };
}

export type VatChoice = 'exempt' | `${(typeof VAT_RATES)[number]}`;

export const vatChoiceOf = (vat: VatTreatment): VatChoice => (vat.kind === 'exempt' ? 'exempt' : `${vat.rate}`);

/** The treatment a line (or catalog item) takes when its VAT choice changes; an exempt line keeps or inherits a ground. */
export function vatFor(choice: VatChoice, current: VatTreatment, defaultVat: VatTreatment): VatTreatment {
  if (choice !== 'exempt') return { kind: 'taxed', rate: Number(choice) as (typeof VAT_RATES)[number] };
  const ground: ExemptionGroundId =
    current.kind === 'exempt' ? current.ground : defaultVat.kind === 'exempt' ? defaultVat.ground : EXEMPTION_GROUND_IDS[0];
  return { kind: 'exempt', ground };
}

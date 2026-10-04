import { exemptionGround, type VatTreatment, type WithholdingRate } from '@verifiq/domain';

// Numbers as Spaniards read and type them; amounts stay decimal strings, never floats.

const THOUSANDS = /^\d{1,3}(\.\d{3})+$/;

/**
 * A number typed in Spanish style ("2.340,50", "2340,5", "2.340") as a decimal string ("2340.50"),
 * or null if it is not one or has more than `maxDecimals` decimals. Blank reads as zero. A lone dot
 * is a thousands separator when three digits follow it, a decimal point otherwise.
 */
export function parseDecimalInput(input: string, maxDecimals: number): string | null {
  let text = input.replace(/\s/g, '');
  if (text === '') return '0';
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  else if (THOUSANDS.test(text)) text = text.replace(/\./g, '');
  if (text.endsWith('.')) text = text.slice(0, -1);
  return new RegExp(`^\\d{1,9}(\\.\\d{1,${maxDecimals}})?$`).test(text) ? text : null;
}

/** A decimal string as an input shows it: "2340.5" → "2340,5". */
export const decimalInputOf = (value: string) => value.replace('.', ',');

/** "5140.00" → "5.140,00 €", grouped even under 10 000 (Intl's es-ES does not); at least 2 decimals. */
export function formatAmount(amount: string): string {
  const negative = amount.startsWith('-');
  const [units = '0', decimals = ''] = amount.replace('-', '').split('.');
  const cents = decimals.padEnd(2, '0');
  const grouped = units.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '−' : ''}${grouped},${cents} €`;
}

/** The withholding is subtracted from the total amount: shown negative. */
export const formatWithheld = (amount: string) => formatAmount(amount === '0.00' ? amount : `-${amount}`);

export const WITHHOLDING_LABELS: Record<WithholdingRate, string> = { 15: '15 %', 7: '7 %', 0: 'Sin retención' };

/** "21 %", or "Exenta · " and the exemption ground. */
export const vatLabel = (vat: VatTreatment) =>
  vat.kind === 'taxed' ? `${vat.rate} %` : `Exenta · ${exemptionGround(vat.ground).label}`;

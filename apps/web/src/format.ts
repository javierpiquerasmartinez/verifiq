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

// Shared with the PDF of the invoice.
export { formatAmount, formatWithheld } from '@verifiq/domain';

export const WITHHOLDING_LABELS: Record<WithholdingRate, string> = { 15: '15 %', 7: '7 %', 0: 'Sin retención' };

/** "21 %", or "Exenta · " and the exemption ground. */
export const vatLabel = (vat: VatTreatment) =>
  vat.kind === 'taxed' ? `${vat.rate} %` : `Exenta · ${exemptionGround(vat.ground).label}`;

const DATE_TIME = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** An instant in Spanish time, as the history shows it: "01/08/2026 · 10:42". */
export function formatDateTime(instant: string): string {
  const parts = Object.fromEntries(DATE_TIME.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]));
  return `${parts.day}/${parts.month}/${parts.year} · ${parts.hour}:${parts.minute}`;
}

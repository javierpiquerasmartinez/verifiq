import { exemptionGround, type VatTreatment, type WithholdingRate } from '@verifiq/domain';

// Numbers as Spaniards read and type them; amounts stay decimal strings, never floats.

/** A decimal string as an input shows it: "2340.5" → "2340,5". */
export const decimalInputOf = (value: string) => value.replace('.', ',');

// Shared with the PDF of the invoice and with the api's search.
export { formatAmount, formatWithheld, parseDecimalInput } from '@verifiq/domain';

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

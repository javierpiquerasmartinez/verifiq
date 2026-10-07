// Amounts and IBANs as they are printed on an invoice, the same on the web and on the PDF, and
// numbers as Spaniards type them (in a form, in a search).
// Amounts stay decimal strings, never floats.

/** "5140.00" → "5.140,00 €", grouped even under 10 000 (Intl's es-ES does not); at least 2 decimals. */
export function formatAmount(amount: string): string {
  const negative = amount.startsWith('-');
  const [units = '0', decimals = ''] = amount.replace('-', '').split('.');
  const cents = decimals.padEnd(2, '0');
  const grouped = units.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '−' : ''}${grouped},${cents} €`;
}

const THOUSANDS = /^\d{1,3}(\.\d{3})+$/;

/**
 * A number typed in Spanish style ("2.340,50", "2340,5", "2.340") as a decimal string ("2340.50"),
 * or null if it is not one or has more than `maxDecimals` decimals. Blank reads as zero. A lone dot
 * is a thousands separator when three digits follow it, a decimal point otherwise. With `signed`, it
 * may start with a minus sign (the lines of a corrective invoice).
 */
export function parseDecimalInput(input: string, maxDecimals: number, { signed = false } = {}): string | null {
  let text = input.replace(/\s/g, '');
  if (signed && /^[-−]/.test(text)) {
    const magnitude = text.length > 1 ? parseDecimalInput(text.slice(1), maxDecimals) : null;
    return magnitude === null ? null : /^[0.]+$/.test(magnitude) ? magnitude : `-${magnitude}`;
  }
  if (text === '') return '0';
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  else if (THOUSANDS.test(text)) text = text.replace(/\./g, '');
  if (text.endsWith('.')) text = text.slice(0, -1);
  return new RegExp(`^\\d{1,9}(\\.\\d{1,${maxDecimals}})?$`).test(text) ? text : null;
}

/**
 * The withholding is subtracted from the total amount: shown negative. A corrective invoice that lowers
 * the amounts withholds less: its negative withholding shows positive.
 */
export const formatWithheld = (amount: string) =>
  formatAmount(amount === '0.00' ? amount : amount.startsWith('-') ? amount.slice(1) : `-${amount}`);

/** A normalised IBAN in groups of four: "ES91 2100 0418 4502 0005 1332". */
export const formatIban = (iban: string) => iban.replace(/(.{4})(?!$)/g, '$1 ');

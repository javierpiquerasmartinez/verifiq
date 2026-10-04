// Amounts and IBANs as they are printed on an invoice, the same on the web and on the PDF.
// Amounts stay decimal strings, never floats.

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

/** A normalised IBAN in groups of four: "ES91 2100 0418 4502 0005 1332". */
export const formatIban = (iban: string) => iban.replace(/(.{4})(?!$)/g, '$1 ');

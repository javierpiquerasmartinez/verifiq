import Big from 'big.js';
import { VAT_RATES, type Breakdown } from './amounts.js';
import { formatSpanishDate } from './draft.js';
import type { InvoiceRecordStatus, InvoiceStatus } from './invoice.js';
import type { RecipientData } from './recipient.js';

// The export (spec story 85): a ZIP with the current PDF of every issued invoice and a summary CSV,
// for the user's accountant. The CSV opens as it is in a Spanish spreadsheet: UTF-8 with a BOM,
// semicolons, decimal commas.

/** What the summary CSV shows of an issued invoice: its current copy, with the withholding as corrected. */
export interface ExportedInvoice {
  number: string;
  issueDate: string;
  status: InvoiceStatus;
  /** Its latest record's: its Voiding's, once voided. */
  recordStatus: InvoiceRecordStatus;
  recipient: Pick<RecipientData, 'name' | 'taxId'>;
  breakdown: Breakdown;
  /** The number of the invoice a corrective invoice corrects. */
  corrects: string | null;
}

const STATUS_LABELS: Record<InvoiceStatus, string> = { issued: 'Emitida', rectified: 'Rectificada', voided: 'Anulada' };

const RECORD_STATUS_LABELS: Record<InvoiceRecordStatus, string> = {
  'pending-submission': 'Pendiente de envío',
  submitted: 'Enviada',
  accepted: 'Aceptada',
  'accepted-with-errors': 'Aceptada con errores',
  rejected: 'Rechazada',
  blocked: 'Bloqueada',
};

/** "-4190.00" → "-4190,00": a number a Spanish spreadsheet reads, without thousands separators or €. */
const decimal = (amount: string) => amount.replace('.', ',');

/** A text a spreadsheet would run as a formula is kept as text. */
const text = (value: string) => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

function field(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const HEADER = [
  'Número',
  'Fecha de expedición',
  'Destinatario',
  'NIF del destinatario',
  'Base imponible',
  ...VAT_RATES.flatMap((rate) => [`Base IVA ${rate} %`, `Cuota IVA ${rate} %`]),
  'Base exenta',
  'Importe total',
  'Retención IRPF %',
  'Retención IRPF',
  'Total a pagar',
  'Estado',
  'Estado en la AEAT',
  'Rectifica a',
];

function row({ number, issueDate, status, recordStatus, recipient, breakdown, corrects }: ExportedInvoice): string[] {
  const taxed = VAT_RATES.flatMap((rate) => {
    const amounts = breakdown.taxed.find((taxed) => taxed.rate === rate);
    return [decimal(amounts?.base ?? '0.00'), decimal(amounts?.taxAmount ?? '0.00')];
  });
  const exempt = breakdown.exempt.reduce((sum, { base }) => sum.plus(base), new Big(0));
  return [
    number,
    formatSpanishDate(issueDate),
    text(recipient.name),
    text(recipient.taxId),
    decimal(breakdown.taxBase),
    ...taxed,
    decimal(exempt.toFixed(2)),
    decimal(breakdown.totalAmount),
    String(breakdown.withholding.rate),
    decimal(breakdown.withholding.amount),
    decimal(breakdown.amountDue),
    STATUS_LABELS[status],
    RECORD_STATUS_LABELS[recordStatus],
    corrects ?? '',
  ];
}

/** The summary CSV of the export: a header and a row per invoice, in the order given. */
export function invoiceExportCsv(invoices: ExportedInvoice[]): string {
  const rows = [HEADER, ...invoices.map(row)];
  return `\uFEFF${rows.map((fields) => fields.map(field).join(';')).join('\r\n')}\r\n`;
}

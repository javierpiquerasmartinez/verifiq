import { describe, expect, it } from 'vitest';
import { computeBreakdown, type BreakdownInput } from './amounts.js';
import { exportedPdfName, invoiceExportCsv, type ExportedInvoice } from './invoice-export.js';

const recipient = {
  name: 'Clínica Dental Ruzafa SL',
  taxId: 'B12345678',
  address: 'Carrer de Sueca 21',
  postalCode: '46006',
  municipality: 'València',
  province: 'Valencia',
};

const lines: BreakdownInput['lines'] = [
  { quantity: '1', unitPrice: '2340', vat: { kind: 'exempt', ground: 'dentistry' } },
  { quantity: '1', unitPrice: '1650', vat: { kind: 'exempt', ground: 'dentistry' } },
  { quantity: '1', unitPrice: '100', vat: { kind: 'taxed', rate: 21 } },
  { quantity: '2', unitPrice: '50', vat: { kind: 'taxed', rate: 10 } },
];

const invoice = (overrides: Partial<ExportedInvoice> = {}): ExportedInvoice => ({
  number: 'F2026-0001',
  issueDate: '2026-09-03',
  status: 'issued',
  recordStatus: 'accepted',
  recipient,
  breakdown: computeBreakdown({ lines, withholding: 15 }),
  corrects: null,
  ...overrides,
});

/** The CSV's rows, each as its fields, without the BOM. */
const rowsOf = (csv: string) =>
  csv
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .filter((row) => row !== '')
    .map((row) => row.split(';'));

describe('invoiceExportCsv', () => {
  it('starts with a BOM and separates fields with semicolons, as a Spanish spreadsheet opens it', () => {
    const csv = invoiceExportCsv([invoice()]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(rowsOf(csv)[0]).toEqual([
      'Número',
      'Fecha de expedición',
      'Destinatario',
      'NIF del destinatario',
      'Base imponible',
      'Base IVA 21 %',
      'Cuota IVA 21 %',
      'Base IVA 10 %',
      'Cuota IVA 10 %',
      'Base IVA 4 %',
      'Cuota IVA 4 %',
      'Base IVA 0 %',
      'Cuota IVA 0 %',
      'Base exenta',
      'Importe total',
      'Retención IRPF %',
      'Retención IRPF',
      'Total a pagar',
      'Estado',
      'Estado en la AEAT',
      'Rectifica a',
    ]);
  });

  it('writes a row per invoice, with its bases and tax amounts by rate and its amounts with a decimal comma', () => {
    const [, row] = rowsOf(invoiceExportCsv([invoice()]));
    expect(row).toEqual([
      'F2026-0001',
      '03/09/2026',
      'Clínica Dental Ruzafa SL',
      'B12345678',
      '4190,00',
      '100,00',
      '21,00',
      '100,00',
      '10,00',
      '0,00',
      '0,00',
      '0,00',
      '0,00',
      '3990,00',
      '4221,00',
      '15',
      '628,50',
      '3592,50',
      'Emitida',
      'Aceptada',
      '',
    ]);
  });

  it('keeps the sign of a corrective invoice and names the invoice it corrects', () => {
    const negated = lines.map((line) => ({ ...line, quantity: `-${line.quantity}` }));
    const [, row] = rowsOf(
      invoiceExportCsv([
        invoice({
          number: 'R2026-0001',
          breakdown: computeBreakdown({ lines: negated, withholding: 15 }),
          corrects: 'F2026-0001',
        }),
      ]),
    );
    expect(row?.slice(4, 5)).toEqual(['-4190,00']);
    expect(row?.slice(14)).toEqual(['-4221,00', '15', '-628,50', '-3592,50', 'Emitida', 'Aceptada', 'F2026-0001']);
  });

  it.each([
    ['issued', 'pending-submission', 'Emitida', 'Pendiente de envío'],
    ['issued', 'submitted', 'Emitida', 'Enviada'],
    ['issued', 'accepted-with-errors', 'Emitida', 'Aceptada con errores'],
    ['issued', 'rejected', 'Emitida', 'Rechazada'],
    ['issued', 'blocked', 'Emitida', 'Bloqueada'],
    ['rectified', 'accepted', 'Rectificada', 'Aceptada'],
    ['voided', 'accepted', 'Anulada', 'Aceptada'],
  ] as const)('names a %s invoice whose record is %s in Spanish', (status, recordStatus, statusLabel, recordLabel) => {
    const [, row] = rowsOf(invoiceExportCsv([invoice({ status, recordStatus })]));
    expect(row?.slice(18, 20)).toEqual([statusLabel, recordLabel]);
  });

  it('quotes a field with a semicolon, a quote or a line break', () => {
    const csv = invoiceExportCsv([invoice({ recipient: { ...recipient, name: 'Ruzafa; "Dental"\nSL' } })]);
    expect(csv).toContain(';"Ruzafa; ""Dental""\nSL";');
  });

  it('never lets a spreadsheet read a name as a formula', () => {
    const csv = invoiceExportCsv([invoice({ recipient: { ...recipient, name: '=HYPERLINK("x")' } })]);
    expect(csv).toContain(`;"'=HYPERLINK(""x"")";`);
  });

  it('writes only the header when there are no invoices', () => {
    expect(rowsOf(invoiceExportCsv([]))).toHaveLength(1);
  });
});

describe('exportedPdfName', () => {
  it('names the PDF after the invoice number', () => {
    expect(exportedPdfName(invoice())).toBe('F2026-0001.pdf');
  });

  it.each(['pending-submission', 'submitted', 'accepted', 'accepted-with-errors'] as const)(
    'marks a voided invoice whose Voiding is %s',
    (recordStatus) => {
      expect(exportedPdfName(invoice({ status: 'voided', recordStatus }))).toBe('F2026-0001-anulada.pdf');
    },
  );

  it.each(['blocked', 'rejected'] as const)('does not mark an invoice whose Voiding is %s: the AEAT still has it', (recordStatus) => {
    expect(exportedPdfName(invoice({ status: 'voided', recordStatus }))).toBe('F2026-0001.pdf');
  });
});

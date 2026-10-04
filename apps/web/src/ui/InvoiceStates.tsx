import type { Invoice, InvoiceRecordStatus } from '@verifiq/domain';
import { QRCodeSVG } from 'qrcode.react';

const RECORD_STATUSES: Record<InvoiceRecordStatus, { label: string; tone: string }> = {
  'pending-submission': { label: 'Enviando…', tone: 'sending' },
  submitted: { label: 'Pendiente', tone: 'pending' },
  accepted: { label: 'Aceptada', tone: 'accepted' },
  'accepted-with-errors': { label: 'Aceptada con errores', tone: 'warn' },
  rejected: { label: 'Rechazada', tone: 'blocked' },
  blocked: { label: 'Bloqueada', tone: 'blocked' },
};

/** Both states of an issued invoice: the invoice's own, and its record's at the AEAT. */
export function InvoiceStates({ invoice }: { invoice: Invoice }) {
  const record = RECORD_STATUSES[invoice.record.status];
  return (
    <div className="states">
      <span className="sf sf-issued">Emitida</span>
      <span className={`sr sr-${record.tone}`}>
        <span className="sr-k">AEAT</span>
        <span className="sr-v">{record.label}</span>
      </span>
    </div>
  );
}

/** The QR tributario, with the texts the regulation puts around it. */
export function TaxQr({ url, number }: { url: string; number: string }) {
  return (
    <div className="tax-qr">
      <span className="tax-qr-label">QR tributario:</span>
      <QRCodeSVG value={url} size={120} marginSize={0} level="M" title={`Código QR tributario de la factura ${number}`} />
      <span className="tax-qr-label mono">VERI*FACTU</span>
    </div>
  );
}

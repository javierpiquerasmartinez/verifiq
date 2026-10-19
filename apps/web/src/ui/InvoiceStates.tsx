import type { InvoiceRecordStatus, InvoiceStatus } from '@verifiq/domain';
import { QRCodeSVG } from 'qrcode.react';
import { Icon, type IconName } from './icons';

const RECORD_STATUSES: Record<InvoiceRecordStatus, { label: string; tone: string; icon?: IconName }> = {
  'pending-submission': { label: 'Enviando…', tone: 'sending' },
  submitted: { label: 'Pendiente', tone: 'pending', icon: 'clock' },
  accepted: { label: 'Aceptada', tone: 'accepted', icon: 'check' },
  'accepted-with-errors': { label: 'Aceptada con errores', tone: 'warn', icon: 'mark' },
  rejected: { label: 'Rechazada', tone: 'blocked', icon: 'closeSmall' },
  blocked: { label: 'Bloqueada', tone: 'blocked', icon: 'closeSmall' },
};

/** Still awaiting the AEAT's verdict more than 24 h after the Issuance. */
const UNCONFIRMED = { label: 'Sin confirmar', tone: 'warn', icon: 'clock' } as const;

/** The record's state at the AEAT, as a pill. */
export function RecordState({ status, unconfirmed = false }: { status: InvoiceRecordStatus; unconfirmed?: boolean }) {
  const record = unconfirmed ? UNCONFIRMED : RECORD_STATUSES[status];
  return (
    <span className={`sr sr-${record.tone}`}>
      <span className="sr-k">AEAT</span>
      <span className="sr-v">
        {record.icon && <Icon name={record.icon} size="xs" />}
        {record.label}
      </span>
    </span>
  );
}

const INVOICE_STATUSES: Record<InvoiceStatus, string> = { issued: 'Emitida', rectified: 'Rectificada', voided: 'Anulada' };

/** Both states of an issued invoice: the invoice's own, and its record's at the AEAT. */
export function InvoiceStates({
  status,
  recordStatus,
  unconfirmed = false,
}: {
  status: InvoiceStatus;
  recordStatus: InvoiceRecordStatus;
  unconfirmed?: boolean;
}) {
  return (
    <div className="states">
      <span className={`sf sf-${status}`}>
        <span>{INVOICE_STATUSES[status]}</span>
      </span>
      <RecordState status={recordStatus} unconfirmed={unconfirmed} />
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

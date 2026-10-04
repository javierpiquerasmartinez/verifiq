import type { Invoice } from '@verifiq/domain';
import { invoicePdfUrl } from '../api';
import { Icon } from './icons';

/** Open or save the invoice's PDF. It exists only once the record has its QR, a moment after it. */
export function InvoicePdfLinks({ invoice }: { invoice: Invoice }) {
  if (!invoice.record.verificationUrl) return null;
  if (!invoice.pdf) return <p className="small muted">Preparando el PDF…</p>;
  return (
    <div className="row" style={{ gap: 8 }}>
      <a className="btn btn-secondary" href={invoicePdfUrl(invoice.id)} target="_blank" rel="noopener noreferrer">
        <Icon name="eye" />
        Ver PDF
      </a>
      <a className="btn btn-secondary" href={invoicePdfUrl(invoice.id, { download: true })}>
        <Icon name="download" />
        Descargar PDF
      </a>
    </div>
  );
}

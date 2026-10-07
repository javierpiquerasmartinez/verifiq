import type { Invoice } from '@verifiq/domain';
import { invoicePdfUrl } from '../api';
import { Icon } from './icons';

/** Whether the invoice has, or will have in a moment, its PDF: once its record has the QR. A voided invoice keeps the one it had. */
const hasPdf = (invoice: Invoice) => invoice.record.verificationUrl !== null || (invoice.record.voiding && invoice.pdf !== null);

/** Saves the invoice's PDF. It exists only once the record has its QR, a moment after it. */
export function DownloadPdfButton({ invoice, tone = 'primary' }: { invoice: Invoice; tone?: 'primary' | 'secondary' }) {
  if (!hasPdf(invoice)) return null;
  if (!invoice.pdf) {
    return (
      <button type="button" className={`btn btn-${tone}`} disabled>
        <Icon name="spinner" spin />
        Preparando el PDF…
      </button>
    );
  }
  return (
    <a className={`btn btn-${tone}`} href={invoicePdfUrl(invoice.id, { download: true })}>
      <Icon name="download" />
      Descargar PDF
    </a>
  );
}

/** The stored PDF itself, the document the client receives, with its QR tributario. */
export function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  if (!hasPdf(invoice)) return null;
  return (
    <section className="card invoice-document" aria-labelledby="invoice-document">
      <div className="card-head">
        <h2 className="h3" id="invoice-document">
          Documento
        </h2>
        {invoice.pdf && <span className="small muted">PDF · versión {invoice.pdf.version}</span>}
      </div>
      <div className="invoice-document-body">
        {invoice.pdf ? (
          <iframe
            key={invoice.pdf.version}
            src={`${invoicePdfUrl(invoice.id)}#toolbar=0&navpanes=0&view=FitH`}
            title={`PDF de la factura ${invoice.number}`}
            className="invoice-document-pdf"
          />
        ) : (
          <p className="muted">Preparando el PDF…</p>
        )}
      </div>
    </section>
  );
}

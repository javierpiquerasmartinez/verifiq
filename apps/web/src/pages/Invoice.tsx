import { Link, useParams } from '@tanstack/react-router';
import { formatSpanishDate, type Invoice } from '@verifiq/domain';
import { ApiError } from '../api';
import { formatAmount, formatDateTime, formatWithheld } from '../format';
import { useSessionExpiry } from '../session';
import { useInvoice } from '../use-invoice';
import { AppShell } from '../ui/AppShell';
import { Alert } from '../ui/components';
import { Icon } from '../ui/icons';
import { InvoiceHistory } from '../ui/InvoiceHistory';
import { DownloadPdfButton, InvoiceDocument } from '../ui/InvoicePdf';
import { InvoiceStates, RecordState } from '../ui/InvoiceStates';
import { isIncident, RecordIncident } from '../ui/RecordIncident';

/** An issued invoice: its legal situation at a glance (both states) and the PDF made from its frozen copy. */
export function InvoicePage() {
  const { invoiceId } = useParams({ from: '/invoices/$invoiceId' });
  const invoice = useInvoice(invoiceId);
  useSessionExpiry(invoice.error);

  const notFound = invoice.error instanceof ApiError && invoice.error.status === 404;
  return (
    <AppShell>
      <nav className="crumb" aria-label="Ruta">
        <Link to="/">Facturas</Link>
        <Icon name="chevronRight" size="xs" />
        <span className="mono">{invoice.data?.number ?? 'Factura'}</span>
      </nav>
      {invoice.isPending && <p>Cargando…</p>}
      {notFound && <Alert tone="danger">Esta factura no existe.</Alert>}
      {invoice.isError && !notFound && <Alert tone="danger">No se ha podido cargar la factura. Recarga la página.</Alert>}
      {invoice.data && <InvoiceDetail invoice={invoice.data} />}
    </AppShell>
  );
}

function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const { breakdown, recipient, record } = invoice;
  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card row" style={{ padding: 28, gap: 32, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 16, minWidth: 0 }}>
          <div className="row" style={{ gap: 14 }}>
            <h1 className="mono" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-.01em' }}>
              {invoice.number}
            </h1>
            <InvoiceStates status={invoice.status} recordStatus={invoice.record.status} />
          </div>
          <dl className="kv" style={{ gridTemplateColumns: '150px 1fr', gap: '8px 24px' }}>
            <dt>Cliente</dt>
            <dd>
              <Link to="/recipients/$recipientId" params={{ recipientId: invoice.recipientId }} className="lnk">
                {recipient.name}
              </Link>{' '}
              <span className="mono xs muted">{recipient.taxId}</span>
            </dd>
            <dt>Fecha de expedición</dt>
            <dd>{formatSpanishDate(invoice.issueDate)}</dd>
            {invoice.billingPeriod && (
              <>
                <dt>Periodo facturado</dt>
                <dd>
                  {formatSpanishDate(invoice.billingPeriod.start)} – {formatSpanishDate(invoice.billingPeriod.end)}
                </dd>
              </>
            )}
            <dt>Importe total</dt>
            <dd className="num">{formatAmount(breakdown.totalAmount)}</dd>
          </dl>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end', gap: 18 }}>
          <div style={{ textAlign: 'right' }}>
            <span className="eyebrow">Total a pagar</span>
            <p className="num" style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.1, color: 'var(--primary)' }}>
              {formatAmount(breakdown.amountDue)}
            </p>
            {breakdown.withholding.rate > 0 && (
              <span className="xs muted">
                Retención IRPF {breakdown.withholding.rate} %: {formatWithheld(breakdown.withholding.amount)}
              </span>
            )}
          </div>
          <DownloadPdfButton invoice={invoice} />
        </div>
      </section>

      {record.status === 'pending-submission' && (
        <Alert tone="info">Estamos registrando la factura en la AEAT. En unos segundos aparecerá su QR.</Alert>
      )}
      {isIncident(record.status) && invoice.status === 'issued' && (
        <RecordIncident key={record.status} invoice={invoice} incident={record.status} />
      )}
      {record.unconfirmed && (
        <Alert tone="warn" title="La AEAT aún no ha confirmado esta factura">
          Han pasado más de 24 horas desde que la emitiste y Hacienda todavía no ha respondido. Ya lo estamos revisando; no
          tienes que volver a emitirla.
        </Alert>
      )}

      <div className="invoice-layout">
        <InvoiceDocument invoice={invoice} />
        <aside className="invoice-side">
          <InvoiceHistory history={invoice.history} />
          <section className="card card-pad stack" style={{ gap: 12 }} aria-labelledby="invoice-record">
            <h2 className="h3" id="invoice-record">
              Registro en la AEAT
            </h2>
            <dl className="kv" style={{ gridTemplateColumns: '130px 1fr', gap: '8px 16px', fontSize: 14 }}>
              <dt>Estado</dt>
              <dd>
                <RecordState status={record.status} />
              </dd>
              {record.confirmedAt && (
                <>
                  <dt>Confirmado</dt>
                  <dd>{formatDateTime(record.confirmedAt)}</dd>
                </>
              )}
              {record.registrationCode && (
                <>
                  <dt>Código de registro</dt>
                  <dd className="mono xs" style={{ wordBreak: 'break-all' }}>
                    {record.registrationCode}
                  </dd>
                </>
              )}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

import { Link, useParams } from '@tanstack/react-router';
import { formatSpanishDate, type Invoice } from '@verifiq/domain';
import { ApiError } from '../api';
import { decimalInputOf, formatAmount, formatWithheld } from '../format';
import { useSessionExpiry } from '../session';
import { useInvoice } from '../use-invoice';
import { AppShell } from '../ui/AppShell';
import { Alert } from '../ui/components';
import { DraftSummary } from '../ui/DraftSummary';
import { Icon } from '../ui/icons';
import { InvoiceStates, TaxQr } from '../ui/InvoiceStates';

/** An issued invoice: its legal situation at a glance (both states, QR) and its frozen copy. */
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

const vatLabel = ({ vat }: Invoice['lines'][number]) => (vat.kind === 'exempt' ? 'Exenta' : `${vat.rate} %`);

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
            <InvoiceStates invoice={invoice} />
          </div>
          <dl className="kv" style={{ gridTemplateColumns: '150px 1fr', gap: '8px 24px' }}>
            <dt>Cliente</dt>
            <dd>
              {recipient.name} <span className="mono xs muted">{recipient.taxId}</span>
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
      </section>

      {record.status === 'pending-submission' && (
        <Alert tone="info">Estamos registrando la factura en la AEAT. En unos segundos aparecerá su QR.</Alert>
      )}
      {record.status === 'blocked' && (
        <Alert tone="danger" title="El registro no se ha podido enviar a la AEAT">
          {record.rejection?.message} El número {invoice.number} queda asignado a esta factura.
        </Alert>
      )}

      <div className="editor">
        <section className="card editor-main" style={{ overflow: 'hidden', gap: 0 }} aria-labelledby="invoice-lines">
          <div className="card-head">
            <h2 className="h3" id="invoice-lines">
              Líneas
            </h2>
            <span className="small muted">{invoice.operationDescription}</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="r">Cant.</th>
                <th className="r">Precio unit.</th>
                <th className="r">Dto.</th>
                <th>IVA</th>
                <th className="r">Importe</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, i) => (
                <tr key={i}>
                  <td>{line.concept}</td>
                  <td className="r num">{decimalInputOf(line.quantity)}</td>
                  <td className="r num">{formatAmount(line.unitPrice)}</td>
                  <td className="r num">{line.discountPercent ? `${decimalInputOf(line.discountPercent)} %` : '—'}</td>
                  <td>{vatLabel(line)}</td>
                  <td className="r num">{formatAmount(breakdown.lines[i]!.base)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="editor-side">
          {record.verificationUrl && (
            <section className="card card-pad row" style={{ gap: 20, flexWrap: 'nowrap' }} aria-label="QR tributario">
              <TaxQr url={record.verificationUrl} number={invoice.number} />
              <p className="small ink2">
                Cualquiera puede comprobar en la AEAT que esta factura está registrada escaneando el código.
              </p>
            </section>
          )}
          <DraftSummary breakdown={breakdown} recipientName={recipient.name} />
        </aside>
      </div>
    </div>
  );
}

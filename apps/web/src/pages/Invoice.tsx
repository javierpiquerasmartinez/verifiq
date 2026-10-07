import { Link, useParams } from '@tanstack/react-router';
import { correctionReasonLabel, formatSpanishDate, isRectifiable, type Invoice } from '@verifiq/domain';
import { useEffect, useRef, useState } from 'react';
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
import { RectifyDialog } from '../ui/RectifyDialog';
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

/** The ways to correct an issued invoice (ADR 0005). */
function CorrectMenu({ onRectify }: { onRectify: () => void }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !menu.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={menu} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Corregir
        <Icon name="chevron" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <button
            type="button"
            className="mi"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onRectify();
            }}
          >
            <Icon name="rectify" />
            <span>
              Rectificar<small>Cambiar importes o datos con una factura rectificativa</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/** The links between a rectified invoice and its corrective invoices, both ways. */
function CorrectionLinks({ invoice }: { invoice: Invoice }) {
  const { correction, correctedBy } = invoice;
  return (
    <>
      {correction && (
        <section className="card rect-band" aria-label="Factura rectificada">
          <Icon name="link" />
          <span>Rectifica la factura</span>
          <Link to="/invoices/$invoiceId" params={{ invoiceId: correction.invoice.id }} className="lnk mono">
            {correction.invoice.number}
          </Link>
          <span className="small">
            {formatSpanishDate(correction.invoice.issueDate)} · {correctionReasonLabel(correction.reason)} ·{' '}
            {correction.note}
          </span>
        </section>
      )}
      {correctedBy.length > 0 && (
        <section className="card rect-band stack" style={{ alignItems: 'flex-start' }} aria-label="Rectificativas">
          <div className="row" style={{ gap: 14 }}>
            <Icon name="link" />
            <span>
              Esta factura tiene {correctedBy.length === 1 ? '1 rectificativa' : `${correctedBy.length} rectificativas`}:
            </span>
          </div>
          {correctedBy.map((corrective) => (
            <div key={corrective.id} className="row" style={{ gap: 14, paddingLeft: 32 }}>
              <Link to="/invoices/$invoiceId" params={{ invoiceId: corrective.id }} className="lnk mono">
                {corrective.number}
              </Link>
              <span className="small">
                {formatSpanishDate(corrective.issueDate)} · {formatAmount(corrective.amountDue)} ·{' '}
                {correctionReasonLabel(corrective.reason)}
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const { breakdown, recipient, record } = invoice;
  const [rectifying, setRectifying] = useState(false);
  const rectifiable = isRectifiable({ status: invoice.status, recordStatus: record.status, corrective: invoice.correction !== null });
  return (
    <div className="stack" style={{ gap: 20 }}>
      <section className="card row" style={{ padding: 28, gap: 32, justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div className="stack" style={{ gap: 16, minWidth: 0 }}>
          <div className="row" style={{ gap: 14 }}>
            <h1 className="mono" style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-.01em' }}>
              {invoice.number}
            </h1>
            <InvoiceStates status={invoice.status} recordStatus={invoice.record.status} />
            {invoice.correction && <span className="sf sf-type">Rectificativa</span>}
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
          <div className="row" style={{ gap: 10 }}>
            {rectifiable && <CorrectMenu onRectify={() => setRectifying(true)} />}
            <DownloadPdfButton invoice={invoice} />
          </div>
        </div>
      </section>

      <CorrectionLinks invoice={invoice} />

      {record.status === 'pending-submission' && (
        <Alert tone="info">Estamos registrando la factura en la AEAT. En unos segundos aparecerá su QR.</Alert>
      )}
      {isIncident(record.status) && invoice.status === 'issued' && (
        <RecordIncident
          key={record.status}
          invoice={invoice}
          incident={record.status}
          onRectify={rectifiable ? () => setRectifying(true) : undefined}
        />
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
      {rectifying && <RectifyDialog invoice={invoice} onClose={() => setRectifying(false)} />}
    </div>
  );
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { correctionReasonLabel, formatSpanishDate, InvoiceErrorCode, type Draft, type Invoice } from '@verifiq/domain';
import { useEffect, useRef, useState } from 'react';
import { ApiError, fetchNextInvoiceNumber, issueInvoice } from '../api';
import { useInvoice } from '../use-invoice';
import { formatAmount } from '../format';
import { Alert } from './components';
import { Icon } from './icons';
import { DownloadPdfButton } from './InvoicePdf';
import { InvoiceStates, RecordState, TaxQr } from './InvoiceStates';

function issueError(cause: unknown): string {
  if (cause instanceof ApiError && cause.code === InvoiceErrorCode.CannotIssue) {
    return 'Aún no puedes emitir: falta firmar la autorización ante la AEAT.';
  }
  if (cause instanceof ApiError && cause.code === InvoiceErrorCode.NotRectifiable) {
    return 'La factura que corrige ya no se puede rectificar. Recarga la página para ver su estado.';
  }
  if (cause instanceof ApiError && cause.code === InvoiceErrorCode.DraftNotReady) {
    return 'Al borrador le falta algo para poder emitirse. Vuelve a él y revisa los campos marcados.';
  }
  if (cause instanceof ApiError && cause.status === 404) return 'Este borrador ya no existe: puede que ya se haya emitido.';
  return 'No se ha podido emitir la factura. Vuelve a intentarlo.';
}

/**
 * Issuing a saved draft that has no problems: the confirmation (irreversible), then the record on
 * its way to the AEAT, then the issued invoice with its QR. Closing it once issued leads to the invoice.
 */
export function IssueDialog({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [issued, setIssued] = useState<Invoice>();
  // A corrective draft is numbered in the corrective invoices' series.
  const series = draft.correction ? 'corrective' : 'ordinary';
  const nextNumber = useQuery({
    queryKey: ['next-invoice-number', series],
    queryFn: () => fetchNextInvoiceNumber(series),
    retry: false,
    gcTime: 0,
  });
  const kind = draft.correction ? 'rectificativa' : 'factura';
  const invoice = useInvoice(issued?.id, issued).data;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  function close() {
    if (issued) void navigate({ to: '/invoices/$invoiceId', params: { invoiceId: issued.id } });
    else onClose();
  }

  async function issue() {
    setPending(true);
    setError(undefined);
    try {
      const created = await issueInvoice(draft.id);
      queryClient.removeQueries({ queryKey: ['draft', draft.id] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setIssued(created);
    } catch (cause) {
      setError(issueError(cause));
      void nextNumber.refetch();
    } finally {
      setPending(false);
    }
  }

  const { recipient, breakdown } = draft;
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="issue-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) close();
      }}
    >
      {!invoice ? (
        <>
          <div className="modal-head">
            <span className="irr ink2">
              <Icon name="lock" size="xs" />
              No se puede deshacer
            </span>
            <h2 className="h2" id="issue-title">
              ¿Emitir esta {kind}?
            </h2>
          </div>
          <div className="modal-body">
            <dl
              className="kv"
              style={{ gridTemplateColumns: '170px 1fr', padding: '16px 18px', background: 'var(--surface-2)', borderRadius: 'var(--r-lg)' }}
            >
              <dt>Cliente</dt>
              <dd>
                <b style={{ fontWeight: 500 }}>{recipient?.name}</b>
                <br />
                <span className="mono xs muted">{recipient?.taxId}</span>
              </dd>
              {draft.correction && (
                <>
                  <dt>Rectifica</dt>
                  <dd>
                    <span className="mono">{draft.correction.invoice.number}</span>
                    <br />
                    <span className="xs muted">{correctionReasonLabel(draft.correction.reason)}</span>
                  </dd>
                </>
              )}
              <dt>Número que se asignará</dt>
              <dd className="mono" style={{ fontWeight: 600 }}>
                {nextNumber.data ?? '…'}
              </dd>
              <dt>Fecha de expedición</dt>
              <dd>{formatSpanishDate(draft.issueDate)}</dd>
              <dt>Importe total</dt>
              <dd className="num">{formatAmount(breakdown.totalAmount)}</dd>
              <dt style={{ color: 'var(--ink)', fontWeight: 600 }}>Total a pagar</dt>
              <dd className="num" style={{ fontSize: 22, fontWeight: 600, color: 'var(--primary)' }}>
                {formatAmount(breakdown.amountDue)}
              </dd>
            </dl>
            <div className="alert alert-neutral" style={{ background: '#fff', borderColor: 'var(--line-strong)' }}>
              <Icon name="lock" />
              <p>
                <b>Una vez emitida, la factura se registra en la AEAT y no se puede modificar ni borrar.</b> Si después hay
                que cambiar algo, se hará con una factura rectificativa.
              </p>
            </div>
            {error && <Alert tone="danger">{error}</Alert>}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
              Volver al borrador
            </button>
            <button type="button" className="btn btn-primary" onClick={issue} disabled={pending || !nextNumber.data}>
              <Icon name={pending ? 'spinner' : 'lock'} spin={pending} />
              {pending ? 'Emitiendo…' : `Emitir ${kind} ${nextNumber.data ?? ''}`}
            </button>
          </div>
        </>
      ) : invoice.record.status === 'pending-submission' ? (
        <div className="modal-body" style={{ padding: '48px 32px', alignItems: 'center', textAlign: 'center', gap: 18 }}>
          <div className="dialog-badge dialog-badge-lg dialog-badge-info">
            <Icon name="spinner" size="lg" spin />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <h2 className="h2" id="issue-title">
              Enviando…
            </h2>
            <p className="ink2">
              Estamos registrando la factura <span className="mono">{invoice.number}</span> en la AEAT. No cierres esta
              ventana.
            </p>
          </div>
          <div className="progress" role="progressbar" aria-label="Enviando a la AEAT">
            <span />
          </div>
          <RecordState status={invoice.record.status} />
        </div>
      ) : (
        <>
          <div className="modal-head" style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <div className={`dialog-badge dialog-badge-${invoice.record.status === 'blocked' ? 'danger' : 'ok'}`}>
              <Icon name={invoice.record.status === 'blocked' ? 'alert' : 'check'} size="lg" />
            </div>
            <div>
              <h2 className="h2" id="issue-title">
                Factura <span className="mono">{invoice.number}</span> emitida
              </h2>
              <p className="small muted">
                {invoice.recipient.name} · Total a pagar {formatAmount(invoice.breakdown.amountDue)}
              </p>
            </div>
          </div>
          <div className="modal-body">
            {invoice.record.verificationUrl ? (
              <div className="row" style={{ gap: 20, padding: 18, border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', flexWrap: 'nowrap' }}>
                <TaxQr url={invoice.record.verificationUrl} number={invoice.number} />
                <div className="stack" style={{ gap: 10 }}>
                  <InvoiceStates status={invoice.status} recordStatus={invoice.record.status} />
                  <p className="small ink2">
                    Hacienda suele confirmar el registro en 1–2 minutos. El PDF ya es válido y puedes descargarlo y
                    enviarlo.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <InvoiceStates status={invoice.status} recordStatus={invoice.record.status} />
                <Alert tone="danger" title="El registro no se ha podido enviar a la AEAT">
                  {invoice.record.rejection?.message} El número {invoice.number} queda asignado a esta factura.
                </Alert>
              </>
            )}
          </div>
          <div className="modal-foot" style={{ justifyContent: 'space-between' }}>
            <Link to="/" className="btn btn-ghost">
              Volver a facturas
            </Link>
            <div className="row" style={{ gap: 10 }}>
              <Link
                to="/invoices/$invoiceId"
                params={{ invoiceId: invoice.id }}
                className={`btn ${invoice.record.verificationUrl ? 'btn-secondary' : 'btn-primary'}`}
              >
                Ver factura
              </Link>
              <DownloadPdfButton invoice={invoice} />
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}

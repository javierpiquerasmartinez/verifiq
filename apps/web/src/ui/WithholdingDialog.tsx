import { useQueryClient } from '@tanstack/react-query';
import { InvoiceErrorCode, WITHHOLDING_RATES, withWithholding, type Invoice, type WithholdingRate } from '@verifiq/domain';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError, correctWithholding } from '../api';
import { formatAmount, formatWithheld, WITHHOLDING_LABELS } from '../format';
import { Alert, Seg } from './components';
import { Icon } from './icons';

function withholdingError(cause: unknown): string {
  if (cause instanceof ApiError && cause.code === InvoiceErrorCode.NotWithholdingCorrectable) {
    return 'La retención de esta factura ya no se puede corregir. Recarga la página para ver su estado.';
  }
  return 'No se ha podido corregir la retención. Vuelve a intentarlo.';
}

/**
 * "Corregir retención" (ADR 0005): only the IRPF withholding changes, which is not part of the record.
 * The invoice keeps its number and record, and its PDF gets a new version; the earlier one stays in its
 * history.
 */
export function WithholdingDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const queryClient = useQueryClient();
  const id = useId();
  const [withholding, setWithholding] = useState<WithholdingRate>(invoice.withholding);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const changed = withholding !== invoice.withholding;
  const after = withWithholding(invoice.breakdown, withholding);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!changed) return;
    setPending(true);
    setError(undefined);
    try {
      queryClient.setQueryData(['invoice', invoice.id], await correctWithholding(invoice.id, { withholding }));
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
    } catch (cause) {
      setError(withholdingError(cause));
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <form onSubmit={submit}>
        <div className="modal-head">
          <h2 className="h2" id={`${id}-title`}>
            Corregir retención de <span className="mono">{invoice.number}</span>
          </h2>
          <p className="small ink2">
            La retención de IRPF no se comunica a Hacienda: la factura conserva su número y su registro. Generaremos una
            nueva versión del PDF; la anterior seguirá disponible en el historial.
          </p>
        </div>
        <div className="modal-body">
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">Retención de IRPF</span>
            <Seg
              label="Retención de IRPF"
              options={WITHHOLDING_RATES.map((rate) => ({ value: rate, label: WITHHOLDING_LABELS[rate] }))}
              value={withholding}
              onChange={setWithholding}
            />
          </div>
          <dl className="kv" style={{ gridTemplateColumns: '1fr auto', gap: '8px 24px' }}>
            <dt>Importe total</dt>
            <dd className="num">{formatAmount(after.totalAmount)}</dd>
            <dt>Retención de IRPF {withholding ? `(${withholding} %)` : '(sin retención)'}</dt>
            <dd className="num">{formatWithheld(after.withholding.amount)}</dd>
            <dt>Total a pagar</dt>
            <dd className="num">
              {changed && (
                <>
                  <s className="muted">{formatAmount(invoice.breakdown.amountDue)}</s>{' '}
                </>
              )}
              <strong>{formatAmount(after.amountDue)}</strong>
            </dd>
          </dl>
          <p className="help">
            Si el error está en los importes, el IVA o los datos de la factura, rectifícala en lugar de corregir la retención.
          </p>
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending || !changed}>
            <Icon name={pending ? 'spinner' : 'file'} spin={pending} />
            {pending ? 'Generando…' : 'Generar la nueva versión'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

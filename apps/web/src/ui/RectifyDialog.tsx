import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  CORRECTION_REASONS,
  correctionNoteSchema,
  correctionReasonLabel,
  InvoiceErrorCode,
  type CorrectionReason,
  type Invoice,
} from '@verifiq/domain';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError, startCorrection } from '../api';
import { formatAmount } from '../format';
import { Alert, Seg } from './components';
import { Icon } from './icons';

function correctionError(cause: unknown): string {
  if (cause instanceof ApiError && cause.code === InvoiceErrorCode.NotRectifiable) {
    return 'Esta factura ya no se puede rectificar. Recarga la página para ver su estado.';
  }
  return 'No se ha podido preparar la rectificativa. Vuelve a intentarlo.';
}

/**
 * Rectifying an issued invoice: the user picks a plain-language reason (its R1/R4 code follows from it)
 * and explains it, and gets a corrective draft by differences to review and issue. "Rectificar
 * totalmente" starts it with every line negated.
 */
export function RectifyDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = useId();
  const [reason, setReason] = useState<CorrectionReason>();
  const [note, setNote] = useState('');
  const [total, setTotal] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const noteError = correctionNoteSchema.safeParse(note).error?.issues[0]?.message;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason || noteError) return;
    setPending(true);
    setError(undefined);
    try {
      const draft = await startCorrection(invoice.id, { reason, note, total });
      queryClient.setQueryData(['draft', draft.id], draft);
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      await navigate({ to: '/drafts/$draftId', params: { draftId: draft.id } });
    } catch (cause) {
      setError(correctionError(cause));
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
            Rectificar <span className="mono">{invoice.number}</span>
          </h2>
          <p className="small ink2">
            La factura no se modifica: emitirás una factura rectificativa con la diferencia, en tu serie de rectificativas.
          </p>
        </div>
        <div className="modal-body">
          <fieldset className="stack" style={{ gap: 10, border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 10 }}>
              ¿Por qué la rectificas?
            </legend>
            {CORRECTION_REASONS.map((value) => (
              <label key={value} className="chk">
                <input
                  type="radio"
                  name={`${id}-reason`}
                  value={value}
                  checked={reason === value}
                  onChange={() => setReason(value)}
                  required
                />
                <span>{correctionReasonLabel(value)}</span>
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label className="label" htmlFor={`${id}-note`}>
              Explícalo en pocas palabras
            </label>
            <textarea
              id={`${id}-note`}
              className="input"
              value={note}
              maxLength={250}
              required
              placeholder="Por ejemplo: la clínica aplica un descuento del 10 % acordado en septiembre"
              onChange={(event) => setNote(event.target.value)}
              aria-describedby={`${id}-note-hint`}
            />
            <p className="help" id={`${id}-note-hint`}>
              Se imprime en la rectificativa junto al motivo.
            </p>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">¿Qué cambia?</span>
            <Seg
              label="Qué cambia"
              options={[
                { value: 'difference', label: 'Una parte' },
                { value: 'total', label: 'Toda la factura' },
              ]}
              value={total ? 'total' : 'difference'}
              onChange={(value) => setTotal(value === 'total')}
            />
            <p className="help">
              {total
                ? `Rectificar totalmente: la rectificativa empieza con todas las líneas en negativo y anula el efecto de los ${formatAmount(invoice.breakdown.totalAmount)} de la factura.`
                : 'Indicarás solo la diferencia: en negativo si el importe baja, en positivo si sube.'}
            </p>
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending || !reason || noteError !== undefined}>
            <Icon name={pending ? 'spinner' : 'rectify'} spin={pending} />
            {pending ? 'Preparando…' : 'Preparar la rectificativa'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

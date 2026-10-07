import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { InvoiceErrorCode, type Invoice } from '@verifiq/domain';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError, correctRecipient } from '../api';
import { formatAmount } from '../format';
import { Alert } from './components';
import { Icon } from './icons';
import { voidingError } from './VoidDialog';

function correctionError(cause: unknown, sent: boolean): string {
  if (!sent) return voidingError(cause);
  if (cause instanceof ApiError && cause.code === InvoiceErrorCode.NotRectifiable) {
    return 'Esta factura ya no se puede rectificar. Recarga la página para ver su estado.';
  }
  if (cause instanceof ApiError && cause.code === InvoiceErrorCode.CannotIssue) {
    return 'Ahora mismo no puedes emitir: revisa tu representación ante Hacienda en Ajustes.';
  }
  if (cause instanceof ApiError && cause.code === InvoiceErrorCode.DraftNotReady) {
    return 'No se ha podido emitir la rectificativa: revisa la ficha del cliente de la factura (puede estar archivado o sin confirmar en Hacienda).';
  }
  return 'No se ha podido corregir el destinatario. Vuelve a intentarlo.';
}

/**
 * "Corregir destinatario" (ADR 0005), one question: has the user already sent the invoice? Not sent, it
 * is voided; sent, a total corrective invoice is issued. Either way the user lands on a new draft with
 * its content, to choose the right recipient.
 */
export function RecipientCorrectionDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = useId();
  const [sent, setSent] = useState<boolean>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sent === undefined) return;
    setPending(true);
    setError(undefined);
    try {
      const { draft } = await correctRecipient(invoice.id, { sent });
      queryClient.setQueryData(['draft', draft.id], draft);
      void queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      await navigate({ to: '/drafts/$draftId', params: { draftId: draft.id } });
    } catch (cause) {
      setError(correctionError(cause, sent));
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
            Corregir destinatario de <span className="mono">{invoice.number}</span>
          </h2>
          <p className="small ink2">
            Una factura emitida no se cambia de cliente. Te ayudamos a corregirlo de la forma que admite Hacienda y te
            dejamos preparada una factura nueva igual para el cliente correcto.
          </p>
        </div>
        <div className="modal-body">
          <fieldset className="stack" style={{ gap: 10, border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 10 }}>
              ¿Has enviado ya esta factura a {invoice.recipient.name}?
            </legend>
            <label className="chk">
              <input type="radio" name={`${id}-sent`} checked={sent === false} onChange={() => setSent(false)} required />
              <span>No, todavía no la tiene</span>
            </label>
            <label className="chk">
              <input type="radio" name={`${id}-sent`} checked={sent === true} onChange={() => setSent(true)} required />
              <span>Sí, ya se la he enviado</span>
            </label>
          </fieldset>
          {sent === false && (
            <p className="help">
              La anularemos: Hacienda recibirá un registro de anulación, la factura quedará anulada y el número{' '}
              <span className="mono">{invoice.number}</span> no se reutiliza.
            </p>
          )}
          {sent === true && (
            <p className="help">
              Emitiremos ahora una rectificativa en tu serie de rectificativas que deja sin efecto los{' '}
              {formatAmount(invoice.breakdown.totalAmount)} de la factura. Es irreversible.
            </p>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button
            type="submit"
            className={sent === false ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={pending || sent === undefined}
          >
            <Icon name={pending ? 'spinner' : sent === false ? 'ban' : 'swap'} spin={pending} />
            {pending
              ? 'Corrigiendo…'
              : sent === false
                ? 'Anular y preparar la nueva'
                : sent === true
                  ? 'Emitir la rectificativa y preparar la nueva'
                  : 'Continuar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

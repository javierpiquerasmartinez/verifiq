import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { InvoiceErrorCode, type Invoice } from '@verifiq/domain';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError, voidInvoice } from '../api';
import { Alert, Field } from './components';
import { Icon } from './icons';

export function voidingError(cause: unknown): string {
  if (cause instanceof ApiError && cause.code === InvoiceErrorCode.NotVoidable) {
    return 'Esta factura ya no se puede anular: tiene una rectificativa (emitida o en preparación) o Hacienda aún no ha respondido. Recarga la página para ver su estado.';
  }
  if (cause instanceof ApiError && cause.code === InvoiceErrorCode.CannotIssue) {
    return 'Ahora mismo no puedes enviar registros a Hacienda: revisa tu representación en Ajustes.';
  }
  return 'No se ha podido anular la factura. Vuelve a intentarlo.';
}

/**
 * Voiding an invoice that should never have existed, behind a strong confirmation: the user types its
 * number. Its number is burned. With `reissue` (a blocked invoice past its day), a new draft with its
 * content follows, and the user lands on it.
 */
export function VoidDialog({ invoice, reissue = false, onClose }: { invoice: Invoice; reissue?: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const id = useId();
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const confirmed = typed.trim().toUpperCase() === invoice.number.toUpperCase();

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmed) return;
    setPending(true);
    setError(undefined);
    try {
      const { invoice: voided, draft } = await voidInvoice(invoice.id, { reissue });
      queryClient.setQueryData(['invoice', invoice.id], voided);
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (draft) {
        queryClient.setQueryData(['draft', draft.id], draft);
        await navigate({ to: '/drafts/$draftId', params: { draftId: draft.id } });
      } else {
        onClose();
      }
    } catch (cause) {
      setError(voidingError(cause));
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
            {reissue ? 'Anular y volver a emitir' : 'Anular'} <span className="mono">{invoice.number}</span>
          </h2>
        </div>
        <div className="modal-body">
          {reissue ? (
            <p>
              Hacienda no llegó a registrar esta factura y ya no admite hacerlo. La anularemos y prepararemos un borrador nuevo
              con el mismo contenido; al emitirlo tendrá otro número.
            </p>
          ) : (
            <Alert tone="danger" title="Solo para facturas que nunca debieron existir">
              Una operación que no se hizo, una factura de prueba o duplicada. Si la operación se hizo y algo está mal,
              rectifícala en lugar de anularla.
            </Alert>
          )}
          <p className="small ink2">
            Enviaremos a Hacienda un registro de anulación. La factura seguirá en tu listado, anulada y de solo lectura, y
            el número <span className="mono">{invoice.number}</span> queda quemado: no se reutiliza nunca.
          </p>
          <Field
            label={
              <>
                Escribe <span className="mono">{invoice.number}</span> para confirmar
              </>
            }
            value={typed}
            autoComplete="off"
            spellCheck={false}
            className="input mono"
            onChange={(event) => setTyped(event.target.value)}
          />
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-danger" disabled={pending || !confirmed}>
            <Icon name={pending ? 'spinner' : 'ban'} spin={pending} />
            {pending ? 'Anulando…' : reissue ? 'Anular y preparar la nueva' : 'Anular la factura'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { INCIDENT_RECORD_STATUSES, InvoiceErrorCode, isRetryDayOver, todayInSpain, type Invoice } from '@verifiq/domain';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, fetchRecipient, resubmitInvoice } from '../api';
import { Alert, Field } from './components';
import { Icon } from './icons';

type Incident = (typeof INCIDENT_RECORD_STATUSES)[number];

const INCIDENTS: Record<Incident, { title: string; tone: 'danger' | 'warn'; action: string }> = {
  blocked: { title: 'La factura no se ha podido enviar a Hacienda', tone: 'danger', action: 'Corregir y reintentar' },
  rejected: { title: 'Hacienda ha rechazado esta factura', tone: 'danger', action: 'Corregir y reenviar' },
  'accepted-with-errors': { title: 'Hacienda ha aceptado la factura con errores', tone: 'warn', action: 'Subsanar y reenviar' },
};

export const isIncident = (status: Invoice['record']['status']): status is Incident =>
  (INCIDENT_RECORD_STATUSES as readonly string[]).includes(status);

function resubmitError(cause: unknown): string {
  if (cause instanceof ApiError && cause.code === InvoiceErrorCode.RecipientNotReady) {
    return 'Hacienda aún no ha confirmado el NIF del cliente. Corrígelo en su ficha y vuelve a intentarlo.';
  }
  if (cause instanceof ApiError && cause.code === InvoiceErrorCode.RetryDayOver) {
    return 'Ya ha pasado el día de su fecha de expedición: Hacienda no admite registrarla. Habrá que anularla y emitir una nueva.';
  }
  if (cause instanceof ApiError && cause.code === InvoiceErrorCode.NotResubmittable) {
    return 'Esta factura ya se ha reenviado. Recarga la página para ver su estado.';
  }
  return 'No se ha podido reenviar la factura. Vuelve a intentarlo.';
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="incident-step">
      <span className="step">
        <span className="n">{n}</span>
      </span>
      <div>
        <b>{title}</b>
        <div className="small ink2">{children}</div>
      </div>
    </li>
  );
}

/**
 * What to do about a record with an incident: why it happened, and the way out. Blocked or rejected,
 * the user corrects the data and sends it again with the same number (blocked, on its issue date only);
 * accepted with errors, they choose between amending the record's description (Subsanar) and a
 * corrective invoice (Rectificar), the way to correct anything else.
 */
export function RecordIncident({ invoice, incident }: { invoice: Invoice; incident: Incident }) {
  const queryClient = useQueryClient();
  const recipient = useQuery({
    queryKey: ['recipient', invoice.recipientId],
    queryFn: () => fetchRecipient(invoice.recipientId),
    enabled: incident !== 'accepted-with-errors',
    retry: false,
  });
  const [amending, setAmending] = useState(incident !== 'accepted-with-errors');
  const [operationDescription, setOperationDescription] = useState(invoice.operationDescription);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const { record } = invoice;
  const { title, tone, action } = INCIDENTS[incident];
  const reason = incident === 'blocked' ? record.rejection?.explanation : record.aeatError?.message;
  const dayOver = isRetryDayOver(invoice, todayInSpain());
  // Accepted with errors, the invoice exists at the AEAT: its recipient is corrected with a corrective invoice.
  const recipientEditable = incident !== 'accepted-with-errors';

  async function resubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      queryClient.setQueryData(['invoice', invoice.id], await resubmitInvoice(invoice.id, { operationDescription }));
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
    } catch (cause) {
      setError(resubmitError(cause));
    } finally {
      setPending(false);
    }
  }

  const current = recipient.data;
  return (
    <section className={`alert alert-${tone} incident`} aria-labelledby="incident-title">
      <Icon name="alert" size="lg" />
      <div className="stack" style={{ flexGrow: 1, gap: 16 }}>
        <div>
          <h2 className="h3" id="incident-title">
            {title}
          </h2>
          {reason && <p>{reason}</p>}
          {incident === 'accepted-with-errors' && (
            <p className="small">
              Subsana si el error está solo en la descripción de la operación. Si afecta a los datos del cliente, a los
              importes o al IVA, rectifica la factura.
            </p>
          )}
          {incident === 'blocked' && !record.amendment && !dayOver && (
            <p className="small">Corrígela hoy: Hacienda solo la registra el día de su fecha de expedición.</p>
          )}
        </div>

        {dayOver ? (
          <p>
            Ya ha pasado el día de su fecha de expedición, así que Hacienda no admite registrarla. Habrá que anularla (el
            número {invoice.number} no se reutiliza) y emitir una factura nueva.
          </p>
        ) : amending ? (
          <form className="stack" style={{ gap: 12 }} onSubmit={resubmit}>
            <ol className="incident-steps">
              {recipientEditable && (
                <Step n={1} title="Revisa los datos del cliente">
                  Se corrigen en la ficha de{' '}
                  <Link to="/recipients/$recipientId" params={{ recipientId: invoice.recipientId }} className="lnk">
                    {current?.name ?? invoice.recipient.name}
                  </Link>
                  {current && (
                    <>
                      . Ahora: <span className="mono">{current.taxId}</span>
                      {current.censusStatus !== 'identified' && ' (sin confirmar en Hacienda)'}
                    </>
                  )}
                </Step>
              )}
              <Step n={recipientEditable ? 2 : 1} title="Revisa la descripción">
                <Field
                  label="Descripción de la operación"
                  value={operationDescription}
                  maxLength={500}
                  required
                  onChange={(event) => setOperationDescription(event.target.value)}
                  help="Viaja a Hacienda: nunca incluyas datos de pacientes."
                />
              </Step>
              <Step n={recipientEditable ? 3 : 2} title="Reenvía la factura">
                Conserva el número <span className="mono">{invoice.number}</span> y la fecha.
                {invoice.pdf && ' Generaremos un PDF nuevo.'}
              </Step>
            </ol>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary" disabled={pending || !operationDescription.trim()}>
                {pending ? 'Enviando…' : action}
              </button>
              {incident === 'accepted-with-errors' && (
                <button type="button" className="btn btn-ghost" onClick={() => setAmending(false)} disabled={pending}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={() => setAmending(true)}>
              Subsanar
            </button>
            <button type="button" className="btn btn-secondary" disabled title="Disponible próximamente">
              Rectificar
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

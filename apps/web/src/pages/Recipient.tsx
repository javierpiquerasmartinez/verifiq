import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import type { Recipient } from '@verifiq/domain';
import { useState } from 'react';
import { ApiError, deleteRecipient, fetchRecipient, setRecipientArchived } from '../api';
import { useSessionExpiry } from '../session';
import { AppShell } from '../ui/AppShell';
import { CensusTag } from '../ui/CensusTag';
import { Alert } from '../ui/components';
import { RecipientForm } from '../ui/RecipientForm';

function BackLink() {
  return (
    <Link to="/recipients" className="lnk small">
      ← Clientes
    </Link>
  );
}

/** A new Recipient. */
export function NewRecipientPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function saved(recipient: Recipient) {
    await queryClient.invalidateQueries({ queryKey: ['recipients'] });
    queryClient.setQueryData(['recipient', recipient.id], recipient);
    await navigate({ to: '/recipients/$recipientId', params: { recipientId: recipient.id } });
  }

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <BackLink />
          <h1 className="h1">Nuevo cliente</h1>
        </div>
      </div>
      <section className="card" style={{ padding: 24, maxWidth: 760 }}>
        <RecipientForm submitLabel="Guardar cliente" onSaved={saved} />
      </section>
    </AppShell>
  );
}

/** Edit a Recipient; archive it (it has invoices) or delete it (it has none). */
export function RecipientPage() {
  const { recipientId } = useParams({ from: '/recipients/$recipientId' });
  const queryClient = useQueryClient();
  const recipient = useQuery({
    queryKey: ['recipient', recipientId],
    queryFn: () => fetchRecipient(recipientId),
    retry: false,
  });
  const [notice, setNotice] = useState<string>();
  useSessionExpiry(recipient.error);

  async function saved(next: Recipient) {
    queryClient.setQueryData(['recipient', next.id], next);
    await queryClient.invalidateQueries({ queryKey: ['recipients'] });
    setNotice(next.censusStatus === 'identified' ? 'Cambios guardados.' : undefined);
  }

  const notFound = recipient.error instanceof ApiError && recipient.error.status === 404;

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <BackLink />
          <div className="row">
            <h1 className="h1">{recipient.data?.name ?? 'Cliente'}</h1>
            {recipient.data && <CensusTag status={recipient.data.censusStatus} />}
          </div>
        </div>
      </div>
      {recipient.isPending && <p>Cargando…</p>}
      {notFound && <Alert tone="danger">Este cliente no existe o se ha borrado.</Alert>}
      {recipient.isError && !notFound && <Alert tone="danger">No se ha podido cargar el cliente. Recarga la página.</Alert>}
      {recipient.data && (
        <div className="stack" style={{ maxWidth: 760 }}>
          {recipient.data.archived && (
            <Alert tone="info" title="Cliente archivado">
              No aparece al elegir cliente en una factura. Sus facturas lo siguen mostrando.
            </Alert>
          )}
          {recipient.data.censusStatus === 'unchecked' && (
            <Alert tone="warn" title="NIF sin comprobar">
              No hemos podido consultar el censo de Hacienda al guardarlo. Vuelve a guardar para comprobarlo: hasta
              entonces no podrás emitirle facturas.
            </Alert>
          )}
          {notice && <Alert tone="ok">{notice}</Alert>}
          <section className="card stack" style={{ padding: 24 }}>
            <Alert tone="info">
              Los cambios solo se aplican a las facturas nuevas: las ya emitidas conservan los datos con los que se
              emitieron.
            </Alert>
            <RecipientForm
              key={recipient.dataUpdatedAt}
              recipient={recipient.data}
              submitLabel={recipient.data.censusStatus === 'unchecked' ? 'Guardar y comprobar' : 'Guardar cambios'}
              onSaved={saved}
            />
          </section>
          <RecipientActions recipient={recipient.data} />
        </div>
      )}
    </AppShell>
  );
}

function RecipientActions({ recipient }: { recipient: Recipient }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function act(work: () => Promise<void>) {
    setPending(true);
    setError(undefined);
    try {
      await work();
      await queryClient.invalidateQueries({ queryKey: ['recipients'] });
    } catch {
      setError('No se ha podido completar la acción. Vuelve a intentarlo.');
    } finally {
      setPending(false);
    }
  }

  const toggleArchived = () =>
    act(async () => {
      queryClient.setQueryData(['recipient', recipient.id], await setRecipientArchived(recipient.id, !recipient.archived));
    });

  const remove = () => {
    if (!window.confirm(`¿Borrar a ${recipient.name}? No se puede deshacer.`)) return;
    return act(async () => {
      await deleteRecipient(recipient.id);
      queryClient.removeQueries({ queryKey: ['recipient', recipient.id] });
      await navigate({ to: '/recipients' });
    });
  };

  // Archived → restore; with invoices → archive only; never invoiced → delete.
  const action = recipient.archived
    ? {
        title: 'Recuperar',
        text: 'Vuelve a mostrarlo al elegir cliente en una factura.',
        label: 'Recuperar cliente',
        run: toggleArchived,
      }
    : recipient.hasInvoices
      ? {
          title: 'Archivar',
          text: 'Tiene facturas emitidas, así que no se puede borrar. Archívalo para que deje de aparecer al elegir cliente; sus facturas lo seguirán mostrando.',
          label: 'Archivar cliente',
          run: toggleArchived,
        }
      : {
          title: 'Borrar',
          text: 'Aún no le has emitido ninguna factura: puedes borrarlo.',
          label: 'Borrar cliente',
          run: remove,
        };

  return (
    <section className="card stack" style={{ padding: 24 }} aria-labelledby="recipient-actions">
      <h2 className="h3" id="recipient-actions">
        {action.title}
      </h2>
      {error && <Alert tone="danger">{error}</Alert>}
      <p className="small muted">{action.text}</p>
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={action.run} disabled={pending}>
          {action.label}
        </button>
      </div>
    </section>
  );
}

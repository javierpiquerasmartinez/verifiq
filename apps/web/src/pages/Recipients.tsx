import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { RecipientListStatus } from '@verifiq/domain';
import { useDeferredValue, useState } from 'react';
import { fetchRecipients } from '../api';
import { useSessionExpiry } from '../session';
import { AppShell } from '../ui/AppShell';
import { CensusTag } from '../ui/CensusTag';
import { Alert } from '../ui/components';
import { Icon } from '../ui/icons';

const STATUS_LABELS: Record<RecipientListStatus, string> = { active: 'Activos', archived: 'Archivados' };

/** The issuer's Recipients ("Clientes"), searchable; archived ones apart. */
export function RecipientsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RecipientListStatus>('active');
  const q = useDeferredValue(search.trim());
  const recipients = useQuery({
    queryKey: ['recipients', status, q],
    queryFn: () => fetchRecipients({ q, status }),
    placeholderData: keepPreviousData,
    retry: false,
  });
  useSessionExpiry(recipients.error);

  const empty = recipients.data?.length === 0;

  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1 className="h1">Clientes</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Las clínicas y empresas a las que facturas.
          </p>
        </div>
        <Link to="/recipients/new" className="btn btn-primary">
          <Icon name="plus" />
          Nuevo cliente
        </Link>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 16 }}>
        <label className="affix" style={{ width: 360, maxWidth: '100%' }}>
          <span className="sr-only">Buscar clientes</span>
          <Icon name="search" />
          <input
            className="input"
            type="search"
            placeholder="Buscar por nombre, NIF o municipio"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="pills" role="group" aria-label="Mostrar">
          {(Object.keys(STATUS_LABELS) as RecipientListStatus[]).map((value) => (
            <button
              key={value}
              type="button"
              className="pill"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {STATUS_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {recipients.isError && <Alert tone="danger">No se han podido cargar tus clientes. Recarga la página.</Alert>}
      {recipients.isPending && <p>Cargando…</p>}
      {empty && (
        <div className="card" style={{ padding: 24 }}>
          <p className="muted">
            {q
              ? 'Ningún cliente coincide con la búsqueda.'
              : status === 'archived'
                ? 'No tienes clientes archivados.'
                : 'Aún no tienes clientes. Crea el primero para poder facturarle.'}
          </p>
        </div>
      )}
      {recipients.data && !empty && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Nombre o razón social</th>
                <th style={{ width: 160 }}>NIF</th>
                <th style={{ width: 220 }}>Municipio</th>
                <th style={{ width: 180 }}>Censo</th>
              </tr>
            </thead>
            <tbody>
              {recipients.data.map((recipient) => (
                <tr key={recipient.id}>
                  <td>
                    <Link to="/recipients/$recipientId" params={{ recipientId: recipient.id }} className="lnk">
                      {recipient.name}
                    </Link>
                  </td>
                  <td className="mono">{recipient.taxId}</td>
                  <td>{recipient.municipality}</td>
                  <td>
                    <CensusTag status={recipient.censusStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

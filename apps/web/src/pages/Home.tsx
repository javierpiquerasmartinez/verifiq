import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { fetchDrafts, fetchHealth } from '../api';
import { formatAmount } from '../format';
import { useSessionExpiry } from '../session';
import { AppShell } from '../ui/AppShell';
import { Alert } from '../ui/components';

const UPDATED_AT = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' });

export function HomePage() {
  const drafts = useQuery({ queryKey: ['drafts'], queryFn: fetchDrafts, retry: false });
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });
  useSessionExpiry(drafts.error);

  return (
    <AppShell>
      <div className="page-head">
        <h1 className="h1">Facturas</h1>
      </div>

      <section className="stack" aria-labelledby="drafts-title" style={{ marginBottom: 32 }}>
        <h2 className="h3" id="drafts-title">
          Borradores
        </h2>
        {drafts.isPending && <p>Cargando…</p>}
        {drafts.isError && <Alert tone="danger">No se han podido cargar tus borradores. Recarga la página.</Alert>}
        {drafts.data?.length === 0 && (
          <div className="card" style={{ padding: 24 }}>
            <p className="muted">
              No tienes borradores. Pulsa <b>Nueva factura</b> para preparar la primera: no tendrá número hasta que la
              emitas.
            </p>
          </div>
        )}
        {drafts.data && drafts.data.length > 0 && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Descripción</th>
                  <th className="r" style={{ width: 160 }}>
                    Total a pagar
                  </th>
                  <th style={{ width: 170 }}>Última edición</th>
                </tr>
              </thead>
              <tbody>
                {drafts.data.map((draft) => (
                  <tr key={draft.id}>
                    <td>
                      <Link to="/drafts/$draftId" params={{ draftId: draft.id }} className="lnk">
                        {draft.recipientName ?? 'Sin cliente'}
                      </Link>
                    </td>
                    <td>{draft.operationDescription || <span className="muted">Sin descripción</span>}</td>
                    <td className="r num">{formatAmount(draft.amountDue)}</td>
                    <td className="muted">{UPDATED_AT.format(new Date(draft.updatedAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="card" style={{ padding: 24 }}>
        {health.isPending && <p>Conectando con la API…</p>}
        {health.isError && <p role="alert">No se pudo contactar con la API.</p>}
        {health.isSuccess && (
          <dl className="kv">
            <dt>Versión de la API</dt>
            <dd className="mono">{health.data.version}</dd>
            <dt>Base de datos</dt>
            <dd>Conectada</dd>
          </dl>
        )}
      </div>
    </AppShell>
  );
}

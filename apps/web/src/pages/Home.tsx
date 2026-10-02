import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../api';
import { AppShell } from '../ui/AppShell';

export function HomePage() {
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });

  return (
    <AppShell>
      <div className="page-head">
        <h1 className="h1">Facturas</h1>
      </div>
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

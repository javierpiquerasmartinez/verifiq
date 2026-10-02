import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ApiError, fetchHealth, fetchMe } from '../api';
import { authClient } from '../auth-client';
import { BrandMark } from '../ui/icons';

export function HomePage() {
  const navigate = useNavigate();
  const me = useQuery({ queryKey: ['me'], queryFn: fetchMe, retry: false });
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });

  // The session expired (inactivity or 7-day limit) while the page was open.
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) {
      void navigate({ to: '/entrar', search: { motivo: 'caducada' } });
    }
  }, [me.error, navigate]);

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: '/entrar' });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <span className="brand">
            <BrandMark />
            Verifiq
          </span>
          {me.data && (
            <div className="emisor">
              <b>{me.data.name}</b>
              <span>{me.data.email}</span>
            </div>
          )}
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="page">
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
      </main>
      <footer className="foot">
        <span>Verifiq {__APP_VERSION__}</span>
        <span>Sistema de facturación VERI*FACTU</span>
      </footer>
    </div>
  );
}

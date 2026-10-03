import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { fetchIssuer } from '../api';
import { authClient } from '../auth-client';
import { useSessionExpiry } from '../session';
import { BrandMark, Icon } from './icons';

/**
 * The app once onboarding is complete: header with the active issuer, a persistent warning while
 * the issuer cannot issue (no valid Representation), page, footer.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const issuer = useQuery({ queryKey: ['issuer'], queryFn: fetchIssuer, retry: false });
  useSessionExpiry(issuer.error);

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: '/sign-in' });
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          <Link to="/" className="brand">
            <BrandMark />
            Verifiq
          </Link>
          <nav className="nav" aria-label="Principal">
            <Link to="/" activeProps={{ className: 'on' }} activeOptions={{ exact: true }}>
              Facturas
            </Link>
            <Link to="/settings" activeProps={{ className: 'on' }}>
              Ajustes
            </Link>
          </nav>
          {issuer.data && (
            <div className="issuer" aria-label="Emisor activo">
              <b>{issuer.data.name}</b>
              <span>NIF {issuer.data.taxId}</span>
            </div>
          )}
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            Cerrar sesión
          </button>
        </div>
      </header>
      {issuer.data?.canIssue === false && (
        <div className="banner" role="status">
          <div className="banner-in">
            <Icon name="alert" />
            <span style={{ flexGrow: 1 }}>
              <b>Aún no puedes emitir facturas.</b> Falta firmar la autorización ante la AEAT. Mientras tanto puedes
              preparar borradores, clientes y artículos.
            </span>
            <Link to="/onboarding/representation" className="btn btn-secondary btn-sm">
              Firmar autorización
            </Link>
          </div>
        </div>
      )}
      <main className="page">{children}</main>
      <footer className="foot">
        <span>Verifiq {__APP_VERSION__}</span>
        <span>Sistema de facturación VERI*FACTU</span>
      </footer>
    </div>
  );
}

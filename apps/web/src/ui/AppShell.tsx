import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { fetchIssuer } from '../api';
import { authClient } from '../auth-client';
import { useSessionExpiry } from '../session';
import { BrandMark } from './icons';

/** The app once onboarding is complete: header with the active issuer, page, footer. */
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
          <span className="brand">
            <BrandMark />
            Verifiq
          </span>
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
      <main className="page">{children}</main>
      <footer className="foot">
        <span>Verifiq {__APP_VERSION__}</span>
        <span>Sistema de facturación VERI*FACTU</span>
      </footer>
    </div>
  );
}

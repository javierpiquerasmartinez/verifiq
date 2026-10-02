import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { fetchEmisor } from '../api';
import { authClient } from '../auth-client';
import { useSessionExpiry } from '../session';
import { BrandMark } from './icons';

/** The app once the alta is complete: header with the active Emisor, page, footer. */
export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const emisor = useQuery({ queryKey: ['emisor'], queryFn: fetchEmisor, retry: false });
  useSessionExpiry(emisor.error);

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
          {emisor.data && (
            <div className="emisor" aria-label="Emisor activo">
              <b>{emisor.data.name}</b>
              <span>NIF {emisor.data.nif}</span>
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

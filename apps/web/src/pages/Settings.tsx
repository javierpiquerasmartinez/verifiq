import { AppShell } from '../ui/AppShell';
import { RepresentationPanel } from '../ui/RepresentationPanel';

/** Settings. For now only the Representation; the issuer's data comes with issue 20. */
export function SettingsPage() {
  return (
    <AppShell>
      <div className="page-head">
        <h1 className="h1">Ajustes</h1>
      </div>
      <section className="card stack" style={{ padding: 24, maxWidth: 760 }} aria-labelledby="representation-title">
        <div>
          <h2 className="h3" id="representation-title">
            Autorización ante la AEAT
          </h2>
          <p className="small muted">Permite que Verifiq registre tus facturas en la AEAT en tu nombre.</p>
        </div>
        <RepresentationPanel />
      </section>
    </AppShell>
  );
}

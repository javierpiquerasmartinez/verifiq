import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { invoiceNumber, type Onboarding } from '@verifiq/domain';
import { useState, type ReactNode } from 'react';
import { fetchOnboarding, updateIssuerDefaults, updateIssuerFiscalData } from '../api';
import { useSessionExpiry } from '../session';
import { AppShell } from '../ui/AppShell';
import { Alert } from '../ui/components';
import { Icon } from '../ui/icons';
import { DefaultsForm, FiscalDataForm } from '../ui/IssuerForms';
import { RepresentationPanel } from '../ui/RepresentationPanel';
import { ChangePasswordForm, RecoveryCodes, SessionList } from '../ui/SecuritySettings';

/** The year of today's date in Spain, which names the series of the invoices issued now. */
const currentYear = () =>
  Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric' }).format(new Date()));

function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section className="card stack" style={{ padding: 24 }} aria-labelledby={id}>
      <div>
        <h2 className="h3" id={id}>
          {title}
        </h2>
        {intro && <p className="small muted">{intro}</p>}
      </div>
      {children}
    </section>
  );
}

type IssuerSection = 'fiscal-data' | 'defaults';

/** Save button of a settings form, with the confirmation of the last save. */
function SaveActions({ pending, saved }: { pending: boolean; saved: boolean }) {
  return (
    <div className="row" style={{ alignItems: 'center' }}>
      <button className="btn btn-primary" disabled={pending}>
        {pending ? 'Guardando…' : 'Guardar cambios'}
      </button>
      {saved && !pending && (
        <span className="small muted" role="status">
          <Icon name="check" size="xs" /> Guardado
        </span>
      )}
    </div>
  );
}

/** Settings: the issuer's data and defaults, its numbering and Representation, the account's security, legal. */
export function SettingsPage() {
  const queryClient = useQueryClient();
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: fetchOnboarding, retry: false });
  const [saved, setSaved] = useState<IssuerSection>();
  useSessionExpiry(onboarding.error);

  function onSaved(section: IssuerSection) {
    return async (next: Onboarding) => {
      queryClient.setQueryData(['onboarding'], next);
      setSaved(section);
      // The header shows the issuer's name.
      await queryClient.invalidateQueries({ queryKey: ['issuer'] });
    };
  }

  const data = onboarding.data;
  const year = currentYear();

  return (
    <AppShell>
      <div className="page-head">
        <h1 className="h1">Ajustes</h1>
      </div>
      <div className="stack" style={{ maxWidth: 760, gap: 24 }}>
        {onboarding.isPending && <p className="muted">Cargando…</p>}
        {onboarding.isError && <Alert tone="danger">No se han podido cargar tus datos. Recarga la página.</Alert>}
        {data && (
          <>
            <Section
              id="fiscal-data-title"
              title="Datos fiscales"
              intro="Aparecen en tus facturas. Los cambios se aplican a las facturas que emitas a partir de ahora: las ya emitidas no cambian."
            >
              <FiscalDataForm
                onboarding={data}
                taxIdLocked
                // The API ignores the tax ID it carries: it cannot change.
                save={updateIssuerFiscalData}
                onSaved={onSaved('fiscal-data')}
                actions={(pending) => <SaveActions pending={pending} saved={saved === 'fiscal-data'} />}
              />
            </Section>

            <Section
              id="defaults-title"
              title="Impuestos por defecto"
              intro="Cada factura nueva empieza con estos valores. Las facturas y borradores que ya tienes no cambian."
            >
              <DefaultsForm
                onboarding={data}
                save={updateIssuerDefaults}
                onSaved={onSaved('defaults')}
                actions={(pending) => <SaveActions pending={pending} saved={saved === 'defaults'} />}
              />
            </Section>

            {data.series && (
              <Section id="series-title" title="Numeración">
                <Alert tone="info" title="Tu numeración no se puede cambiar">
                  Se eligió al darte de alta. Empieza en 1 y vuelve a empezar cada 1 de enero.
                </Alert>
                <dl className="kv">
                  <dt>Facturas</dt>
                  <dd className="mono">{invoiceNumber(data.series.prefix, year, 1)}, …</dd>
                  <dt>Rectificativas</dt>
                  <dd className="mono">{invoiceNumber(data.series.correctivePrefix, year, 1)}, …</dd>
                </dl>
              </Section>
            )}
          </>
        )}

        <Section
          id="representation-title"
          title="Autorización ante la AEAT"
          intro="Permite que Verifiq registre tus facturas en la AEAT en tu nombre."
        >
          <RepresentationPanel />
        </Section>

        <Section id="password-title" title="Contraseña">
          <ChangePasswordForm />
        </Section>

        <Section id="recovery-codes-title" title="Códigos de recuperación">
          <RecoveryCodes />
        </Section>

        <Section
          id="sessions-title"
          title="Sesiones abiertas"
          intro="Los dispositivos donde has entrado en Verifiq. Si no reconoces alguno, cierra su sesión y cambia tu contraseña."
        >
          <SessionList />
        </Section>

        <Section id="declaration-title" title="Declaración responsable">
          <p className="ink2">
            La declaración del productor de Verifiq sobre el cumplimiento del sistema de facturación, con la versión
            que estás usando (<span className="mono">{__APP_VERSION__}</span>).
          </p>
          <div className="row">
            <Link to="/responsible-declaration" className="btn btn-secondary">
              Ver declaración responsable
            </Link>
          </div>
        </Section>
      </div>
    </AppShell>
  );
}

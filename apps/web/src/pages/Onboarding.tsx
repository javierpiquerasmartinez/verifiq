import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  DEFAULT_CORRECTIVE_PREFIX,
  DEFAULT_SERIES_PREFIX,
  invoiceNumber,
  LEGAL_DOCUMENTS,
  seriesSchema,
  type Onboarding,
  type OnboardingStep,
} from '@verifiq/domain';
import { useEffect, useState, type FormEvent } from 'react';
import { acceptTerms, confirmSeries, fetchOnboarding, saveDefaults, saveFiscalData } from '../api';
import { authClient } from '../auth-client';
import { useSessionExpiry } from '../session';
import { AccessLayout, Alert, Field } from '../ui/components';
import { DefaultsForm, FiscalDataForm, useSubmit } from '../ui/IssuerForms';
import { Stepper } from '../ui/Stepper';

const STEP_TITLES: Record<OnboardingStep, { title: string; subtitle: string }> = {
  'fiscal-data': {
    title: 'Tus datos fiscales',
    subtitle: 'Aparecerán en todas tus facturas. Puedes guardar y seguir más tarde: retomarás el alta en el mismo paso.',
  },
  defaults: {
    title: 'Impuestos por defecto',
    subtitle: 'Cada factura nueva empezará con estos valores. Podrás cambiarlos en cualquier factura.',
  },
  series: {
    title: 'Numeración de tus facturas',
    subtitle: 'Tus facturas de Verifiq tendrán una Serie propia que empieza en 1.',
  },
  terms: {
    title: 'Condiciones del servicio',
    subtitle: 'Acepta las condiciones para empezar a usar Verifiq.',
  },
};

/** The year of today's date in Spain, which names the series of the invoices issued now. */
const currentYear = () =>
  Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric' }).format(new Date()));

/**
 * Issuer onboarding: four steps, each saved as it is completed, resumable at any time. Step 5,
 * the Representation, has its own page (RepresentationStep.tsx) since it outlives onboarding.
 */
export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: fetchOnboarding, retry: false });
  const [viewing, setViewing] = useState<OnboardingStep>();
  useSessionExpiry(onboarding.error);

  const data = onboarding.data;
  const step = viewing ?? (data && data.step !== 'completed' ? data.step : undefined);

  useEffect(() => {
    if (data?.step === 'completed') void navigate({ to: '/onboarding/representation' });
  }, [data?.step, navigate]);

  function saved(next: Onboarding) {
    queryClient.setQueryData(['onboarding'], next);
    setViewing(undefined);
  }

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: '/sign-in' });
  }

  const heading = step ? STEP_TITLES[step] : { title: 'Alta en Verifiq', subtitle: '' };

  return (
    <AccessLayout
      wide="wider"
      title={heading.title}
      subtitle={heading.subtitle}
      footer={
        <button type="button" className="lnk" onClick={signOut}>
          Salir y continuar más tarde
        </button>
      }
    >
      {onboarding.isPending && <p>Cargando…</p>}
      {onboarding.isError && <Alert tone="danger">No se ha podido cargar tu alta. Recarga la página.</Alert>}
      {data && step && (
        <>
          <Stepper current={step} reached={data.step} onSelect={setViewing} />
          {step === 'fiscal-data' && <FiscalDataStep onboarding={data} onSaved={saved} />}
          {step === 'defaults' && (
            <DefaultsStep onboarding={data} onSaved={saved} onBack={() => setViewing('fiscal-data')} />
          )}
          {step === 'series' && (
            <SeriesStep onboarding={data} onSaved={saved} onBack={() => setViewing('defaults')} />
          )}
          {step === 'terms' && (
            <TermsStep onSaved={saved} onBack={() => setViewing('series')} />
          )}
        </>
      )}
    </AccessLayout>
  );
}

interface StepProps {
  onSaved: (next: Onboarding) => void;
}

function FiscalDataStep({ onboarding, onSaved }: StepProps & { onboarding: Onboarding }) {
  return (
    <FiscalDataForm
      onboarding={onboarding}
      save={saveFiscalData}
      onSaved={onSaved}
      actions={(pending) => (
        <button className="btn btn-primary btn-block" disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar y continuar'}
        </button>
      )}
    />
  );
}

function DefaultsStep({ onboarding, onSaved, onBack }: StepProps & { onboarding: Onboarding; onBack: () => void }) {
  return (
    <DefaultsForm
      onboarding={onboarding}
      save={saveDefaults}
      onSaved={onSaved}
      actions={(pending) => (
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Atrás
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar y continuar'}
          </button>
        </div>
      )}
    />
  );
}

function SeriesStep({ onboarding, onSaved, onBack }: StepProps & { onboarding: Onboarding; onBack: () => void }) {
  const year = currentYear();
  const [prefix, setPrefix] = useState(DEFAULT_SERIES_PREFIX);
  const [correctivePrefix, setCorrectivePrefix] = useState(DEFAULT_CORRECTIVE_PREFIX);
  const [checked, setChecked] = useState(false);
  const { pending, error, run } = useSubmit();

  if (onboarding.series) {
    const { series } = onboarding;
    return (
      <div className="stack">
        <Alert tone="info" title="Tu numeración está confirmada">
          No se puede cambiar.
        </Alert>
        <dl className="kv">
          <dt>Facturas</dt>
          <dd className="mono">{invoiceNumber(series.prefix, year, 1)}, …</dd>
          <dt>Rectificativas</dt>
          <dd className="mono">{invoiceNumber(series.correctivePrefix, year, 1)}, …</dd>
        </dl>
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Atrás
          </button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => onSaved(onboarding)}>
            Continuar
          </button>
        </div>
      </div>
    );
  }

  const parsed = seriesSchema.safeParse({ prefix, correctivePrefix });
  const issue = (key: 'prefix' | 'correctivePrefix') =>
    parsed.success ? undefined : parsed.error.issues.find((i) => i.path[0] === key)?.message;
  const preview = (value: string) => invoiceNumber(value.trim() || '…', year, 1);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!parsed.success) return;
    await run(async () => onSaved(await confirmSeries(parsed.data)));
  }

  return (
    <form className="stack" onSubmit={submit}>
      {error && <Alert tone="danger">{error}</Alert>}
      <Alert tone="warn" title="Usa una Serie distinta de la de tu programa anterior">
        Si este año ya has facturado con otro programa, elige un prefijo que no hayas usado allí. Así tus
        facturas de Verifiq nunca coincidirán en número con las anteriores, y no necesitas saber por qué número
        ibas.
      </Alert>
      <div className="grid">
        <Field
          label="Prefijo de tus facturas"
          className="input mono"
          maxLength={10}
          value={prefix}
          onChange={(event) => setPrefix(event.target.value.toUpperCase())}
          error={issue('prefix')}
          help={
            <>
              La primera será <b className="mono">{preview(prefix)}</b>
            </>
          }
        />
        <Field
          label="Prefijo de tus rectificativas"
          className="input mono"
          maxLength={10}
          value={correctivePrefix}
          onChange={(event) => setCorrectivePrefix(event.target.value.toUpperCase())}
          error={issue('correctivePrefix')}
          help={
            <>
              La primera será <b className="mono">{preview(correctivePrefix)}</b>
            </>
          }
        />
      </div>
      <p className="small muted">
        La numeración empieza en 1 y vuelve a empezar cada 1 de enero con el año nuevo.
      </p>
      <label className="chk">
        <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        <span>
          He comprobado que no he usado estas series en otro programa. Sé que{' '}
          <b>no podré cambiarlas después</b>.
        </span>
      </label>
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Atrás
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={pending || !checked || !parsed.success}>
          {pending ? 'Confirmando…' : 'Confirmar numeración'}
        </button>
      </div>
    </form>
  );
}

function TermsStep({ onSaved, onBack }: StepProps & { onBack: () => void }) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const { pending, error, run } = useSubmit();
  const { termsOfUse: terms, dataProcessingAgreement: agreement } = LEGAL_DOCUMENTS;

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () =>
      onSaved(
        await acceptTerms({ termsOfUseVersion: terms.version, dataProcessingAgreementVersion: agreement.version }),
      ),
    );
  }

  return (
    <form className="stack" onSubmit={submit}>
      {error && <Alert tone="danger">{error}</Alert>}
      <p className="ink2">
        Los términos de uso regulan tu relación con Verifiq. El contrato de encargo del tratamiento recoge cómo
        tratamos, por cuenta tuya, los datos de tus facturas y de tus clientes.
      </p>
      <label className="chk">
        <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
        <span>
          He leído y acepto los <b>{terms.title}</b> <span className="muted">(versión {terms.version})</span>.
        </span>
      </label>
      <label className="chk">
        <input
          type="checkbox"
          checked={agreementAccepted}
          onChange={(event) => setAgreementAccepted(event.target.checked)}
        />
        <span>
          He leído y acepto el <b>{agreement.title}</b> <span className="muted">(versión {agreement.version})</span>.
        </span>
      </label>
      <p className="small muted">Guardaremos la fecha de tu aceptación y la versión de cada documento.</p>
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Atrás
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={pending || !termsAccepted || !agreementAccepted}>
          {pending ? 'Guardando…' : 'Aceptar y continuar'}
        </button>
      </div>
    </form>
  );
}

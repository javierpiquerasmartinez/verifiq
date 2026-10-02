import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  DEFAULT_RECTIFICATIVA_PREFIX,
  DEFAULT_SERIE_PREFIX,
  EmisorErrorCode,
  fiscalDataSchema,
  invoiceNumber,
  IVA_RATES,
  LEGAL_DOCUMENTS,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  normalizeTaxId,
  ONBOARDING_STEPS,
  parseTaxId,
  RETENCION_IRPF_RATES,
  seriesSchema,
  SUPUESTO_EXENCION_IDS,
  supuestoExencion,
  type EmisorDefaults,
  type FiscalData,
  type IvaTreatment,
  type Onboarding,
  type OnboardingStep,
  type RetencionIrpfRate,
  type SupuestoExencionId,
} from '@verifiq/domain';
import { useEffect, useState, type FormEvent } from 'react';
import {
  acceptTerms,
  ApiError,
  confirmSeries,
  fetchOnboarding,
  logoUrl,
  removeLogo,
  saveDefaults,
  saveFiscalData,
  uploadLogo,
} from '../api';
import { authClient } from '../auth-client';
import { useSessionExpiry } from '../session';
import { AccessLayout, Alert, Field, Select, Seg } from '../ui/components';
import { Icon } from '../ui/icons';

const STEP_LABELS: Record<OnboardingStep, string> = {
  'fiscal-data': 'Tus datos',
  defaults: 'Impuestos',
  serie: 'Numeración',
  terms: 'Condiciones',
};

const STEP_TITLES: Record<OnboardingStep, { title: string; subtitle: string }> = {
  'fiscal-data': {
    title: 'Tus datos fiscales',
    subtitle: 'Aparecerán en todas tus facturas. Puedes guardar y seguir más tarde: retomarás el alta en el mismo paso.',
  },
  defaults: {
    title: 'Impuestos por defecto',
    subtitle: 'Cada factura nueva empezará con estos valores. Podrás cambiarlos en cualquier factura.',
  },
  serie: {
    title: 'Numeración de tus facturas',
    subtitle: 'Tus facturas de Verifiq tendrán una Serie propia que empieza en 1.',
  },
  terms: {
    title: 'Condiciones del servicio',
    subtitle: 'Último paso: acepta las condiciones para empezar a usar Verifiq.',
  },
};

/** The year of today's date in Spain, which names the Serie of the invoices issued now. */
const currentYear = () =>
  Number(new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric' }).format(new Date()));

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case EmisorErrorCode.NifTaken:
        return 'Ya hay un Emisor dado de alta con este NIF. Si es el tuyo, escríbenos.';
      case EmisorErrorCode.SerieAlreadyConfirmed:
        return 'Tu numeración ya estaba confirmada y no se puede cambiar.';
      case EmisorErrorCode.LegalVersionOutdated:
        return 'Las condiciones se han actualizado mientras tanto. Recarga la página y vuelve a leerlas.';
      case EmisorErrorCode.LogoInvalid:
        return 'El logo debe ser una imagen PNG o JPEG.';
      case EmisorErrorCode.OnboardingStepPending:
        return 'Falta completar un paso anterior.';
    }
    if (error.status === 413) return 'El logo ocupa demasiado: como máximo 1 MB.';
  }
  return 'No se ha podido guardar. Vuelve a intentarlo.';
}

function Stepper({
  current,
  reached,
  onSelect,
}: {
  current: OnboardingStep;
  reached: Onboarding['step'];
  onSelect: (step: OnboardingStep) => void;
}) {
  const index = ONBOARDING_STEPS.indexOf(current);
  const reachedIndex = reached === 'completed' ? ONBOARDING_STEPS.length : ONBOARDING_STEPS.indexOf(reached);
  return (
    <ol className="steps" aria-label="Pasos del alta">
      {ONBOARDING_STEPS.map((step, i) => {
        const className = `step${i < reachedIndex && i !== index ? ' done' : ''}${i === index ? ' on' : ''}`;
        const content = (
          <>
            <span className="n">{i < reachedIndex && i !== index ? <Icon name="check" /> : i + 1}</span>
            {STEP_LABELS[step]}
          </>
        );
        return (
          <li key={step} aria-current={i === index ? 'step' : undefined}>
            {i <= reachedIndex && i !== index ? (
              <button type="button" className={className} onClick={() => onSelect(step)}>
                {content}
              </button>
            ) : (
              <span className={className}>{content}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Alta del Emisor: four steps, each saved as it is completed, resumable at any time. */
export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: fetchOnboarding, retry: false });
  const [viewing, setViewing] = useState<OnboardingStep>();
  useSessionExpiry(onboarding.error);

  const data = onboarding.data;
  const step = viewing ?? (data && data.step !== 'completed' ? data.step : undefined);

  useEffect(() => {
    if (data?.step === 'completed') void navigate({ to: '/' });
  }, [data?.step, navigate]);

  function saved(next: Onboarding) {
    queryClient.setQueryData(['onboarding'], next);
    setViewing(undefined);
  }

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: '/entrar' });
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
          {step === 'serie' && (
            <SerieStep onboarding={data} onSaved={saved} onBack={() => setViewing('defaults')} />
          )}
          {step === 'terms' && (
            <TermsStep onSaved={saved} onBack={() => setViewing('serie')} />
          )}
        </>
      )}
    </AccessLayout>
  );
}

interface StepProps {
  onSaved: (next: Onboarding) => void;
}

function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function run(work: () => Promise<void>) {
    setPending(true);
    setError(undefined);
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return { pending, error, run };
}

const EMPTY_FISCAL_DATA: Record<keyof FiscalData, string> = {
  name: '',
  nif: '',
  address: '',
  postalCode: '',
  municipality: '',
  province: '',
  email: '',
  phone: '',
  iban: '',
};

const FIELD_ERRORS: Record<keyof FiscalData, string> = {
  name: 'Escribe tu nombre completo o razón social (hasta 120 caracteres).',
  nif: 'El NIF no es válido: revisa los números y la letra.',
  address: 'Escribe tu domicilio fiscal.',
  postalCode: 'El código postal debe tener 5 cifras.',
  municipality: 'Escribe el municipio.',
  province: 'Escribe la provincia.',
  email: 'El email no es válido.',
  phone: 'El teléfono no es válido.',
  iban: 'El IBAN no es válido: revisa las cifras.',
};

function FiscalDataStep({ onboarding, onSaved }: StepProps & { onboarding: Onboarding }) {
  const [values, setValues] = useState<Record<keyof FiscalData, string>>(() => ({
    ...EMPTY_FISCAL_DATA,
    ...Object.fromEntries(
      Object.entries(onboarding.fiscalData ?? {}).map(([key, value]) => [key, value ?? '']),
    ),
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof FiscalData, string>>>({});
  const [logo, setLogo] = useState<File | null>(null);
  const [logoError, setLogoError] = useState<string>();
  const [hasLogo, setHasLogo] = useState(onboarding.hasLogo);
  const [logoVersion, setLogoVersion] = useState(() => Date.now());
  const { pending, error, run } = useSubmit();

  const set = (key: keyof FiscalData) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  // Validated as typed once it has the length of a NIF, so a typo shows up before saving.
  const nif = normalizeTaxId(values.nif);
  const nifError = errors.nif ?? (nif.length >= 9 && !parseTaxId(nif).valid ? FIELD_ERRORS.nif : undefined);

  function pickLogo(file: File | undefined) {
    setLogoError(undefined);
    if (!file) return setLogo(null);
    if (!(LOGO_CONTENT_TYPES as readonly string[]).includes(file.type)) {
      return setLogoError('El logo debe ser una imagen PNG o JPEG.');
    }
    if (file.size > LOGO_MAX_BYTES) return setLogoError('El logo ocupa demasiado: como máximo 1 MB.');
    setLogo(file);
  }

  async function dropLogo() {
    await run(async () => {
      await removeLogo();
      setHasLogo(false);
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = fiscalDataSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof FiscalData, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FiscalData;
        fieldErrors[key] = FIELD_ERRORS[key];
      }
      return setErrors(fieldErrors);
    }
    await run(async () => {
      const next = await saveFiscalData(parsed.data);
      // The Emisor exists once its fiscal data is saved: only then can it have a logo.
      if (logo) {
        await uploadLogo(logo);
        setLogo(null);
        setLogoVersion(Date.now());
      }
      onSaved({ ...next, hasLogo: next.hasLogo || Boolean(logo) });
    });
  }

  const field = (key: keyof FiscalData) => ({ value: values[key], onChange: set(key), error: errors[key] });

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Nombre completo o razón social" autoComplete="name" required {...field('name')} />
      <Field
        label="NIF"
        autoComplete="off"
        required
        className="input mono"
        help="Tu DNI con la letra, o tu NIE."
        {...field('nif')}
        error={nifError}
      />
      <div className="grid">
        <div className="span3">
          <Field label="Domicilio fiscal" autoComplete="street-address" required {...field('address')} />
        </div>
        <Field label="Código postal" inputMode="numeric" autoComplete="postal-code" maxLength={5} required {...field('postalCode')} />
        <Field label="Municipio" autoComplete="address-level2" required {...field('municipality')} />
        <Field label="Provincia" autoComplete="address-level1" required {...field('province')} />
      </div>

      <hr className="divider" />
      <div>
        <h2 className="h3">Opcional</h2>
        <p className="small muted">Si los indicas, aparecerán en tus facturas.</p>
      </div>
      <div className="grid">
        <div className="span2">
          <Field label="Email" type="email" autoComplete="email" {...field('email')} />
        </div>
        <Field label="Teléfono" type="tel" autoComplete="tel" {...field('phone')} />
        <div className="span3">
          <Field
            label="IBAN"
            className="input mono"
            help="Para que tus clientes sepan dónde pagarte."
            {...field('iban')}
          />
        </div>
      </div>
      <div className="field">
        <span className="label">Logo</span>
        {hasLogo && !logo && (
          <div className="logo-box">
            <img src={logoUrl(logoVersion)} alt="Tu logo actual" />
            <button type="button" className="btn btn-ghost" onClick={dropLogo} disabled={pending}>
              Quitar logo
            </button>
          </div>
        )}
        <input
          type="file"
          accept={LOGO_CONTENT_TYPES.join(',')}
          aria-label={hasLogo ? 'Cambiar el logo' : 'Subir un logo'}
          onChange={(event) => pickLogo(event.target.files?.[0])}
        />
        {logoError ? <p className="err">{logoError}</p> : <p className="help">PNG o JPEG, hasta 1 MB.</p>}
      </div>

      <button className="btn btn-primary btn-block" disabled={pending}>
        {pending ? 'Guardando…' : 'Guardar y continuar'}
      </button>
    </form>
  );
}

const IRPF_LABELS: Record<RetencionIrpfRate, string> = { 15: '15 %', 7: '7 %', 0: 'Sin retención' };

type IvaChoice = 'exempt' | `${(typeof IVA_RATES)[number]}`;

function ivaChoiceOf(iva: IvaTreatment): IvaChoice {
  return iva.kind === 'exempt' ? 'exempt' : `${iva.rate}`;
}

function DefaultsStep({ onboarding, onSaved, onBack }: StepProps & { onboarding: Onboarding; onBack: () => void }) {
  const initial = onboarding.defaults;
  const [retencionIrpf, setRetencionIrpf] = useState<RetencionIrpfRate>(initial?.retencionIrpf ?? 15);
  const [iva, setIva] = useState<IvaChoice>(initial ? ivaChoiceOf(initial.iva) : '21');
  const [supuesto, setSupuesto] = useState<SupuestoExencionId>(
    initial?.iva.kind === 'exempt' ? initial.iva.supuesto : SUPUESTO_EXENCION_IDS[0],
  );
  const { pending, error, run } = useSubmit();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const defaults: EmisorDefaults = {
      retencionIrpf,
      iva:
        iva === 'exempt'
          ? { kind: 'exempt', supuesto }
          : { kind: 'taxed', rate: Number(iva) as (typeof IVA_RATES)[number] },
    };
    await run(async () => onSaved(await saveDefaults(defaults)));
  }

  return (
    <form className="stack" onSubmit={submit}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="field">
        <span className="label">Retención de IRPF</span>
        <Seg
          label="Retención de IRPF"
          options={RETENCION_IRPF_RATES.map((rate) => ({ value: rate, label: IRPF_LABELS[rate] }))}
          value={retencionIrpf}
          onChange={setRetencionIrpf}
        />
        <p className="help">
          Lo habitual para profesionales es el 15 %; el 7 % durante los tres primeros años de actividad.
        </p>
      </div>
      <Select label="IVA" value={iva} onChange={(event) => setIva(event.target.value as IvaChoice)}>
        <option value="exempt">Exenta</option>
        {IVA_RATES.map((rate) => (
          <option key={rate} value={`${rate}`}>
            {rate} %
          </option>
        ))}
      </Select>
      {iva === 'exempt' && (
        <Select
          label="Supuesto de exención"
          value={supuesto}
          onChange={(event) => setSupuesto(event.target.value as SupuestoExencionId)}
          help="Determina la mención legal que se imprime en tus facturas."
        >
          {SUPUESTO_EXENCION_IDS.map((id) => (
            <option key={id} value={id}>
              {supuestoExencion(id).label}
            </option>
          ))}
        </Select>
      )}
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Atrás
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={pending}>
          {pending ? 'Guardando…' : 'Guardar y continuar'}
        </button>
      </div>
    </form>
  );
}

function SerieStep({ onboarding, onSaved, onBack }: StepProps & { onboarding: Onboarding; onBack: () => void }) {
  const year = currentYear();
  const [prefix, setPrefix] = useState(DEFAULT_SERIE_PREFIX);
  const [rectificativaPrefix, setRectificativaPrefix] = useState(DEFAULT_RECTIFICATIVA_PREFIX);
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
          <dd className="mono">{invoiceNumber(series.rectificativaPrefix, year, 1)}, …</dd>
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

  const parsed = seriesSchema.safeParse({ prefix, rectificativaPrefix });
  const issue = (key: 'prefix' | 'rectificativaPrefix') =>
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
          value={rectificativaPrefix}
          onChange={(event) => setRectificativaPrefix(event.target.value.toUpperCase())}
          error={issue('rectificativaPrefix')}
          help={
            <>
              La primera será <b className="mono">{preview(rectificativaPrefix)}</b>
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
  const [terminos, setTerminos] = useState(false);
  const [contratoEncargo, setContratoEncargo] = useState(false);
  const { pending, error, run } = useSubmit();
  const { terminos: terms, contratoEncargo: contract } = LEGAL_DOCUMENTS;

  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () =>
      onSaved(
        await acceptTerms({ terminosVersion: terms.version, contratoEncargoVersion: contract.version }),
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
        <input type="checkbox" checked={terminos} onChange={(event) => setTerminos(event.target.checked)} />
        <span>
          He leído y acepto los <b>{terms.title}</b> <span className="muted">(versión {terms.version})</span>.
        </span>
      </label>
      <label className="chk">
        <input
          type="checkbox"
          checked={contratoEncargo}
          onChange={(event) => setContratoEncargo(event.target.checked)}
        />
        <span>
          He leído y acepto el <b>{contract.title}</b> <span className="muted">(versión {contract.version})</span>.
        </span>
      </label>
      <p className="small muted">Guardaremos la fecha de tu aceptación y la versión de cada documento.</p>
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Atrás
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={pending || !terminos || !contratoEncargo}>
          {pending ? 'Guardando…' : 'Aceptar y terminar'}
        </button>
      </div>
    </form>
  );
}

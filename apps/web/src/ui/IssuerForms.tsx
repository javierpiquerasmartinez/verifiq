import {
  fiscalDataSchema,
  IssuerErrorCode,
  LOGO_CONTENT_TYPES,
  LOGO_MAX_BYTES,
  normalizeTaxId,
  parseTaxId,
  VAT_RATES,
  WITHHOLDING_RATES,
  type ExemptionGroundId,
  type FiscalData,
  type IssuerDefaults,
  type Onboarding,
  type WithholdingRate,
} from '@verifiq/domain';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, logoUrl, removeLogo, uploadLogo } from '../api';
import { EXEMPTION_GROUND_REQUIRED, vatChoiceOf, vatOfChoice, type VatChoice } from '../draft-lines';
import { WITHHOLDING_LABELS } from '../format';
import { Alert, Field, Select, Seg } from './components';
import { ExemptionGroundSelect } from './ExemptionGroundSelect';

// The issuer's data and defaults: the onboarding wizard fills them, the settings edit them.

export function issuerErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case IssuerErrorCode.TaxIdTaken:
        return 'Ya hay un Emisor dado de alta con este NIF. Si es el tuyo, escríbenos.';
      case IssuerErrorCode.SeriesAlreadyConfirmed:
        return 'Tu numeración ya estaba confirmada y no se puede cambiar.';
      case IssuerErrorCode.LegalVersionOutdated:
        return 'Las condiciones se han actualizado mientras tanto. Recarga la página y vuelve a leerlas.';
      case IssuerErrorCode.LogoInvalid:
        return 'El logo debe ser una imagen PNG o JPEG.';
      case IssuerErrorCode.OnboardingStepPending:
        return 'Falta completar un paso anterior.';
      case IssuerErrorCode.OnboardingCompleted:
        return 'Tu alta ya está completa: cambia tus datos desde Ajustes.';
    }
    if (error.status === 413) return 'El logo ocupa demasiado: como máximo 1 MB.';
  }
  return 'No se ha podido guardar. Vuelve a intentarlo.';
}

/** Runs a save, keeping its pending state and the message of its error. */
export function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function run(work: () => Promise<void>) {
    setPending(true);
    setError(undefined);
    try {
      await work();
    } catch (cause) {
      setError(issuerErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return { pending, error, run };
}

const EMPTY_FISCAL_DATA: Record<keyof FiscalData, string> = {
  name: '',
  taxId: '',
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
  taxId: 'El NIF no es válido: revisa los números y la letra.',
  address: 'Escribe tu domicilio fiscal.',
  postalCode: 'El código postal debe tener 5 cifras.',
  municipality: 'Escribe el municipio.',
  province: 'Escribe la provincia.',
  email: 'El email no es válido.',
  phone: 'El teléfono no es válido.',
  iban: 'El IBAN no es válido: revisa las cifras.',
};

interface IssuerFormProps<T> {
  onboarding: Onboarding;
  save: (data: T) => Promise<Onboarding>;
  onSaved: (next: Onboarding) => void;
  /** The form's buttons; the submit one shows `pending`. */
  actions: (pending: boolean) => ReactNode;
}

/** Fiscal data and logo. With `taxIdLocked` (settings) the tax ID is shown but cannot change. */
export function FiscalDataForm({
  onboarding,
  save,
  onSaved,
  actions,
  taxIdLocked = false,
}: IssuerFormProps<FiscalData> & { taxIdLocked?: boolean }) {
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

  // Validated as typed once it has the length of a tax ID, so a typo shows up before saving.
  const taxId = normalizeTaxId(values.taxId);
  const taxIdError = errors.taxId ?? (taxId.length >= 9 && !parseTaxId(taxId).valid ? FIELD_ERRORS.taxId : undefined);

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
      const next = await save(parsed.data);
      // The issuer exists once its fiscal data is saved: only then can it have a logo.
      if (logo) {
        await uploadLogo(logo);
        setLogo(null);
        setLogoVersion(Date.now());
        setHasLogo(true);
      }
      onSaved({ ...next, hasLogo: next.hasLogo || Boolean(logo) });
    });
  }

  const field = (key: keyof FiscalData) => ({ value: values[key], onChange: set(key), error: errors[key] });

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Nombre completo o razón social" autoComplete="name" required {...field('name')} />
      {taxIdLocked ? (
        <Field
          label="NIF"
          className="input mono"
          readOnly
          value={values.taxId}
          help="No se puede cambiar: tu autorización ante la AEAT y tu alta en el sistema de registro van ligadas a él."
        />
      ) : (
        <Field
          label="NIF"
          autoComplete="off"
          required
          className="input mono"
          help="Tu DNI con la letra, o tu NIE."
          {...field('taxId')}
          error={taxIdError}
        />
      )}
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

      {actions(pending)}
    </form>
  );
}

/** The withholding and the VAT every new invoice starts with. */
export function DefaultsForm({ onboarding, save, onSaved, actions }: IssuerFormProps<IssuerDefaults>) {
  const initial = onboarding.defaults;
  const [withholding, setWithholding] = useState<WithholdingRate>(initial?.withholding ?? 15);
  const [vat, setVat] = useState<VatChoice>(initial ? vatChoiceOf(initial.vat) : '21');
  const [ground, setGround] = useState<ExemptionGroundId | ''>(initial?.vat.kind === 'exempt' ? initial.vat.ground : '');
  const [groundError, setGroundError] = useState<string>();
  const { pending, error, run } = useSubmit();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const chosen = vatOfChoice(vat, ground);
    if (!chosen) return setGroundError(EXEMPTION_GROUND_REQUIRED);
    await run(async () => onSaved(await save({ withholding, vat: chosen })));
  }

  return (
    <form className="stack" onSubmit={submit}>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="field">
        <span className="label">Retención de IRPF</span>
        <Seg
          label="Retención de IRPF"
          options={WITHHOLDING_RATES.map((rate) => ({ value: rate, label: WITHHOLDING_LABELS[rate] }))}
          value={withholding}
          onChange={setWithholding}
        />
        <p className="help">
          Lo habitual para profesionales es el 15 %; el 7 % durante los tres primeros años de actividad.
        </p>
      </div>
      <Select label="IVA" value={vat} onChange={(event) => setVat(event.target.value as VatChoice)}>
        <option value="exempt">Exenta</option>
        {VAT_RATES.map((rate) => (
          <option key={rate} value={`${rate}`}>
            {rate} %
          </option>
        ))}
      </Select>
      {vat === 'exempt' && (
        <ExemptionGroundSelect
          value={ground}
          onChange={(chosen) => {
            setGround(chosen);
            setGroundError(undefined);
          }}
          help="Determina la mención legal que se imprime en tus facturas."
          error={groundError}
        />
      )}
      {actions(pending)}
    </form>
  );
}

import {
  normalizeTaxId,
  parseTaxId,
  RecipientErrorCode,
  recipientDataSchema,
  type Recipient,
  type RecipientData,
} from '@verifiq/domain';
import { useState, type FormEvent } from 'react';
import { ApiError, createRecipient, updateRecipient } from '../api';
import { Alert, Field } from './components';

type Values = Record<keyof RecipientData, string>;

const EMPTY: Values = { name: '', taxId: '', address: '', postalCode: '', municipality: '', province: '' };

const FIELD_ERRORS: Record<keyof RecipientData, string> = {
  name: 'Escribe el nombre o la razón social (hasta 120 caracteres).',
  taxId: 'El NIF no es válido: revisa los números y la letra. Solo se admiten NIF, NIE o CIF españoles.',
  address: 'Escribe la dirección.',
  postalCode: 'El código postal debe tener 5 cifras.',
  municipality: 'Escribe el municipio.',
  province: 'Escribe la provincia.',
};

/** What the census said, as an error on the field to correct; anything else is a general error. */
function censusError(error: unknown): { field?: keyof RecipientData; message: string } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case RecipientErrorCode.TaxIdNotInCensus:
        return {
          field: 'taxId',
          message: 'Este NIF no figura en el censo de Hacienda. Revisa los números y la letra: la AEAT rechazaría sus facturas.',
        };
      case RecipientErrorCode.TaxIdInactive:
        return {
          field: 'taxId',
          message: 'Este NIF figura de baja en el censo de Hacienda: la AEAT rechazaría sus facturas.',
        };
      case RecipientErrorCode.CensusRejected:
        return {
          field: 'taxId',
          message: 'Hacienda no ha aceptado la consulta de este NIF. Revísalo y vuelve a intentarlo.',
        };
      case RecipientErrorCode.CensusNameMismatch: {
        const censusName = (error.body as { censusName?: unknown } | undefined)?.censusName;
        return {
          field: 'name',
          message:
            typeof censusName === 'string'
              ? `En el censo de Hacienda este NIF figura como «${censusName}». Escribe el nombre tal como consta allí.`
              : 'En el censo de Hacienda este NIF figura con otro nombre. Escribe el nombre o la razón social tal como consta allí.',
        };
      }
    }
  }
  return { message: 'No se ha podido guardar el cliente. Vuelve a intentarlo.' };
}

/**
 * Create or edit a Recipient. Saving checks the tax ID against the AEAT census; what it answers
 * shows up on the field to correct. Reused wherever a recipient is created.
 */
export function RecipientForm({
  recipient,
  submitLabel,
  onSaved,
}: {
  recipient?: Recipient;
  submitLabel: string;
  onSaved: (recipient: Recipient) => void;
}) {
  const [values, setValues] = useState<Values>(() =>
    recipient
      ? {
          name: recipient.name,
          taxId: recipient.taxId,
          address: recipient.address,
          postalCode: recipient.postalCode,
          municipality: recipient.municipality,
          province: recipient.province,
        }
      : EMPTY,
  );
  const [errors, setErrors] = useState<Partial<Values>>({});
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const set = (key: keyof RecipientData) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  // Validated as typed once it has the length of a tax ID, so a typo shows up before saving.
  const taxId = normalizeTaxId(values.taxId);
  const taxIdError = errors.taxId ?? (taxId.length >= 9 && !parseTaxId(taxId).valid ? FIELD_ERRORS.taxId : undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    const parsed = recipientDataSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Values> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof RecipientData;
        fieldErrors[key] = FIELD_ERRORS[key];
      }
      return setErrors(fieldErrors);
    }
    setPending(true);
    try {
      onSaved(recipient ? await updateRecipient(recipient.id, parsed.data) : await createRecipient(parsed.data));
    } catch (cause) {
      const { field, message } = censusError(cause);
      if (field) setErrors((current) => ({ ...current, [field]: message }));
      else setError(message);
    } finally {
      setPending(false);
    }
  }

  const field = (key: keyof RecipientData) => ({ value: values[key], onChange: set(key), error: errors[key] });

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Nombre o razón social" autoComplete="organization" required {...field('name')} />
      <Field
        label="NIF o CIF"
        autoComplete="off"
        required
        className="input mono"
        help="Comprobaremos en el censo de Hacienda que existe y corresponde a este nombre."
        {...field('taxId')}
        error={taxIdError}
      />
      <div className="grid">
        <div className="span3">
          <Field label="Dirección" autoComplete="street-address" required {...field('address')} />
        </div>
        <Field
          label="Código postal"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          required
          {...field('postalCode')}
        />
        <Field label="Municipio" autoComplete="address-level2" required {...field('municipality')} />
        <Field label="Provincia" autoComplete="address-level1" required {...field('province')} />
      </div>
      <div className="row">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? 'Comprobando en el censo…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

import {
  catalogItemDataSchema,
  EXEMPTION_GROUND_IDS,
  exemptionGround,
  VAT_RATES,
  type CatalogItem,
  type ExemptionGroundId,
  type VatTreatment,
} from '@verifiq/domain';
import { useState, type FormEvent } from 'react';
import { createCatalogItem, updateCatalogItem } from '../api';
import { vatChoiceOf, vatFor, type VatChoice } from '../draft-lines';
import { decimalInputOf, parseDecimalInput } from '../format';
import { Alert, Field, Select } from './components';

/**
 * Create or edit a CatalogItem ("Artículo"). A new one starts with the issuer's default VAT.
 * Saving it never changes the lines already copied from it.
 */
export function CatalogItemForm({
  item,
  defaultVat,
  submitLabel,
  onSaved,
}: {
  item?: CatalogItem;
  defaultVat: VatTreatment;
  submitLabel: string;
  onSaved: (item: CatalogItem) => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(item ? decimalInputOf(item.defaultUnitPrice) : '');
  const [vat, setVat] = useState<VatTreatment>(item?.defaultVat ?? defaultVat);
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    const defaultUnitPrice = parseDecimalInput(price, 4);
    const parsed = catalogItemDataSchema.safeParse({ name, defaultUnitPrice, defaultVat: vat });
    if (!parsed.success) {
      return setErrors({
        name: name.trim() ? undefined : 'Escribe el nombre del artículo: será el concepto de la línea.',
        price: defaultUnitPrice === null ? 'Precio no válido: un importe positivo con hasta 4 decimales.' : undefined,
      });
    }
    setPending(true);
    try {
      onSaved(item ? await updateCatalogItem(item.id, parsed.data) : await createCatalogItem(parsed.data));
    } catch {
      setError('No se ha podido guardar el artículo. Vuelve a intentarlo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field
        label="Nombre"
        required
        maxLength={500}
        placeholder="Por ejemplo: Endodoncia"
        help="Es el concepto con el que aparecerá en la línea de la factura."
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setErrors((current) => ({ ...current, name: undefined }));
        }}
        error={errors.name}
      />
      <div className="grid2">
        <Field
          label="Precio por defecto"
          inputMode="decimal"
          placeholder="0,00"
          className="input r"
          value={price}
          onChange={(event) => {
            setPrice(event.target.value);
            setErrors((current) => ({ ...current, price: undefined }));
          }}
          help="Sin IVA. Podrás cambiarlo en cada factura."
          error={errors.price}
        />
        <Select
          label="IVA por defecto"
          value={vatChoiceOf(vat)}
          onChange={(event) => setVat(vatFor(event.target.value as VatChoice, vat, defaultVat))}
        >
          <option value="exempt">Exenta</option>
          {VAT_RATES.map((rate) => (
            <option key={rate} value={`${rate}`}>
              {rate} %
            </option>
          ))}
        </Select>
      </div>
      {vat.kind === 'exempt' && (
        <Select
          label="Supuesto de exención"
          value={vat.ground}
          onChange={(event) => setVat({ kind: 'exempt', ground: event.target.value as ExemptionGroundId })}
          help="Determina la mención legal que se imprime en la factura."
        >
          {EXEMPTION_GROUND_IDS.map((id) => (
            <option key={id} value={id}>
              {exemptionGround(id).label}
            </option>
          ))}
        </Select>
      )}
      <div className="row">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

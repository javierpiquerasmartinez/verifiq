import { catalogItemDataSchema, VAT_RATES, type CatalogItem, type ExemptionGroundId, type VatTreatment } from '@verifiq/domain';
import { useState, type FormEvent } from 'react';
import { createCatalogItem, updateCatalogItem } from '../api';
import { EXEMPTION_GROUND_REQUIRED, vatChoiceOf, vatOfChoice, type VatChoice } from '../draft-lines';
import { decimalInputOf, parseDecimalInput } from '../format';
import { Alert, Field, Select } from './components';
import { ExemptionGroundSelect } from './ExemptionGroundSelect';

/**
 * Create or edit a CatalogItem ("Artículo"). A new one starts with the issuer's default VAT; turning
 * it exempt afterwards asks for its exemption ground. Saving it never changes the lines already copied from it.
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
  const initialVat = item?.defaultVat ?? defaultVat;
  const [vat, setVat] = useState<VatChoice>(vatChoiceOf(initialVat));
  const [ground, setGround] = useState<ExemptionGroundId | ''>(initialVat.kind === 'exempt' ? initialVat.ground : '');
  const [errors, setErrors] = useState<{ name?: string; price?: string; ground?: string }>({});
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    const defaultUnitPrice = parseDecimalInput(price, 4);
    const chosenVat = vatOfChoice(vat, ground);
    const parsed = catalogItemDataSchema.safeParse({ name, defaultUnitPrice, defaultVat: chosenVat });
    if (!parsed.success) {
      return setErrors({
        name: name.trim() ? undefined : 'Escribe el nombre del artículo: será el concepto de la línea.',
        price: defaultUnitPrice === null ? 'Precio no válido: un importe positivo con hasta 4 decimales.' : undefined,
        ground: chosenVat ? undefined : EXEMPTION_GROUND_REQUIRED,
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
        <Select label="IVA por defecto" value={vat} onChange={(event) => setVat(event.target.value as VatChoice)}>
          <option value="exempt">Exenta</option>
          {VAT_RATES.map((rate) => (
            <option key={rate} value={`${rate}`}>
              {rate} %
            </option>
          ))}
        </Select>
      </div>
      {vat === 'exempt' && (
        <ExemptionGroundSelect
          value={ground}
          onChange={(chosen) => {
            setGround(chosen);
            setErrors((current) => ({ ...current, ground: undefined }));
          }}
          help="Determina la mención legal que se imprime en la factura."
          error={errors.ground}
        />
      )}
      <div className="row">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

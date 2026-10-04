import { EXEMPTION_GROUND_IDS, exemptionGround, VAT_RATES, type ExemptionGroundId, type VatTreatment } from '@verifiq/domain';
import { vatChoiceOf, type LineErrors, type LineState, type VatChoice } from '../draft-lines';
import { formatAmount } from '../format';
import { Icon } from './icons';

/** The treatment a line takes when its VAT choice changes; an exempt line keeps or inherits a ground. */
function vatFor(choice: VatChoice, current: VatTreatment, defaultVat: VatTreatment): VatTreatment {
  if (choice !== 'exempt') return { kind: 'taxed', rate: Number(choice) as (typeof VAT_RATES)[number] };
  const ground: ExemptionGroundId =
    current.kind === 'exempt' ? current.ground : defaultVat.kind === 'exempt' ? defaultVat.ground : EXEMPTION_GROUND_IDS[0];
  return { kind: 'exempt', ground };
}

/** One line of the draft editor: concept, quantity, unit price, discount, VAT and its base. */
export function DraftLineRow({
  index,
  line,
  errors,
  conceptMissing,
  base,
  defaultVat,
  onChange,
  onRemove,
}: {
  index: number;
  line: LineState;
  errors: LineErrors;
  conceptMissing: boolean;
  /** The line base as the breakdown computed it. */
  base: string;
  defaultVat: VatTreatment;
  onChange: (change: Partial<LineState>) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const messages = [conceptMissing && 'Escribe el concepto o elimina esta línea.', ...Object.values(errors)].filter(Boolean);
  return (
    <div className="line">
      <div className="line-grid">
        <input
          className="input"
          aria-label={`Concepto de la línea ${n}`}
          placeholder="Concepto"
          value={line.concept}
          maxLength={500}
          onChange={(event) => onChange({ concept: event.target.value })}
          aria-invalid={conceptMissing ? true : undefined}
        />
        <input
          className="input r"
          aria-label={`Cantidad de la línea ${n}`}
          inputMode="decimal"
          value={line.quantity}
          onChange={(event) => onChange({ quantity: event.target.value })}
          aria-invalid={errors.quantity ? true : undefined}
        />
        <input
          className="input r"
          aria-label={`Precio unitario de la línea ${n}`}
          inputMode="decimal"
          placeholder="0,00"
          value={line.unitPrice}
          onChange={(event) => onChange({ unitPrice: event.target.value })}
          aria-invalid={errors.unitPrice ? true : undefined}
        />
        <input
          className="input r"
          aria-label={`Descuento de la línea ${n}`}
          inputMode="decimal"
          placeholder="—"
          value={line.discountPercent}
          onChange={(event) => onChange({ discountPercent: event.target.value })}
          aria-invalid={errors.discountPercent ? true : undefined}
        />
        <span className="sel">
          <select
            className="input"
            aria-label={`IVA de la línea ${n}`}
            value={vatChoiceOf(line.vat)}
            onChange={(event) => onChange({ vat: vatFor(event.target.value as VatChoice, line.vat, defaultVat) })}
          >
            <option value="exempt">Exenta</option>
            {VAT_RATES.map((rate) => (
              <option key={rate} value={`${rate}`}>
                {rate} %
              </option>
            ))}
          </select>
          <Icon name="chevron" />
        </span>
        <span className="num r" style={{ fontWeight: 500 }}>
          {formatAmount(base)}
        </span>
        <button type="button" className="btn btn-ghost btn-icon" aria-label={`Eliminar la línea ${n}`} onClick={onRemove}>
          <Icon name="close" />
        </button>
      </div>
      {line.vat.kind === 'exempt' && (
        <ExemptionGroundPicker
          line={index}
          value={line.vat.ground}
          onChange={(ground) => onChange({ vat: { kind: 'exempt', ground } })}
        />
      )}
      {messages.map((message) => (
        <p key={String(message)} className="err">
          {message}
        </p>
      ))}
    </div>
  );
}

/** The exemption ground of an exempt line: its label, and a choice when the catalogue has more than one. */
function ExemptionGroundPicker({
  line,
  value,
  onChange,
}: {
  line: number;
  value: ExemptionGroundId;
  onChange: (ground: ExemptionGroundId) => void;
}) {
  if (EXEMPTION_GROUND_IDS.length === 1) {
    return <p className="xs muted">Exenta: {exemptionGround(value).label}</p>;
  }
  return (
    <span className="sel" style={{ maxWidth: 520 }}>
      <select
        className="input"
        aria-label={`Supuesto de exención de la línea ${line + 1}`}
        value={value}
        onChange={(event) => onChange(event.target.value as ExemptionGroundId)}
      >
        {EXEMPTION_GROUND_IDS.map((id) => (
          <option key={id} value={id}>
            {exemptionGround(id).label}
          </option>
        ))}
      </select>
      <Icon name="chevron" />
    </span>
  );
}

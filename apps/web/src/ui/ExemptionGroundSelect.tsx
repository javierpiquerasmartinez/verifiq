import { EXEMPTION_GROUND_IDS, exemptionGround, type ExemptionGroundId } from '@verifiq/domain';
import { Select } from './components';

/** The options of an exemption ground picker: the whole catalogue, by label. */
export function ExemptionGroundOptions() {
  return EXEMPTION_GROUND_IDS.map((id) => (
    <option key={id} value={id}>
      {exemptionGround(id).label}
    </option>
  ));
}

/**
 * Picks the exemption ground of a default VAT. Nothing is preselected: the ground decides the legal
 * mention printed on every invoice, so it has to be chosen on purpose.
 */
export function ExemptionGroundSelect({
  value,
  onChange,
  help,
  error,
}: {
  value: ExemptionGroundId | '';
  onChange: (ground: ExemptionGroundId) => void;
  help: string;
  error?: string;
}) {
  return (
    <Select
      label="Supuesto de exención"
      value={value}
      onChange={(event) => onChange(event.target.value as ExemptionGroundId)}
      help={(value && exemptionGround(value).help) || help}
      error={error}
    >
      {value === '' && (
        <option value="" disabled>
          Elige el supuesto
        </option>
      )}
      <ExemptionGroundOptions />
    </Select>
  );
}

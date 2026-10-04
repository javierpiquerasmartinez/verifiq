import { Fragment } from 'react';
import { formatAmount } from '../format';

/** Indented label–amount pairs inside a `.sum` list: the detail under a total. */
export function AmountRows({ rows }: { rows: [label: string, amount: string][] }) {
  return rows.map(([label, amount]) => (
    <Fragment key={label}>
      <dt style={{ paddingLeft: 12 }}>{label}</dt>
      <dd className="muted">{formatAmount(amount)}</dd>
    </Fragment>
  ));
}

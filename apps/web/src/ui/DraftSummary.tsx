import type { Breakdown } from '@verifiq/domain';
import { formatAmount, formatWithheld } from '../format';
import { AmountRows } from './AmountRows';

/** The live summary of a draft: bases and tax by rate, exempt bases with their mention, totals. */
export function DraftSummary({ breakdown, recipientName }: { breakdown: Breakdown; recipientName?: string }) {
  const { rate: withholding } = breakdown.withholding;
  return (
    <section className="card stack" style={{ padding: 22 }} aria-labelledby="draft-summary">
      <h2 className="h3" id="draft-summary">
        Resumen
      </h2>
      <dl className="sum">
        <dt>Base imponible</dt>
        <dd>{formatAmount(breakdown.taxBase)}</dd>
        {breakdown.taxed.map(({ rate, base, taxAmount }) => (
          <AmountRows
            key={rate}
            rows={[
              [`Base al ${rate} %`, base],
              [`IVA ${rate} %`, taxAmount],
            ]}
          />
        ))}
        {breakdown.exempt.map(({ ground, base }) => (
          <AmountRows key={ground} rows={[['Exenta', base]]} />
        ))}
      </dl>
      {breakdown.exempt.map(({ ground, mention }) => (
        <p key={ground} className="xs muted mention">
          {mention}
        </p>
      ))}
      <hr className="divider" />
      <dl className="sum">
        <dt className="strong">Importe total</dt>
        <dd className="strong">{formatAmount(breakdown.totalAmount)}</dd>
        <dt>Retención de IRPF {withholding ? `(${withholding} %)` : '(sin retención)'}</dt>
        <dd>{formatWithheld(breakdown.withholding.amount)}</dd>
      </dl>
      <div className="tp">
        <span className="tp-l small">Total a pagar</span>
        <span className="tp-v">{formatAmount(breakdown.amountDue)}</span>
        {recipientName && (
          <span className="xs" style={{ color: 'var(--primary)' }}>
            {/* A corrective invoice that lowers the amounts is paid back to the recipient. */}
            {breakdown.amountDue.startsWith('-') ? `Lo que devuelves a ${recipientName}` : `Lo que te paga ${recipientName}`}
          </span>
        )}
      </div>
    </section>
  );
}

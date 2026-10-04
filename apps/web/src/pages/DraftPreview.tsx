import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { exemptionGround, formatSpanishDate, type Draft, type DraftLine, type FiscalData } from '@verifiq/domain';
import { ApiError, fetchDraft, fetchOnboarding, logoUrl } from '../api';
import { decimalInputOf, formatAmount, formatWithheld } from '../format';
import { useSessionExpiry } from '../session';
import { AmountRows } from '../ui/AmountRows';
import { AppShell } from '../ui/AppShell';
import { Alert } from '../ui/components';
import { Icon } from '../ui/icons';

/** How the invoice will look, before it is issued: no number yet and no fiscal effect. */
export function DraftPreviewPage() {
  const { draftId } = useParams({ from: '/drafts/$draftId/preview' });
  const draft = useQuery({ queryKey: ['draft', draftId], queryFn: () => fetchDraft(draftId), retry: false });
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: fetchOnboarding, retry: false });
  useSessionExpiry(draft.error ?? onboarding.error);

  const notFound = draft.error instanceof ApiError && draft.error.status === 404;
  return (
    <AppShell>
      <div className="page-head no-print">
        <div>
          <Link to="/drafts/$draftId" params={{ draftId }} className="lnk small">
            ← Volver al borrador
          </Link>
          <h1 className="h1">Vista previa</h1>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
          <Icon name="print" />
          Imprimir
        </button>
      </div>
      {(draft.isPending || onboarding.isPending) && <p>Cargando…</p>}
      {notFound && <Alert tone="danger">Este borrador no existe o se ha borrado.</Alert>}
      {(onboarding.isError || (draft.isError && !notFound)) && (
        <Alert tone="danger">No se ha podido cargar la vista previa. Recarga la página.</Alert>
      )}
      {draft.data && onboarding.data?.fiscalData && (
        <InvoiceSheet draft={draft.data} issuer={onboarding.data.fiscalData} hasLogo={onboarding.data.hasLogo} />
      )}
    </AppShell>
  );
}

const vatLabel = ({ vat }: DraftLine) => (vat.kind === 'exempt' ? 'Exenta' : `${vat.rate} %`);

function InvoiceSheet({ draft, issuer, hasLogo }: { draft: Draft; issuer: FiscalData; hasLogo: boolean }) {
  const { breakdown, recipient } = draft;
  return (
    <article className="sheet" aria-label="Factura">
      <p className="sheet-watermark" role="note">
        Borrador · sin número ni validez fiscal
      </p>
      <header className="sheet-head">
        <div>
          {hasLogo && <img className="sheet-logo" src={logoUrl(0)} alt="" />}
          <p className="sheet-party-name">{issuer.name}</p>
          <p>NIF {issuer.taxId}</p>
          <p>{issuer.address}</p>
          <p>
            {issuer.postalCode} {issuer.municipality} ({issuer.province})
          </p>
          {issuer.email && <p>{issuer.email}</p>}
          {issuer.phone && <p>{issuer.phone}</p>}
        </div>
        <div className="sheet-meta">
          <h2 className="h2">Factura</h2>
          <dl className="kv">
            <dt>Número</dt>
            <dd>Se asignará al emitir</dd>
            <dt>Fecha de expedición</dt>
            <dd>{formatSpanishDate(draft.issueDate)}</dd>
            {draft.billingPeriod && (
              <>
                <dt>Periodo facturado</dt>
                <dd>
                  {formatSpanishDate(draft.billingPeriod.start)} – {formatSpanishDate(draft.billingPeriod.end)}
                </dd>
                <dt>Fecha de operación</dt>
                <dd>{formatSpanishDate(draft.billingPeriod.end)}</dd>
              </>
            )}
          </dl>
        </div>
      </header>

      <section className="sheet-recipient" aria-label="Destinatario">
        <p className="eyebrow">Facturar a</p>
        {recipient ? (
          <>
            <p className="sheet-party-name">{recipient.name}</p>
            <p>NIF {recipient.taxId}</p>
            <p>{recipient.address}</p>
            <p>
              {recipient.postalCode} {recipient.municipality} ({recipient.province})
            </p>
          </>
        ) : (
          <p className="muted">Sin cliente</p>
        )}
      </section>

      {draft.operationDescription && <p className="sheet-description">{draft.operationDescription}</p>}

      <table className="tbl sheet-lines">
        <thead>
          <tr>
            <th>Concepto</th>
            <th className="r">Cantidad</th>
            <th className="r">Precio unit.</th>
            <th className="r">Dto.</th>
            <th>IVA</th>
            <th className="r">Importe</th>
          </tr>
        </thead>
        <tbody>
          {draft.lines.map((line, i) => (
            <tr key={i}>
              <td>{line.concept || <span className="muted">Sin concepto</span>}</td>
              <td className="r num">{decimalInputOf(line.quantity)}</td>
              <td className="r num">{formatAmount(line.unitPrice)}</td>
              <td className="r num">{line.discountPercent ? `${decimalInputOf(line.discountPercent)} %` : '—'}</td>
              <td>{vatLabel(line)}</td>
              <td className="r num">{formatAmount(breakdown.lines[i]!.base)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sheet-totals">
        <div className="sheet-mentions">
          {breakdown.exempt.map(({ ground, mention }) => (
            <p key={ground} className="small">
              {exemptionGround(ground).label}: {mention}
            </p>
          ))}
          {issuer.iban && (
            <p className="small">
              Forma de pago: transferencia a <span className="mono">{issuer.iban.replace(/(.{4})(?!$)/g, '$1 ')}</span>
            </p>
          )}
        </div>
        <dl className="sum">
          <dt>Base imponible</dt>
          <dd>{formatAmount(breakdown.taxBase)}</dd>
          {breakdown.taxed.map(({ rate, base, taxAmount }) => (
            <AmountRows key={rate} rows={[[`Base imponible ${rate} %`, base], [`Cuota IVA ${rate} %`, taxAmount]]} />
          ))}
          {breakdown.exempt.map(({ ground, base }) => (
            <AmountRows key={ground} rows={[['Base exenta', base]]} />
          ))}
          <dt className="strong">Importe total</dt>
          <dd className="strong">{formatAmount(breakdown.totalAmount)}</dd>
          <dt>Retención de IRPF ({breakdown.withholding.rate} %)</dt>
          <dd>{formatWithheld(breakdown.withholding.amount)}</dd>
        </dl>
      </div>
      <div className="tp sheet-due">
        <span className="tp-l small">Total a pagar</span>
        <span className="tp-v">{formatAmount(breakdown.amountDue)}</span>
      </div>
    </article>
  );
}

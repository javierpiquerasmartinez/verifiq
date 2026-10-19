import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { correctionReasonLabel, formatIban, formatSpanishDate, type Draft, type DraftLine, type FiscalData, type RecipientData } from '@verifiq/domain';
import { Fragment } from 'react';
import { ApiError, fetchDraft, fetchOnboarding, logoUrl } from '../api';
import { decimalInputOf, formatAmount, formatWithheld } from '../format';
import { useSessionExpiry } from '../session';
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

/** An amount in the lines' table, where the € goes without saying. */
const amountWithoutCurrency = (amount: string) => formatAmount(amount).replace(/\s*€$/, '');

/** Who issues or receives the invoice: name, tax ID and address. */
function Party({ heading, party }: { heading: string; party: RecipientData | null }) {
  return (
    <div>
      <p className="sheet-eyebrow">{heading}</p>
      {party ? (
        <>
          <p className="sheet-party-name">{party.name}</p>
          <p>NIF {party.taxId}</p>
          <p>
            {party.address} · {party.postalCode} {party.municipality}
          </p>
        </>
      ) : (
        <p className="muted">Sin cliente</p>
      )}
    </div>
  );
}

/** The draft laid out as the PDF it will become: the same sheet, without the QR or the number it gets on issuing. */
function InvoiceSheet({ draft, issuer, hasLogo }: { draft: Draft; issuer: FiscalData; hasLogo: boolean }) {
  const { breakdown, billingPeriod, operationDate, correction } = draft;
  return (
    <article className="sheet" aria-label="Factura">
      <p className="sheet-watermark" role="note">
        Borrador · sin número ni validez fiscal
      </p>
      <header className="sheet-head">
        <div className="sheet-qr" role="note">
          <span className="sheet-qr-caption">QR tributario:</span>
          <span className="sheet-qr-slot small">Se añade al emitir</span>
          <span className="sheet-qr-caption mono">VERI*FACTU</span>
        </div>
        <div className="sheet-title">
          {hasLogo && <img className="sheet-logo" src={logoUrl(0)} alt="" />}
          <h2 className="sheet-h1">{correction ? 'Factura rectificativa' : 'Factura'}</h2>
          <p className="mono muted">Número al emitir</p>
          <p>Fecha de expedición: {formatSpanishDate(draft.issueDate)}</p>
          {billingPeriod && (
            <p>
              Periodo: {formatSpanishDate(billingPeriod.start)} – {formatSpanishDate(billingPeriod.end)}
            </p>
          )}
          {operationDate && operationDate !== draft.issueDate && (
            <p>Fecha de operación: {formatSpanishDate(operationDate)}</p>
          )}
        </div>
      </header>

      <div className="sheet-parties">
        <Party heading="Emisor" party={issuer} />
        <Party heading="Cliente" party={draft.recipient} />
      </div>

      {correction && (
        <div className="sheet-correction">
          <p style={{ fontWeight: 600 }}>
            Rectifica la factura <span className="mono">{correction.invoice.number}</span> de{' '}
            {formatSpanishDate(correction.invoice.issueDate)}
          </p>
          <p>
            Motivo: {correctionReasonLabel(correction.reason)}. {correction.note}
          </p>
        </div>
      )}

      {draft.operationDescription && <p>{draft.operationDescription}</p>}

      <table className="tbl sheet-lines">
        <thead>
          <tr>
            <th>Concepto</th>
            <th className="r">Cant.</th>
            <th className="r">Precio</th>
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
              <td className="r num">{amountWithoutCurrency(line.unitPrice)}</td>
              <td className="r num">{line.discountPercent ? `${decimalInputOf(line.discountPercent)} %` : '—'}</td>
              <td>{vatLabel(line)}</td>
              <td className="r num">{amountWithoutCurrency(breakdown.lines[i]!.base)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="sheet-totals">
        <div className="sheet-mentions small">
          {breakdown.exempt.map(({ ground, mention }) => (
            <p key={ground}>{mention}</p>
          ))}
        </div>
        <dl className="sum">
          {breakdown.taxed.map(({ rate, base, taxAmount }) => (
            <Fragment key={rate}>
              <dt>Base imponible ({rate} %)</dt>
              <dd>{formatAmount(base)}</dd>
              <dt>Cuota IVA ({rate} %)</dt>
              <dd>{formatAmount(taxAmount)}</dd>
            </Fragment>
          ))}
          {breakdown.exempt.map(({ ground, base }) => (
            <Fragment key={ground}>
              <dt>Base imponible (exenta)</dt>
              <dd>{formatAmount(base)}</dd>
            </Fragment>
          ))}
          <dt className="strong">Importe total</dt>
          <dd className="strong">{formatAmount(breakdown.totalAmount)}</dd>
          <dt>Retención IRPF ({breakdown.withholding.rate} %)</dt>
          <dd>{formatWithheld(breakdown.withholding.amount)}</dd>
          <dt className="sheet-due">Total a pagar</dt>
          <dd className="sheet-due">{formatAmount(breakdown.amountDue)}</dd>
        </dl>
      </div>

      {issuer.iban && (
        <p className="sheet-payment small">
          Forma de pago: transferencia a <span className="mono">{formatIban(issuer.iban)}</span>
        </p>
      )}
    </article>
  );
}

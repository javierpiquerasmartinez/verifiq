import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import {
  computeBreakdown,
  correctionReasonLabel,
  defaultOperationDescription,
  draftLineFromCatalogItem,
  DraftErrorCode,
  findDraftProblems,
  formatSpanishDate,
  MAX_DRAFT_LINES,
  todayInSpain,
  WITHHOLDING_RATES,
  type BillingPeriod,
  type CatalogItem,
  type Draft,
  type DraftDataInput,
  type DraftRecipient,
  type IssuerDefaults,
  type WithholdingRate,
} from '@verifiq/domain';
import { useRef, useState } from 'react';
import { ApiError, createDraft, deleteDraft, fetchDraft, fetchIssuer, fetchOnboarding, updateDraft } from '../api';
import { draftSnapshot, emptyLine, lineStateOf, parseLine, type LineState } from '../draft-lines';
import {
  ADD_LINE_FIELD,
  DESCRIPTION_FIELD,
  missingToIssue,
  PERIOD_END_FIELD,
  RECIPIENT_FIELD,
} from '../draft-problems';
import { WITHHOLDING_LABELS } from '../format';
import { useSessionExpiry } from '../session';
import { AppShell } from '../ui/AppShell';
import { CatalogItemPicker } from '../ui/CatalogItemPicker';
import { Alert, Seg } from '../ui/components';
import { DraftLineRow } from '../ui/DraftLineRow';
import { DraftSummary } from '../ui/DraftSummary';
import { Icon } from '../ui/icons';
import { IssueDialog } from '../ui/IssueDialog';
import { RecipientPicker } from '../ui/RecipientPicker';

/** A new Draft, prefilled with the issuer's defaults. Nothing is stored until it is saved. */
export function NewDraftPage() {
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: fetchOnboarding, retry: false });
  useSessionExpiry(onboarding.error);
  return (
    <AppShell>
      {onboarding.isPending && <p>Cargando…</p>}
      {onboarding.isError && <Alert tone="danger">No se ha podido cargar la factura. Recarga la página.</Alert>}
      {onboarding.data?.defaults && <DraftEditor defaults={onboarding.data.defaults} />}
    </AppShell>
  );
}

export function DraftPage() {
  const { draftId } = useParams({ from: '/drafts/$draftId' });
  const draft = useQuery({ queryKey: ['draft', draftId], queryFn: () => fetchDraft(draftId), retry: false });
  const onboarding = useQuery({ queryKey: ['onboarding'], queryFn: fetchOnboarding, retry: false });
  useSessionExpiry(draft.error ?? onboarding.error);

  const notFound = draft.error instanceof ApiError && draft.error.status === 404;
  return (
    <AppShell>
      {(draft.isPending || onboarding.isPending) && <p>Cargando…</p>}
      {notFound && <Alert tone="danger">Este borrador no existe o se ha borrado.</Alert>}
      {(onboarding.isError || (draft.isError && !notFound)) && (
        <Alert tone="danger">No se ha podido cargar el borrador. Recarga la página.</Alert>
      )}
      {draft.data && onboarding.data?.defaults && (
        <DraftEditor key={draft.data.id} draft={draft.data} defaults={onboarding.data.defaults} />
      )}
    </AppShell>
  );
}

const isBlank = (line: LineState) => !line.concept.trim() && !line.unitPrice.trim();

/** History state of a draft just saved by trying to issue it: it opens with its problems marked. */
interface MarkProblemsState {
  markProblems?: boolean;
}

/**
 * The Draft editor. Amounts are computed live with the same domain the api uses; the api
 * recomputes them on save. A draft can be saved half done: what it lacks to be issued is listed,
 * neutral, and only marked as errors on its fields once the user tries to issue it.
 * A corrective draft keeps the recipient, billing period and withholding of the invoice it corrects:
 * only its description and lines change, and its lines (the difference) may be negative.
 */
function DraftEditor({ draft, defaults }: { draft?: Draft; defaults: IssuerDefaults }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const correction = draft?.correction ?? null;

  const [recipient, setRecipient] = useState<DraftRecipient | null>(draft?.recipient ?? null);
  const [periodStart, setPeriodStart] = useState(draft?.billingPeriod?.start ?? '');
  const [periodEnd, setPeriodEnd] = useState(draft?.billingPeriod?.end ?? '');
  const [operationDescription, setOperationDescription] = useState(draft?.operationDescription ?? '');
  // Whether the operation description is the one prefilled from the period, so a new period refills it.
  const [descriptionPrefilled, setDescriptionPrefilled] = useState(
    () =>
      !draft ||
      draft.operationDescription === '' ||
      (draft.billingPeriod !== null &&
        draft.operationDescription === defaultOperationDescription(draft.billingPeriod, defaults.vat)),
  );
  const [lines, setLines] = useState<LineState[]>(() =>
    draft ? draft.lines.map(lineStateOf) : [emptyLine(defaults.vat)],
  );
  const [withholding, setWithholding] = useState<WithholdingRate>(draft?.withholding ?? defaults.withholding);
  const markOnOpen = useRouterState({
    select: ({ location }) => (location.state as MarkProblemsState).markProblems === true,
  });
  // Whether what is missing to issue is marked on its fields: only after trying to issue.
  const [markProblems, setMarkProblems] = useState(markOnOpen);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  // The saved draft being issued, while the issue dialog is open.
  const [issuing, setIssuing] = useState<Draft>();
  const issuer = useQuery({ queryKey: ['issuer'], queryFn: fetchIssuer, retry: false });
  const canIssue = issuer.data?.canIssue === true;

  const periodError =
    (periodStart === '') !== (periodEnd === '')
      ? 'Indica las dos fechas del periodo, o ninguna.'
      : periodStart && periodEnd < periodStart
        ? 'El periodo no puede terminar antes de empezar.'
        : undefined;
  const billingPeriod: BillingPeriod | null = periodStart && periodEnd && !periodError ? { start: periodStart, end: periodEnd } : null;

  const parsed = lines.map((line) => parseLine(line, { signed: correction !== null }));
  const hasFieldErrors = periodError !== undefined || parsed.some(({ line }) => line === null);
  const breakdown = computeBreakdown({
    lines: parsed.map(({ line }, i) => line ?? { quantity: '0', unitPrice: '0', vat: lines[i]!.vat }),
    withholding,
  });
  const issueDate = draft?.issueDate ?? todayInSpain();
  const problems = findDraftProblems(
    { recipient, billingPeriod, operationDescription, lines, corrective: correction !== null },
    issueDate,
  );

  // Unsaved changes ask before leaving: the form as typed against the one last saved (or opened).
  const snapshot = draftSnapshot({
    recipientId: recipient?.id ?? null,
    periodStart,
    periodEnd,
    operationDescription,
    lines,
    withholding,
  });
  const currentSnapshot = useRef(snapshot);
  currentSnapshot.current = snapshot;
  const savedSnapshot = useRef(snapshot);
  const unsaved = () => currentSnapshot.current !== savedSnapshot.current;
  // A new draft moving to its own address once saved is not leaving it.
  const movingToSaved = useRef(false);
  useBlocker({
    shouldBlockFn: () =>
      !movingToSaved.current && unsaved() && !window.confirm('Tienes cambios sin guardar en el borrador. ¿Salir y perderlos?'),
    enableBeforeUnload: unsaved,
  });

  function edited() {
    setNotice(undefined);
  }

  function changePeriod(start: string, end: string) {
    setPeriodStart(start);
    setPeriodEnd(end);
    edited();
    if (start && end && start <= end && (descriptionPrefilled || !operationDescription.trim())) {
      setOperationDescription(defaultOperationDescription({ start, end }, defaults.vat));
      setDescriptionPrefilled(true);
    }
  }

  /** A line with a copy of the item's values; it replaces the blank line a new draft starts with. */
  function addFromCatalog(item: CatalogItem) {
    const line = lineStateOf(draftLineFromCatalogItem(item));
    setLines((current) =>
      current.length === 1 && isBlank(current[0]!) ? [line] : [...current, line],
    );
    edited();
  }

  function changeLine(key: number, change: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));
    edited();
  }

  /**
   * Runs a save and what follows it (a navigation, the issue dialog) with the buttons disabled
   * throughout: a second click on a new draft would create it twice.
   */
  async function whilePending(action: () => Promise<void>) {
    setPending(true);
    try {
      await action();
    } finally {
      setPending(false);
    }
  }

  /** Saves the draft as it is; returns it, or null when it could not be saved. */
  async function save(): Promise<Draft | null> {
    setError(undefined);
    setNotice(undefined);
    if (hasFieldErrors) {
      setError('Corrige los campos marcados en rojo para guardar el borrador.');
      return null;
    }
    const body: DraftDataInput = {
      recipientId: recipient?.id ?? null,
      billingPeriod,
      operationDescription,
      lines: parsed.map(({ line }) => line!),
      withholding,
    };
    try {
      const saved = draft ? await updateDraft(draft.id, body) : await createDraft(body);
      savedSnapshot.current = snapshot;
      queryClient.setQueryData(['draft', saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setNotice('Borrador guardado.');
      return saved;
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === DraftErrorCode.RecipientNotFound
          ? 'El cliente elegido ya no existe. Elige otro.'
          : 'No se ha podido guardar el borrador. Vuelve a intentarlo.',
      );
      return null;
    }
  }

  const saveDraft = () =>
    whilePending(async () => {
      const saved = await save();
      if (saved) await showSaved(saved);
    });

  /** A new draft first takes its own address, so going back from the preview returns to it. */
  const preview = () =>
    whilePending(async () => {
      const saved = await save();
      if (!saved) return;
      await showSaved(saved);
      await navigate({ to: '/drafts/$draftId/preview', params: { draftId: saved.id } });
    });

  /** Saves the draft and, when nothing is missing, asks to confirm the Issuance; otherwise marks what is missing. */
  const startIssuing = () =>
    whilePending(async () => {
      const saved = await save();
      if (!saved) return;
      if (saved.problems.length === 0) {
        setIssuing(saved);
      } else {
        setMarkProblems(true);
        await showSaved(saved, { markProblems: true });
      }
    });

  /** A new draft, once saved, lives at its own address. */
  async function showSaved(saved: Draft, state: MarkProblemsState = {}) {
    if (!draft) {
      movingToSaved.current = true;
      await navigate({ to: '/drafts/$draftId', params: { draftId: saved.id }, replace: true, state: (prev) => ({ ...prev, ...state }) });
    }
  }

  async function remove() {
    if (!draft) {
      savedSnapshot.current = snapshot;
      return navigate({ to: '/' });
    }
    if (!window.confirm('¿Borrar este borrador? No se puede deshacer.')) return;
    const { id } = draft;
    await whilePending(async () => {
      try {
        await deleteDraft(id);
      } catch {
        setError('No se ha podido borrar el borrador. Vuelve a intentarlo.');
        return;
      }
      savedSnapshot.current = snapshot;
      queryClient.removeQueries({ queryKey: ['draft', id] });
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      await navigate({ to: '/' });
    });
  }

  const linesFull = lines.length >= MAX_DRAFT_LINES;
  const lineProblems = new Set(problems.flatMap((problem) => (problem.code === 'line-concept-missing' ? [problem.line] : [])));

  return (
    <>
      <nav className="crumb" aria-label="Ruta">
        <Link to="/">Facturas</Link>
        <Icon name="chevronRight" size="xs" />
        <span>Borrador</span>
      </nav>
      <div className="page-head" style={{ alignItems: 'center' }}>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row">
            <h1 className="h1">{correction ? 'Borrador de rectificativa' : draft ? 'Borrador de factura' : 'Nueva factura'}</h1>
            <span className="sf sf-draft">Borrador</span>
          </div>
          <div className="row small ink2" style={{ gap: 24 }}>
            <span className="row" style={{ gap: 6 }}>
              <Icon name="hash" />
              Número: se asignará al emitir{correction && ', en tu serie de rectificativas'}
            </span>
            <span className="row" style={{ gap: 6 }}>
              <Icon name="lock" />
              Fecha de expedición: hoy, {formatSpanishDate(issueDate)}
            </span>
          </div>
        </div>
      </div>

      {correction && (
        <section className="card rect-band" aria-label="Factura que rectifica">
          <Icon name="link" />
          <span>
            Rectifica la factura{' '}
            <Link to="/invoices/$invoiceId" params={{ invoiceId: correction.invoice.id }} className="lnk mono">
              {correction.invoice.number}
            </Link>{' '}
            de {formatSpanishDate(correction.invoice.issueDate)}
          </span>
          <span className="small">
            Motivo: {correctionReasonLabel(correction.reason)} · {correction.note}
          </span>
        </section>
      )}

      <div className="editor">
        <div className="editor-main">
          <section className="card card-pad stack" style={{ gap: 22 }} aria-labelledby="draft-operation">
            <h2 className="h3" id="draft-operation">
              Cliente y operación
            </h2>
            {draft && correction ? (
              <CorrectedInvoiceTerms draft={draft} />
            ) : (
              <>
                <RecipientPicker
                  id={RECIPIENT_FIELD}
                  value={recipient}
                  onChange={(next) => {
                    setRecipient(next);
                    edited();
                  }}
                  error={markProblems && !recipient ? 'Elige el cliente al que facturas.' : undefined}
                />
                <div className="grid2">
                  <div className="field">
                    <label className="label" htmlFor="period-start">
                      Periodo facturado: del <span className="opt">· opcional</span>
                    </label>
                    <input
                      id="period-start"
                      className="input"
                      type="date"
                      value={periodStart}
                      onChange={(event) => changePeriod(event.target.value, periodEnd)}
                      aria-invalid={periodError ? true : undefined}
                    />
                  </div>
                  <div className="field">
                    <label className="label" htmlFor={PERIOD_END_FIELD}>
                      al
                    </label>
                    <input
                      id={PERIOD_END_FIELD}
                      className="input"
                      type="date"
                      value={periodEnd}
                      min={periodStart || undefined}
                      onChange={(event) => changePeriod(periodStart, event.target.value)}
                      aria-invalid={periodError ? true : undefined}
                      aria-describedby="period-hint"
                    />
                  </div>
                  {periodError ? (
                    <p className="err span-all" id="period-hint">
                      {periodError}
                    </p>
                  ) : (
                    billingPeriod &&
                    (billingPeriod.end > issueDate ? (
                      <p className={`${markProblems ? 'err' : 'help'} span-all`} id="period-hint">
                        El periodo aún no ha terminado: Hacienda no admite una fecha de operación posterior a la de
                        expedición. Podrás emitir a partir del {formatSpanishDate(billingPeriod.end)}.
                      </p>
                    ) : (
                      <p className="help span-all" id="period-hint">
                        Fecha de operación: {formatSpanishDate(billingPeriod.end)}, el último día del periodo.
                      </p>
                    ))
                  )}
                </div>
              </>
            )}
            <div className="field">
              <label className="label" htmlFor={DESCRIPTION_FIELD}>
                Descripción de la operación
              </label>
              <input
                id={DESCRIPTION_FIELD}
                className="input"
                value={operationDescription}
                maxLength={500}
                placeholder="Por ejemplo: Servicios odontológicos septiembre 2026"
                onChange={(event) => {
                  setOperationDescription(event.target.value);
                  setDescriptionPrefilled(false);
                  edited();
                }}
                aria-invalid={markProblems && !operationDescription.trim() ? true : undefined}
                aria-describedby="description-hint"
              />
              <p className="help row" id="description-hint" style={{ gap: 6, flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--warn)' }}>
                  <Icon name="alert" />
                </span>
                <span>
                  Este texto se envía a Hacienda. <b style={{ color: 'var(--ink)' }}>Nunca incluyas nombres de pacientes.</b>
                  {descriptionPrefilled && operationDescription && ' Se ha rellenado a partir del periodo.'}
                </span>
              </p>
            </div>
          </section>

          <section className="card" style={{ overflow: 'hidden' }} aria-labelledby="draft-lines">
            <div className="card-head">
              <h2 className="h3" id="draft-lines">
                {correction ? 'Diferencia' : 'Líneas'}
              </h2>
              <span className="small muted">{lines.length === 1 ? '1 línea' : `${lines.length} líneas`}</span>
            </div>
            <div className="lines">
              {correction && (
                <p className="line small ink2">
                  Indica solo lo que cambia: en negativo si el importe baja (cantidad o precio con signo menos), en
                  positivo si sube.
                </p>
              )}
              <div className="line-grid line-head" aria-hidden="true">
                <span>Concepto</span>
                <span className="r">Cant.</span>
                <span className="r">Precio unit.</span>
                <span className="r">Dto. %</span>
                <span>IVA</span>
                <span className="r">Importe</span>
                <span />
              </div>
              {lines.map((line, i) => (
                <DraftLineRow
                  key={line.key}
                  index={i}
                  line={line}
                  errors={parsed[i]!.errors}
                  conceptMissing={markProblems && lineProblems.has(i)}
                  base={breakdown.lines[i]!.base}
                  defaultVat={defaults.vat}
                  onChange={(change) => changeLine(line.key, change)}
                  onRemove={() => {
                    setLines((current) => current.filter(({ key }) => key !== line.key));
                    edited();
                  }}
                />
              ))}
              <div className="line" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 }}>
                <button
                  id={ADD_LINE_FIELD}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setLines((current) => [...current, emptyLine(defaults.vat)]);
                    edited();
                  }}
                  disabled={linesFull}
                  aria-describedby={linesFull ? 'lines-full' : undefined}
                >
                  <Icon name="plus" />
                  Añadir línea
                </button>
                <CatalogItemPicker onPick={addFromCatalog} disabled={linesFull} />
                {linesFull && (
                  <p className="help" id="lines-full" style={{ width: '100%' }}>
                    Una factura admite como mucho {MAX_DRAFT_LINES} líneas.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="card card-pad row" style={{ justifyContent: 'space-between', gap: 24 }}>
            <div>
              <h2 className="h3">Retención de IRPF</h2>
              <p className="small muted">
                {correction
                  ? 'La de la factura que rectificas.'
                  : `Por defecto, la de tus ajustes (${WITHHOLDING_LABELS[defaults.withholding]}).`}
              </p>
            </div>
            {correction ? (
              <span className="num" style={{ fontWeight: 600 }}>
                {WITHHOLDING_LABELS[withholding]}
              </span>
            ) : (
              <Seg
                label="Retención de IRPF"
                options={WITHHOLDING_RATES.map((rate) => ({ value: rate, label: WITHHOLDING_LABELS[rate] }))}
                value={withholding}
                onChange={(rate) => {
                  setWithholding(rate);
                  edited();
                }}
              />
            )}
          </section>
        </div>

        <aside className="editor-side">
          <DraftSummary breakdown={breakdown} recipientName={recipient?.name} />

          {problems.length > 0 && (
            <Alert tone={markProblems ? 'danger' : 'info'}>
              <p className="small">
                <b>Para emitir falta:</b>{' '}
                {problems.map((problem, i) => {
                  const { text, field } = missingToIssue(problem, { corrective: correction !== null });
                  return (
                    <span key={i}>
                      {i > 0 && '; '}
                      {field ? (
                        <button type="button" className="lnk" onClick={() => document.getElementById(field)?.focus()}>
                          {text}
                        </button>
                      ) : (
                        text
                      )}
                    </span>
                  );
                })}
                .
              </p>
            </Alert>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          {notice && <Alert tone="ok">{notice}</Alert>}

          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={startIssuing}
            disabled={pending || !canIssue}
            aria-describedby={issuer.data && !canIssue ? 'issue-unavailable' : undefined}
          >
            <Icon name="lock" />
            {correction ? 'Emitir rectificativa' : 'Emitir factura'}
          </button>
          {issuer.data && !canIssue && (
            <p className="xs muted" id="issue-unavailable" style={{ textAlign: 'center' }}>
              Podrás emitir cuando firmes la autorización ante la AEAT.
            </p>
          )}
          <div className="grid2">
            <button type="button" className="btn btn-secondary" onClick={saveDraft} disabled={pending}>
              {pending ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={preview} disabled={pending}>
              <Icon name="eye" />
              Vista previa
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: 'var(--danger)', alignSelf: 'center' }}
            onClick={remove}
            disabled={pending}
          >
            <Icon name="trash" />
            {draft ? 'Borrar borrador' : 'Descartar'}
          </button>
        </aside>
      </div>
      {issuing && (
        <IssueDialog
          draft={issuing}
          onClose={() => {
            setIssuing(undefined);
            void showSaved(issuing);
          }}
        />
      )}
    </>
  );
}

/** What a corrective draft takes from the invoice it corrects, and never changes: its recipient and its dates. */
function CorrectedInvoiceTerms({ draft }: { draft: Draft }) {
  const { recipient, billingPeriod, operationDate } = draft;
  return (
    <dl className="kv" style={{ gridTemplateColumns: '170px 1fr', gap: '8px 24px' }}>
      <dt>Cliente</dt>
      <dd>
        {recipient?.name} <span className="mono xs muted">{recipient?.taxId}</span>
        {recipient && recipient.censusStatus !== 'identified' && (
          <p className="err">
            Hacienda no ha confirmado su NIF.{' '}
            <Link to="/recipients/$recipientId" params={{ recipientId: recipient.id }} className="lnk">
              Corrígelo en su ficha
            </Link>
            .
          </p>
        )}
      </dd>
      {billingPeriod && (
        <>
          <dt>Periodo facturado</dt>
          <dd>
            {formatSpanishDate(billingPeriod.start)} – {formatSpanishDate(billingPeriod.end)}
          </dd>
        </>
      )}
      {operationDate && (
        <>
          <dt>Fecha de operación</dt>
          <dd>{formatSpanishDate(operationDate)}, la de la factura que rectificas</dd>
        </>
      )}
    </dl>
  );
}

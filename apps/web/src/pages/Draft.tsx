import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import {
  computeBreakdown,
  defaultOperationDescription,
  DraftErrorCode,
  findDraftProblems,
  formatSpanishDate,
  todayInSpain,
  WITHHOLDING_RATES,
  type BillingPeriod,
  type Draft,
  type DraftDataInput,
  type DraftProblem,
  type DraftRecipient,
  type IssuerDefaults,
  type WithholdingRate,
} from '@verifiq/domain';
import { useState } from 'react';
import { ApiError, createDraft, deleteDraft, fetchDraft, fetchOnboarding, updateDraft } from '../api';
import { emptyLine, lineStateOf, parseLine, type LineState } from '../draft-lines';
import { WITHHOLDING_LABELS } from '../format';
import { useSessionExpiry } from '../session';
import { AppShell } from '../ui/AppShell';
import { Alert, Seg } from '../ui/components';
import { DraftLineRow } from '../ui/DraftLineRow';
import { DraftSummary } from '../ui/DraftSummary';
import { Icon } from '../ui/icons';
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

function problemText(problem: DraftProblem): string {
  switch (problem.code) {
    case 'recipient-missing':
      return 'falta el cliente';
    case 'recipient-unchecked':
      return 'el NIF del cliente está sin comprobar en el censo';
    case 'recipient-archived':
      return 'el cliente está archivado';
    case 'operation-date-in-future':
      return 'el periodo facturado aún no ha terminado';
    case 'operation-description-missing':
      return 'falta la descripción de la operación';
    case 'lines-missing':
      return 'añade al menos una línea';
    case 'line-concept-missing':
      return `línea ${problem.line + 1}, concepto vacío`;
  }
}

/**
 * The Draft editor. Amounts are computed live with the same domain the api uses; the api
 * recomputes them on save. A draft can be saved half done: what it lacks shows up as problems.
 */
function DraftEditor({ draft, defaults }: { draft?: Draft; defaults: IssuerDefaults }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
  // Problems show once the draft has been saved: a blank new form is not a list of errors.
  const [showProblems, setShowProblems] = useState(draft !== undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const periodError =
    (periodStart === '') !== (periodEnd === '')
      ? 'Indica las dos fechas del periodo, o ninguna.'
      : periodStart && periodEnd < periodStart
        ? 'El periodo no puede terminar antes de empezar.'
        : undefined;
  const billingPeriod: BillingPeriod | null = periodStart && periodEnd && !periodError ? { start: periodStart, end: periodEnd } : null;

  const parsed = lines.map(parseLine);
  const hasFieldErrors = periodError !== undefined || parsed.some(({ line }) => line === null);
  const breakdown = computeBreakdown({
    lines: parsed.map(({ line }, i) => line ?? { quantity: '0', unitPrice: '0', vat: lines[i]!.vat }),
    withholding,
  });
  const issueDate = draft?.issueDate ?? todayInSpain();
  const problems = findDraftProblems({ recipient, billingPeriod, operationDescription, lines }, issueDate);

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

  function changeLine(key: number, change: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));
    edited();
  }

  /** Saves the draft as it is; returns it, or null when it could not be saved. */
  async function save(): Promise<Draft | null> {
    setShowProblems(true);
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
    setPending(true);
    try {
      const saved = draft ? await updateDraft(draft.id, body) : await createDraft(body);
      queryClient.setQueryData(['draft', saved.id], saved);
      await queryClient.invalidateQueries({ queryKey: ['drafts'] });
      setNotice('Borrador guardado.');
      return saved;
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === DraftErrorCode.RecipientNotFound
          ? 'El cliente elegido ya no existe. Elige otro.'
          : 'No se ha podido guardar el borrador. Vuelve a intentarlo.',
      );
      return null;
    } finally {
      setPending(false);
    }
  }

  async function saveDraft() {
    const saved = await save();
    if (saved && !draft) await navigate({ to: '/drafts/$draftId', params: { draftId: saved.id }, replace: true });
  }

  async function preview() {
    const saved = await save();
    if (saved) await navigate({ to: '/drafts/$draftId/preview', params: { draftId: saved.id } });
  }

  async function remove() {
    if (!draft) return navigate({ to: '/' });
    if (!window.confirm('¿Borrar este borrador? No se puede deshacer.')) return;
    setPending(true);
    try {
      await deleteDraft(draft.id);
      queryClient.removeQueries({ queryKey: ['draft', draft.id] });
      await queryClient.invalidateQueries({ queryKey: ['drafts'] });
      await navigate({ to: '/' });
    } catch {
      setError('No se ha podido borrar el borrador. Vuelve a intentarlo.');
      setPending(false);
    }
  }

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
            <h1 className="h1">{draft ? 'Borrador de factura' : 'Nueva factura'}</h1>
            <span className="sf sf-draft">Borrador</span>
          </div>
          <div className="row small ink2" style={{ gap: 24 }}>
            <span className="row" style={{ gap: 6 }}>
              <Icon name="hash" />
              Número: se asignará al emitir
            </span>
            <span className="row" style={{ gap: 6 }}>
              <Icon name="lock" />
              Fecha de expedición: hoy, {formatSpanishDate(issueDate)}
            </span>
          </div>
        </div>
      </div>

      <div className="editor">
        <div className="editor-main">
          <section className="card card-pad stack" style={{ gap: 22 }} aria-labelledby="draft-operation">
            <h2 className="h3" id="draft-operation">
              Cliente y operación
            </h2>
            <RecipientPicker
              value={recipient}
              onChange={(next) => {
                setRecipient(next);
                edited();
              }}
              error={showProblems && !recipient ? 'Elige el cliente al que facturas.' : undefined}
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
                <label className="label" htmlFor="period-end">
                  al
                </label>
                <input
                  id="period-end"
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
                  <p className="err span-all" id="period-hint">
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
            <div className="field">
              <label className="label" htmlFor="description">
                Descripción de la operación
              </label>
              <input
                id="description"
                className="input"
                value={operationDescription}
                maxLength={500}
                placeholder="Por ejemplo: Servicios odontológicos septiembre 2026"
                onChange={(event) => {
                  setOperationDescription(event.target.value);
                  setDescriptionPrefilled(false);
                  edited();
                }}
                aria-invalid={showProblems && !operationDescription.trim() ? true : undefined}
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
                Líneas
              </h2>
              <span className="small muted">{lines.length === 1 ? '1 línea' : `${lines.length} líneas`}</span>
            </div>
            <div className="lines">
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
                  conceptMissing={showProblems && lineProblems.has(i)}
                  base={breakdown.lines[i]!.base}
                  defaultVat={defaults.vat}
                  onChange={(change) => changeLine(line.key, change)}
                  onRemove={() => {
                    setLines((current) => current.filter(({ key }) => key !== line.key));
                    edited();
                  }}
                />
              ))}
              <div className="line" style={{ alignItems: 'flex-start' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setLines((current) => [...current, emptyLine(defaults.vat)]);
                    edited();
                  }}
                >
                  <Icon name="plus" />
                  Añadir línea
                </button>
              </div>
            </div>
          </section>

          <section className="card card-pad row" style={{ justifyContent: 'space-between', gap: 24 }}>
            <div>
              <h2 className="h3">Retención de IRPF</h2>
              <p className="small muted">Por defecto, la de tus ajustes ({WITHHOLDING_LABELS[defaults.withholding]}).</p>
            </div>
            <Seg
              label="Retención de IRPF"
              options={WITHHOLDING_RATES.map((rate) => ({ value: rate, label: WITHHOLDING_LABELS[rate] }))}
              value={withholding}
              onChange={(rate) => {
                setWithholding(rate);
                edited();
              }}
            />
          </section>
        </div>

        <aside className="editor-side">
          <DraftSummary breakdown={breakdown} recipientName={recipient?.name} />

          {showProblems && problems.length > 0 && (
            <div className="alert alert-danger" role="status">
              <Icon name="alert" />
              <p className="small">
                <b>
                  Revisa {problems.length === 1 ? '1 campo' : `${problems.length} campos`} antes de emitir:
                </b>{' '}
                {problems.map(problemText).join('; ')}.
              </p>
            </div>
          )}
          {error && <Alert tone="danger">{error}</Alert>}
          {notice && <Alert tone="ok">{notice}</Alert>}

          <div className="grid2">
            <button type="button" className="btn btn-primary" onClick={saveDraft} disabled={pending}>
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
    </>
  );
}

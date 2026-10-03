import { createHash, randomUUID } from 'node:crypto';
import {
  REJECTION_CODES,
  issuerNotRegistered,
  ok,
  rejected,
  type AmendmentSubmission,
  type CensusCheck,
  type ConnectorIssuer,
  type ConnectorResult,
  type IssuerRef,
  type QueuedRecord,
  type QueuedVoiding,
  type RecordInvoice,
  type RecordRef,
  type RecordStatus,
  type RepresentationSigner,
  type RepresentationState,
  type RepresentationStatus,
  type VerifactuConnector,
  type VoidingSubmission,
  type RecordSubmission,
} from './connector.js';
import { todayInSpain } from './dates.js';

export type FakeOperation = Exclude<keyof VerifactuConnector, symbol>;

/** What the next call answers instead of its normal result. */
export type FakeFailure =
  /** Like an HTTP 400: nothing is recorded. */
  | { kind: 'rejected'; code: string; message: string }
  /** Like an HTTP 500: nothing is recorded. */
  | { kind: 'server-error' }
  /** No answer in time. With `processed`, the connector did the work anyway (a retry replays it). */
  | { kind: 'timeout'; processed?: boolean };

export type FakeVerdict = 'accepted' | 'accepted-with-errors' | 'rejected';

interface FakeRecord {
  issuerId: string;
  operation: 'submission' | 'amendment' | 'voiding';
  status: RecordStatus;
}

// A 1×1 PNG: the fake does not draw real QR codes.
const QR_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABc3UBGAAAAABJRU5ErkJggg==';

// Same tolerance Verifacti applies to the total of a record, in cents.
const TOTAL_TOLERANCE_CENTS = 1000;

/** Amounts carry at most 2 decimals, so integer cents are exact. */
function cents(amount: string): number {
  const [units = '0', fraction = ''] = amount.replace('-', '').split('.');
  const value = Number(units) * 100 + Number(fraction.padEnd(2, '0'));
  return amount.startsWith('-') ? -value : value;
}

/**
 * In-memory VerifactuConnector for tests and local development. Behaves like the Verifacti adapter
 * (see the contract tests) and can be programmed: census entries, failures, AEAT verdicts.
 */
export class FakeVerifactuConnector implements VerifactuConnector {
  /** Tax ID → registered name. Anything else is not identified. */
  readonly census = new Map<string, string>();
  /** Every call, in order, for assertions. */
  readonly calls: { operation: FakeOperation; issuerId: string; input: unknown }[] = [];

  private readonly issuers = new Set<string>();
  private readonly representations = new Map<string, RepresentationStatus>();
  private readonly records = new Map<string, FakeRecord>();
  private readonly lastFingerprint = new Map<string, string>();
  private readonly idempotent = new Map<string, { body: string; result: ConnectorResult<unknown> }>();
  private readonly failures: { operation?: FakeOperation; failure: FakeFailure }[] = [];

  /** The next call (to `operation`, or to any operation) answers `failure`. Queued in order. */
  failNext(failure: FakeFailure, operation?: FakeOperation): void {
    this.failures.push({ operation, failure });
  }

  /** The AEAT's verdict on a queued record. An accepted Voiding becomes `voided`. */
  settle(connectorRecordId: string, verdict: FakeVerdict, aeatError?: RecordStatus['aeatError']): RecordStatus {
    const record = this.records.get(connectorRecordId);
    if (!record) throw new Error(`Unknown record ${connectorRecordId}`);
    const state = verdict === 'accepted' && record.operation === 'voiding' ? 'voided' : verdict;
    record.status = aeatError ? { state, aeatError } : { state };
    return record.status;
  }

  /** The remote signing ends: the signer completes it (`signed`, the default) or it fails. */
  signRepresentation(issuerId: string, outcome: Exclude<RepresentationState, 'none' | 'pending'> = 'signed'): void {
    this.representations.set(issuerId, { state: outcome });
  }

  async createIssuerKey(issuer: ConnectorIssuer): Promise<ConnectorResult<void>> {
    return this.call('createIssuerKey', issuer, issuer, () => {
      this.issuers.add(issuer.issuerId);
      return ok(undefined);
    });
  }

  async startRepresentationSigning(
    issuer: IssuerRef,
    signer: RepresentationSigner,
  ): Promise<ConnectorResult<{ signingUrl: string }>> {
    return this.call('startRepresentationSigning', issuer, signer, () => {
      const unregistered = this.requireRegistered(issuer);
      if (unregistered) return unregistered;
      const state = this.representations.get(issuer.issuerId)?.state;
      if (state === 'signed' || state === 'pending') {
        return rejected('representation-in-place', 'Ya existe una representación correcta o una firma en curso.');
      }
      const signingUrl = `https://sign.example.test/${randomUUID()}`;
      this.representations.set(issuer.issuerId, { state: 'pending', signingUrl });
      return ok({ signingUrl });
    });
  }

  async representationStatus(issuer: IssuerRef): Promise<ConnectorResult<RepresentationStatus>> {
    return this.call('representationStatus', issuer, null, () => {
      const unregistered = this.requireRegistered(issuer);
      if (unregistered) return unregistered;
      return ok(this.representations.get(issuer.issuerId) ?? { state: 'none' });
    });
  }

  async validateTaxId(
    issuer: IssuerRef,
    query: { taxId: string; name?: string },
  ): Promise<ConnectorResult<CensusCheck>> {
    return this.call<CensusCheck>('validateTaxId', issuer, query, () => {
      const name = this.census.get(query.taxId);
      if (name === undefined) return ok({ result: 'not-identified' });
      if (query.name && query.name.toUpperCase() !== name.toUpperCase()) return ok({ result: 'name-mismatch' });
      return ok({ result: 'identified', name });
    });
  }

  async submitRecord(issuer: IssuerRef, submission: RecordSubmission): Promise<ConnectorResult<QueuedRecord>> {
    return this.call('submitRecord', issuer, submission, () =>
      this.idempotently(issuer, submission.idempotencyKey, submission.invoice, () =>
        this.queueRecord(issuer, 'submission', submission.invoice),
      ),
    );
  }

  async amendRecord(issuer: IssuerRef, submission: AmendmentSubmission): Promise<ConnectorResult<QueuedRecord>> {
    const { invoice, previousRejection } = submission;
    return this.call('amendRecord', issuer, submission, () =>
      this.idempotently(issuer, submission.idempotencyKey, { invoice, previousRejection }, () =>
        this.queueRecord(issuer, 'amendment', invoice),
      ),
    );
  }

  async voidRecord(issuer: IssuerRef, submission: VoidingSubmission): Promise<ConnectorResult<QueuedVoiding>> {
    const { invoice, previouslyRejected, notRegistered } = submission;
    return this.call('voidRecord', issuer, submission, () =>
      this.idempotently(issuer, submission.idempotencyKey, { invoice, previouslyRejected, notRegistered }, () => {
        const unregistered = this.requireRegistered(issuer);
        if (unregistered) return unregistered;
        const { connectorRecordId, fingerprint } = this.addRecord(issuer, 'voiding', invoice);
        return ok({ connectorRecordId, fingerprint });
      }),
    );
  }

  async recordStatus(issuer: IssuerRef, ref: RecordRef): Promise<ConnectorResult<RecordStatus>> {
    return this.call('recordStatus', issuer, ref, () => {
      const record = this.records.get(ref.connectorRecordId);
      if (!record || record.issuerId !== issuer.issuerId) {
        return rejected(REJECTION_CODES.notFound, 'Registro no encontrado.');
      }
      return ok(record.status);
    });
  }

  private call<T>(
    operation: FakeOperation,
    issuer: IssuerRef,
    input: unknown,
    run: () => ConnectorResult<T>,
  ): ConnectorResult<T> {
    this.calls.push({ operation, issuerId: issuer.issuerId, input });
    const index = this.failures.findIndex((entry) => !entry.operation || entry.operation === operation);
    if (index === -1) return run();
    const [{ failure }] = this.failures.splice(index, 1) as [{ failure: FakeFailure }];
    switch (failure.kind) {
      case 'rejected':
        return rejected(failure.code, failure.message);
      case 'server-error':
        return { outcome: 'transient', reason: 'server-error', message: 'Error interno del servidor.' };
      case 'timeout':
        if (failure.processed) run();
        return { outcome: 'transient', reason: 'timeout', message: 'Sin respuesta del conector.' };
    }
  }

  private requireRegistered(issuer: IssuerRef): ConnectorResult<never> | null {
    if (this.issuers.has(issuer.issuerId)) return null;
    return issuerNotRegistered();
  }

  /** Like Verifacti: the same key and body replay the stored answer; another body is refused. */
  private idempotently<T>(
    issuer: IssuerRef,
    key: string,
    body: unknown,
    run: () => ConnectorResult<T>,
  ): ConnectorResult<T> {
    const scope = `${issuer.taxId}:${key}`;
    const json = JSON.stringify(body);
    const stored = this.idempotent.get(scope);
    if (stored) {
      if (stored.body !== json) {
        return rejected(REJECTION_CODES.idempotencyKeyReused, 'La clave de idempotencia ya se usó con otros datos.');
      }
      return stored.result as ConnectorResult<T>;
    }
    const result = run();
    this.idempotent.set(scope, { body: json, result });
    return result;
  }

  private queueRecord(
    issuer: IssuerRef,
    operation: 'submission' | 'amendment',
    invoice: RecordInvoice,
  ): ConnectorResult<QueuedRecord> {
    const unregistered = this.requireRegistered(issuer);
    if (unregistered) return unregistered;
    // Like Verifacti: a new record is issued today; an amendment keeps its original, earlier date.
    const today = todayInSpain();
    if (operation === 'submission' ? invoice.issueDate !== today : invoice.issueDate > today) {
      return rejected('issue-date', 'La fecha de expedición debe ser la fecha actual.');
    }
    if (invoice.lines.length < 1 || invoice.lines.length > 12) {
      return rejected('lines-count', 'La factura debe tener entre 1 y 12 líneas.');
    }
    const sum = invoice.lines.reduce(
      (total, line) => total + cents(line.taxBase) + (line.kind === 'taxed' ? cents(line.taxAmount) : 0),
      0,
    );
    if (Math.abs(sum - cents(invoice.totalAmount)) > TOTAL_TOLERANCE_CENTS) {
      return rejected('total-mismatch', 'El importe total no coincide con la suma de las líneas.');
    }
    const { connectorRecordId, fingerprint } = this.addRecord(issuer, operation, invoice);
    const [year, month, day] = invoice.issueDate.split('-');
    const query = new URLSearchParams({
      nif: issuer.taxId,
      numserie: `${invoice.series}${invoice.number}`,
      fecha: `${day}-${month}-${year}`,
      importe: invoice.totalAmount,
    });
    return ok({
      connectorRecordId,
      fingerprint,
      verificationUrl: `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?${query}`,
      qrPng: QR_PNG,
    });
  }

  /** Chains the fingerprint to the issuer's previous record, as VeriFactu does. */
  private addRecord(issuer: IssuerRef, operation: FakeRecord['operation'], content: unknown) {
    const connectorRecordId = randomUUID();
    const previous = this.lastFingerprint.get(issuer.issuerId) ?? '';
    const fingerprint = createHash('sha256')
      .update(previous + JSON.stringify(content) + connectorRecordId)
      .digest('hex')
      .toUpperCase();
    this.lastFingerprint.set(issuer.issuerId, fingerprint);
    this.records.set(connectorRecordId, { issuerId: issuer.issuerId, operation, status: { state: 'pending' } });
    return { connectorRecordId, fingerprint };
  }
}

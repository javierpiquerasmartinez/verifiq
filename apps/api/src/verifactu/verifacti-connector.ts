import type { Database } from '../database/database.module.js';
import {
  REJECTION_CODES,
  issuerNotRegistered,
  ok,
  type AmendmentSubmission,
  type CensusCheck,
  type CensusResult,
  type ConnectorIssuer,
  type ConnectorResult,
  type InvoiceKey,
  type IssuerRef,
  type QueuedRecord,
  type QueuedVoiding,
  type RecordInvoice,
  type RecordLine,
  type RecordRef,
  type RecordResult,
  type RecordState,
  type RecordStatus,
  type RecordSubmission,
  type RepresentationSigner,
  type RepresentationState,
  type RepresentationStatus,
  type ResultsDelivery,
  type VerifactuConnector,
  type VoidingSubmission,
  type WebhookDelivery,
} from './connector.js';
import { loadIssuerApiKey, saveIssuerApiKey } from './credentials.js';
import { recordExchange } from './exchanges.js';
import type { SecretBox } from './secret-box.js';
import { isWebhookSignatureValid } from './webhook-signature.js';

export type VerifactiEnvironment = 'test' | 'prod';

export interface VerifactiOptions {
  /** Account-level key (`vfn_…`): manages NIFs, the Representation and census checks. */
  accountApiKey: string;
  environment: VerifactiEnvironment;
  baseUrl?: string;
  timeoutMs?: number;
  db: Database;
  /** Seals the per-issuer API keys stored in the database. */
  secretBox: SecretBox;
  /** The `secret` the results webhook was registered with. Without it no delivery is trusted. */
  webhookSecret?: string;
  /** The results webhook (`POST /webhooks`) every new issuer's tax ID is linked to. */
  webhookId?: string;
  fetch?: typeof fetch;
}

const REPRESENTATION_STATES: Record<string, RepresentationState> = {
  Correcto: 'signed',
  Rechazado: 'rejected',
  Pendiente: 'pending',
  Caducado: 'expired',
  Cancelado: 'cancelled',
  Inexistente: 'none',
};

const CENSUS_RESULTS: Record<string, CensusResult> = {
  IDENTIFICADO: 'identified',
  'NO IDENTIFICADO': 'not-identified',
  'NO IDENTIFICADO-SIMILAR': 'name-mismatch',
  'IDENTIFICADO-BAJA': 'deregistered',
  'IDENTIFICADO-REVOCADO': 'revoked',
};

const RECORD_STATES: Record<string, RecordState> = {
  Pendiente: 'pending',
  // Verifacti retries by itself while the AEAT has a server error.
  'Error servidor AEAT': 'pending',
  Correcto: 'accepted',
  'Aceptado con errores': 'accepted-with-errors',
  Incorrecto: 'rejected',
  'No registrado': 'rejected',
  'Factura inexistente': 'rejected',
  Duplicado: 'duplicate',
  Anulado: 'voided',
};

const PREVIOUS_REJECTION = { none: 'N', record: 'X', amendment: 'S' } as const;

const yesNo = (value: boolean) => (value ? 'S' : 'N');

type Body = Record<string, unknown>;

type HttpOutcome =
  | { kind: 'response'; status: number; body: Body | null }
  | { kind: 'timeout' }
  | { kind: 'network'; message: string };

interface Call {
  issuer: IssuerRef;
  operation: keyof VerifactuConnector;
  invoiceRecordId?: string;
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  apiKey: string;
  body?: unknown;
  idempotencyKey?: string;
  /** Strips secrets from the response before it is logged. */
  redactResponse?: (body: string) => string;
}

/**
 * Verifacti adapter (https://www.verifacti.com/docs). The only module that knows Verifacti: its
 * endpoints, field names, states and error shapes are translated here into the port's terms.
 * Every request and response is kept in connector_exchanges.
 */
export class VerifactiConnector implements VerifactuConnector {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetch: typeof fetch;

  constructor(private readonly options: VerifactiOptions) {
    this.baseUrl = options.baseUrl ?? 'https://api.verifacti.com';
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async createIssuerKey(issuer: ConnectorIssuer): Promise<ConnectorResult<void>> {
    const { environment, accountApiKey, webhookId } = this.options;
    const created = await this.send({
      issuer,
      operation: 'createIssuerKey',
      method: 'POST',
      path: '/nifs',
      apiKey: accountApiKey,
      body: [
        {
          nif: issuer.taxId,
          nombre: issuer.name,
          entorno: environment,
          hacienda: 'verifactu',
          direccion: issuer.address,
          cp: issuer.postalCode,
          poblacion: issuer.municipality,
          provincia: issuer.province,
          ...(webhookId && { webhooks: [webhookId] }),
        },
      ],
    });
    // 409: the tax ID is already registered (e.g. a retry); its key is still there to fetch.
    const alreadyRegistered = created.kind === 'response' && created.status === 409;
    if (!alreadyRegistered && !isSuccess(created)) return failure(created);

    // A tax ID registered earlier may predate the webhook. Verifacti documents no answer for a tax ID
    // already linked; a 409 is taken as linked.
    if (alreadyRegistered && webhookId) {
      const linked = await this.send({
        issuer,
        operation: 'createIssuerKey',
        method: 'POST',
        path: `/webhooks/${encodeURIComponent(webhookId)}/nifs/${encodeURIComponent(issuer.taxId)}`,
        apiKey: accountApiKey,
      });
      const alreadyLinked = linked.kind === 'response' && linked.status === 409;
      if (!alreadyLinked && !isSuccess(linked)) return failure(linked);
    }

    const fetched = await this.send({
      issuer,
      operation: 'createIssuerKey',
      method: 'GET',
      path: `/nifs/keys/${environment}/${encodeURIComponent(issuer.taxId)}`,
      apiKey: accountApiKey,
      redactResponse: (body) => body.replace(/"api_key"\s*:\s*"[^"]*"/, '"api_key":"[redacted]"'),
    });
    if (!isSuccess(fetched)) return failure(fetched);
    const apiKey = fetched.body?.api_key;
    if (typeof apiKey !== 'string' || !apiKey) throw new Error('Verifacti returned no API key');

    await saveIssuerApiKey(this.options.db, this.options.secretBox, {
      issuerId: issuer.issuerId,
      environment,
      apiKey,
    });
    return ok(undefined);
  }

  async startRepresentationSigning(
    issuer: IssuerRef,
    signer: RepresentationSigner,
  ): Promise<ConnectorResult<{ signingUrl: string }>> {
    const response = await this.send({
      issuer,
      operation: 'startRepresentationSigning',
      method: 'POST',
      path: `/representacion/firma_remota/${encodeURIComponent(issuer.taxId)}`,
      apiKey: this.options.accountApiKey,
      body: {
        nombre: signer.firstName,
        apellidos: signer.lastNames,
        municipio: signer.municipality,
        calle: signer.street,
        numero: signer.streetNumber,
        email: signer.email,
        idioma: 'es',
      },
    });
    if (!isSuccess(response)) return failure(response);
    return ok({ signingUrl: requiredString(response.body, 'url') });
  }

  async representationStatus(issuer: IssuerRef): Promise<ConnectorResult<RepresentationStatus>> {
    const response = await this.send({
      issuer,
      operation: 'representationStatus',
      method: 'GET',
      path: `/representacion/estado/${encodeURIComponent(issuer.taxId)}`,
      apiKey: this.options.accountApiKey,
    });
    if (!isSuccess(response)) return failure(response);
    const state = translate(REPRESENTATION_STATES, response.body?.estado, 'representation state');
    const url = response.body?.url;
    return ok(state === 'pending' && typeof url === 'string' ? { state, signingUrl: url } : { state });
  }

  async validateTaxId(
    issuer: IssuerRef,
    query: { taxId: string; name?: string },
  ): Promise<ConnectorResult<CensusCheck>> {
    const response = await this.send({
      issuer,
      operation: 'validateTaxId',
      method: 'POST',
      path: '/nifs/validar',
      apiKey: this.options.accountApiKey,
      body: query.name ? { nif: query.taxId, nombre: query.name } : { nif: query.taxId },
    });
    if (!isSuccess(response)) return failure(response);
    if (response.body?.resultado === 'ERROR') {
      return { outcome: 'transient', reason: 'server-error', message: 'El censo de la AEAT no responde.' };
    }
    const result = translate(CENSUS_RESULTS, response.body?.resultado, 'census result');
    const name = response.body?.nombre;
    return ok(typeof name === 'string' && name ? { result, name } : { result });
  }

  async submitRecord(issuer: IssuerRef, submission: RecordSubmission): Promise<ConnectorResult<QueuedRecord>> {
    return this.withIssuerKey(issuer, async (apiKey) => {
      const response = await this.send({
        issuer,
        operation: 'submitRecord',
        invoiceRecordId: submission.invoiceRecordId,
        method: 'POST',
        path: '/verifactu/create',
        apiKey,
        idempotencyKey: submission.idempotencyKey,
        body: invoiceBody(submission.invoice),
      });
      return isSuccess(response) ? ok(queuedRecord(response.body)) : failure(response);
    });
  }

  async amendRecord(issuer: IssuerRef, submission: AmendmentSubmission): Promise<ConnectorResult<QueuedRecord>> {
    return this.withIssuerKey(issuer, async (apiKey) => {
      const response = await this.send({
        issuer,
        operation: 'amendRecord',
        invoiceRecordId: submission.invoiceRecordId,
        method: 'PUT',
        path: '/verifactu/modify',
        apiKey,
        idempotencyKey: submission.idempotencyKey,
        body: { ...invoiceBody(submission.invoice), rechazo_previo: PREVIOUS_REJECTION[submission.previousRejection] },
      });
      return isSuccess(response) ? ok(queuedRecord(response.body)) : failure(response);
    });
  }

  async voidRecord(issuer: IssuerRef, submission: VoidingSubmission): Promise<ConnectorResult<QueuedVoiding>> {
    return this.withIssuerKey(issuer, async (apiKey) => {
      const response = await this.send({
        issuer,
        operation: 'voidRecord',
        invoiceRecordId: submission.invoiceRecordId,
        method: 'POST',
        path: '/verifactu/cancel',
        apiKey,
        idempotencyKey: submission.idempotencyKey,
        body: {
          ...invoiceKeyBody(submission.invoice),
          rechazo_previo: yesNo(submission.previouslyRejected),
          sin_registro_previo: yesNo(submission.notRegistered),
        },
      });
      if (!isSuccess(response)) return failure(response);
      return ok({
        connectorRecordId: requiredString(response.body, 'uuid'),
        fingerprint: requiredString(response.body, 'huella'),
      });
    });
  }

  async recordStatus(issuer: IssuerRef, record: RecordRef): Promise<ConnectorResult<RecordStatus>> {
    return this.withIssuerKey(issuer, async (apiKey) => {
      const response = await this.send({
        issuer,
        operation: 'recordStatus',
        invoiceRecordId: record.invoiceRecordId,
        method: 'GET',
        path: `/verifactu/status?uuid=${encodeURIComponent(record.connectorRecordId)}`,
        apiKey,
      });
      return isSuccess(response) ? ok(recordStatusOf(response.body)) : failure(response);
    });
  }

  /**
   * Verifacti signs each delivery with HMAC-SHA256 (hex, `X-Webhook-Signature`) over the raw body,
   * which is an array of objects shaped like GET /verifactu/status; `X-Webhook-Id` survives retries.
   */
  readResultsDelivery({ headers, body }: WebhookDelivery): ResultsDelivery | null {
    const { webhookSecret } = this.options;
    const id = headers['x-webhook-id'];
    if (!webhookSecret || !id || !isWebhookSignatureValid(webhookSecret, body, headers['x-webhook-signature'])) {
      return null;
    }
    const items: unknown = JSON.parse(body.toString('utf8'));
    if (!Array.isArray(items)) throw new Error('Verifacti webhook body is not an array');
    return {
      id,
      results: items.map((item: Body): RecordResult => ({
        issuerTaxId: requiredString(item, 'nif'),
        invoice: {
          series: requiredString(item, 'serie'),
          number: requiredString(item, 'numero'),
          issueDate: isoDate(requiredString(item, 'fecha_expedicion')),
        },
        status: recordStatusOf(item),
      })),
    };
  }

  private async withIssuerKey<T>(
    issuer: IssuerRef,
    run: (apiKey: string) => Promise<ConnectorResult<T>>,
  ): Promise<ConnectorResult<T>> {
    const { db, environment, secretBox } = this.options;
    const apiKey = await loadIssuerApiKey(db, secretBox, { issuerId: issuer.issuerId, environment });
    if (!apiKey) return issuerNotRegistered();
    return run(apiKey);
  }

  /** One HTTP call, kept in the exchange log whatever its outcome. */
  private async send(call: Call): Promise<HttpOutcome> {
    const url = `${this.baseUrl}${call.path}`;
    const headers: Record<string, string> = {
      authorization: `Bearer ${call.apiKey}`,
      accept: 'application/json',
    };
    const requestBody = call.body === undefined ? undefined : JSON.stringify(call.body);
    if (requestBody !== undefined) headers['content-type'] = 'application/json';
    if (call.idempotencyKey) headers['idempotency-key'] = call.idempotencyKey;

    const startedAt = new Date();
    let outcome: HttpOutcome;
    let responseHeaders: Record<string, string> | null = null;
    let responseText: string | null = null;
    let error: string | null = null;
    try {
      const response = await this.fetch(url, {
        method: call.method,
        headers,
        body: requestBody,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      responseHeaders = Object.fromEntries(response.headers.entries());
      responseText = await response.text();
      outcome = { kind: 'response', status: response.status, body: parseBody(responseText) };
    } catch (caught) {
      const timedOut = caught instanceof Error && (caught.name === 'TimeoutError' || caught.name === 'AbortError');
      error = timedOut ? `No response within ${this.timeoutMs} ms` : String(caught);
      outcome = timedOut ? { kind: 'timeout' } : { kind: 'network', message: error };
    }

    await recordExchange(this.options.db, {
      issuerId: call.issuer.issuerId,
      invoiceRecordId: call.invoiceRecordId ?? null,
      operation: call.operation,
      method: call.method,
      url,
      requestHeaders: { ...headers, authorization: 'Bearer [redacted]' },
      requestBody: requestBody ?? null,
      responseStatus: outcome.kind === 'response' ? outcome.status : null,
      responseHeaders,
      responseBody: responseText !== null && call.redactResponse ? call.redactResponse(responseText) : responseText,
      error,
      startedAt,
      durationMs: Date.now() - startedAt.getTime(),
    });
    return outcome;
  }
}

function isSuccess(outcome: HttpOutcome): outcome is HttpOutcome & { kind: 'response' } {
  return outcome.kind === 'response' && outcome.status >= 200 && outcome.status < 300;
}

/** Translates every non-2xx answer into a rejection or a transient failure. */
function failure(outcome: HttpOutcome): ConnectorResult<never> {
  if (outcome.kind === 'timeout') {
    return { outcome: 'transient', reason: 'timeout', message: 'Verifacti no ha respondido a tiempo.' };
  }
  if (outcome.kind === 'network') {
    return { outcome: 'transient', reason: 'network', message: `No se pudo conectar con Verifacti: ${outcome.message}` };
  }
  const { status, body } = outcome;
  const text = (key: string) => (typeof body?.[key] === 'string' ? (body[key] as string) : undefined);
  const message = text('message') ?? text('error') ?? `HTTP ${status}`;
  if (status >= 500) return { outcome: 'transient', reason: 'server-error', message };
  // A revoked or rotated key: retried until the operator fixes it, never shown as the invoice's fault.
  if (status === 401) return { outcome: 'transient', reason: 'unauthorized', message };
  // Another request with the same idempotency key is still being processed.
  if (status === 409) {
    return { outcome: 'transient', reason: 'in-progress', message };
  }
  if (status === 422) return { outcome: 'rejected', code: REJECTION_CODES.idempotencyKeyReused, message };
  const code = text('codigo') ?? (status === 404 ? REJECTION_CODES.notFound : `http-${status}`);
  return { outcome: 'rejected', code, message: text('error') ?? message };
}

function parseBody(text: string): Body | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Body) : null;
  } catch {
    return null;
  }
}

function requiredString(body: Body | null, key: string): string {
  const value = body?.[key];
  if (typeof value !== 'string' || !value) throw new Error(`Verifacti response without ${key}`);
  return value;
}

/** An unknown value means Verifacti changed its API: fail loudly rather than guess. */
function translate<T>(table: Record<string, T>, value: unknown, what: string): T {
  const translated = typeof value === 'string' ? table[value] : undefined;
  if (translated === undefined) throw new Error(`Unknown Verifacti ${what}: ${String(value)}`);
  return translated;
}

function queuedRecord(body: Body | null): QueuedRecord {
  return {
    connectorRecordId: requiredString(body, 'uuid'),
    fingerprint: requiredString(body, 'huella'),
    verificationUrl: requiredString(body, 'url'),
    qrPng: requiredString(body, 'qr'),
  };
}

// Verifacti does not document passing on the AEAT's CSV (docs/research/verifactu-verifacti.md §2): no
// registrationCode until it does.
function recordStatusOf(body: Body | null): RecordStatus {
  const state = translate(RECORD_STATES, body?.estado, 'record state');
  const code = body?.codigo_error;
  if (code === undefined || code === null || code === '') return { state };
  return { state, aeatError: { code: String(code), message: String(body?.mensaje_error ?? '') } };
}

/** DD-MM-YYYY → YYYY-MM-DD. */
function isoDate(date: string): string {
  const [day, month, year] = date.split('-');
  return `${year}-${month}-${day}`;
}

/** YYYY-MM-DD → DD-MM-YYYY. */
function verifactiDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}-${month}-${year}`;
}

function invoiceKeyBody(key: InvoiceKey) {
  return { serie: key.series, numero: key.number, fecha_expedicion: verifactiDate(key.issueDate) };
}

function lineBody(line: RecordLine) {
  if (line.kind === 'exempt') {
    return { base_imponible: line.taxBase, impuesto: '01', operacion_exenta: line.exemptionCode };
  }
  return {
    base_imponible: line.taxBase,
    impuesto: '01',
    tipo_impositivo: String(line.vatRate),
    cuota_repercutida: line.taxAmount,
  };
}

function invoiceBody(invoice: RecordInvoice) {
  const corrective = invoice.type !== 'F1';
  return {
    ...invoiceKeyBody(invoice),
    ...(invoice.operationDate && { fecha_operacion: verifactiDate(invoice.operationDate) }),
    tipo_factura: invoice.type,
    descripcion: invoice.operationDescription,
    nif: invoice.recipient.taxId,
    nombre: invoice.recipient.name,
    lineas: invoice.lines.map(lineBody),
    importe_total: invoice.totalAmount,
    // Corrective invoices are always by differences (ADR 0005).
    ...(corrective && { tipo_rectificativa: 'I' }),
    ...(corrective && invoice.corrects?.length && { facturas_rectificadas: invoice.corrects.map(invoiceKeyBody) }),
  };
}

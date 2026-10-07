import { RECORD_REJECTION_CODES, type CorrectiveInvoiceType, type ExemptionGround, type VatRate } from '@verifiq/domain';

export const VERIFACTU_CONNECTOR = Symbol('VERIFACTU_CONNECTOR');

/**
 * Port to VeriFactu (ADR 0001). The domain only knows these operations and results; the adapters
 * (Verifacti, the in-memory fake) translate them. Nothing outside an adapter knows the provider.
 */
export interface VerifactuConnector {
  /** Registers the issuer with the connector and keeps its credentials. Repeating it is harmless. */
  createIssuerKey(issuer: ConnectorIssuer): Promise<ConnectorResult<void>>;
  /** Starts the remote signing of the Representation; the signer also gets the link by email. */
  startRepresentationSigning(
    issuer: IssuerRef,
    signer: RepresentationSigner,
  ): Promise<ConnectorResult<{ signingUrl: string }>>;
  representationStatus(issuer: IssuerRef): Promise<ConnectorResult<RepresentationStatus>>;
  /** Checks a tax ID (and optionally its name) against the AEAT census, on behalf of the issuer. */
  validateTaxId(issuer: IssuerRef, query: { taxId: string; name?: string }): Promise<ConnectorResult<CensusCheck>>;
  /** Registers an issued invoice (InvoiceRecord). Queued for the AEAT; the verdict arrives later (`recordStatus`). */
  submitRecord(issuer: IssuerRef, submission: RecordSubmission): Promise<ConnectorResult<QueuedRecord>>;
  /** Amendment of a record already submitted. */
  amendRecord(issuer: IssuerRef, submission: AmendmentSubmission): Promise<ConnectorResult<QueuedRecord>>;
  /** Voiding of an issued invoice. */
  voidRecord(issuer: IssuerRef, submission: VoidingSubmission): Promise<ConnectorResult<QueuedVoiding>>;
  recordStatus(issuer: IssuerRef, record: RecordRef): Promise<ConnectorResult<RecordStatus>>;
  /**
   * Reads a delivery of the connector's results webhook: the AEAT's verdicts on records. Null when
   * its signature is missing or not valid, so nothing in it can be trusted.
   */
  readResultsDelivery(delivery: WebhookDelivery): ResultsDelivery | null;
}

/**
 * Every call either succeeds, is rejected synchronously (nothing was recorded; retrying the same
 * data fails again), or fails transiently (retry later with the same idempotency key: after a
 * timeout the connector may or may not have queued the record).
 */
export type ConnectorResult<T> =
  | { outcome: 'ok'; value: T }
  | { outcome: 'rejected'; code: string; message: string }
  | { outcome: 'transient'; reason: TransientReason; message: string };

export type TransientReason = 'server-error' | 'timeout' | 'network' | 'unauthorized' | 'in-progress';

/**
 * Stable rejection codes produced by Verifiq itself. Adapters translate the connector's codes for
 * record data into the domain's RECORD_REJECTION_CODES; any other code passes through as it comes.
 */
export const REJECTION_CODES = {
  issuerNotRegistered: RECORD_REJECTION_CODES.issuerNotRegistered,
  idempotencyKeyReused: 'idempotency-key-reused',
  notFound: 'not-found',
} as const;

export function ok<T>(value: T): ConnectorResult<T> {
  return { outcome: 'ok', value };
}

export function rejected(code: string, message: string): ConnectorResult<never> {
  return { outcome: 'rejected', code, message };
}

export const issuerNotRegistered = () =>
  rejected(REJECTION_CODES.issuerNotRegistered, 'El Emisor no tiene clave en el conector.');

export interface IssuerRef {
  issuerId: string;
  taxId: string;
}

export interface ConnectorIssuer extends IssuerRef {
  name: string;
  address: string;
  postalCode: string;
  municipality: string;
  province: string;
}

export interface RepresentationSigner {
  firstName: string;
  lastNames: string;
  municipality: string;
  street: string;
  streetNumber: string;
  email: string;
}

export type RepresentationState = 'none' | 'pending' | 'signed' | 'rejected' | 'expired' | 'cancelled';

export interface RepresentationStatus {
  state: RepresentationState;
  /** While a remote signing is pending. */
  signingUrl?: string;
}

export type CensusResult =
  | 'identified'
  | 'not-identified'
  /** Registered, but under a different name than the one given. */
  | 'name-mismatch'
  | 'deregistered'
  | 'revoked';

export interface CensusCheck {
  result: CensusResult;
  /** Name registered in the census, when it returns one. */
  name?: string;
}

/** VeriFactu invoice types. R1–R4 are corrective invoices (ADR 0005). */
export type RecordInvoiceType = 'F1' | CorrectiveInvoiceType;

export interface InvoiceKey {
  series: string;
  number: string;
  /** YYYY-MM-DD. */
  issueDate: string;
}

/** A tax breakdown row of the record: one per VAT rate or exemption ground, never per item. */
export type RecordLine =
  | { kind: 'taxed'; taxBase: string; vatRate: VatRate; taxAmount: string }
  | { kind: 'exempt'; taxBase: string; exemptionCode: ExemptionGround['verifactuCode'] };

export interface RecordInvoice extends InvoiceKey {
  type: RecordInvoiceType;
  /** YYYY-MM-DD, when it differs from the issue date. */
  operationDate?: string;
  operationDescription: string;
  recipient: { taxId: string; name: string };
  lines: RecordLine[];
  /** Tax base plus tax amounts, excluding the withholding. */
  totalAmount: string;
  /** Corrective invoices are always by differences (ADR 0005). */
  corrects?: InvoiceKey[];
}

interface Submission {
  /** Our InvoiceRecord the exchange belongs to. */
  invoiceRecordId: string;
  /** The same key with the same data never creates a second record. */
  idempotencyKey: string;
}

export interface RecordSubmission extends Submission {
  invoice: RecordInvoice;
}

/** How an InvoiceRecord is sent: the invoice's registration, an Amendment of it, or its Voiding. */
export type RecordOperation = 'submission' | 'amendment' | 'voiding';

/** Whether the AEAT rejected the original record, or a previous amendment of it. */
export type PreviousRejection = 'none' | 'record' | 'amendment';

export interface AmendmentSubmission extends RecordSubmission {
  previousRejection: PreviousRejection;
}

export interface VoidingSubmission extends Submission {
  invoice: InvoiceKey;
  /** The AEAT rejected the latest Voiding of the invoice it received: this one sends it again. */
  previouslyRejected: boolean;
  /** The AEAT never registered the invoice (it blocked or rejected every record of it). */
  notRegistered: boolean;
}

export interface QueuedVoiding {
  /** The connector's id of the record, to ask for its status. */
  connectorRecordId: string;
  /** Hash of the record, chained to the issuer's previous one. */
  fingerprint: string;
}

export interface QueuedRecord extends QueuedVoiding {
  /** AEAT URL the QR encodes. */
  verificationUrl: string;
  /** QR image as base64 PNG. */
  qrPng: string;
}

export interface RecordRef {
  invoiceRecordId: string;
  connectorRecordId: string;
}

export type RecordState =
  /** Queued, or waiting for the AEAT (also while the AEAT has a server error). */
  | 'pending'
  | 'accepted'
  | 'accepted-with-errors'
  | 'rejected'
  /** The AEAT already has a record for the same series, number and issue date. */
  | 'duplicate'
  /** A Voiding accepted by the AEAT. */
  | 'voided';

export interface RecordStatus {
  state: RecordState;
  /** The AEAT's error, exactly as it returns it. */
  aeatError?: { code: string; message: string };
  /** The AEAT's code for an accepted record (its CSV), when the connector passes it on. */
  registrationCode?: string;
}

/** An HTTP request to the results webhook, as it arrived. */
export interface WebhookDelivery {
  /** Lower-case names. */
  headers: Record<string, string | undefined>;
  /** The raw body: the signature covers it byte for byte. */
  body: Buffer;
}

/** The status of one record, named by its issuer and its invoice: deliveries carry no id of ours. */
export interface RecordResult {
  issuerTaxId: string;
  invoice: InvoiceKey;
  status: RecordStatus;
}

export interface ResultsDelivery {
  /** The same across the connector's retries of a delivery. */
  id: string;
  results: RecordResult[];
}

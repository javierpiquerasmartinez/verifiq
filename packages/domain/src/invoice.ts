import { z } from 'zod';
import { breakdownSchema } from './amounts.js';
import { billingPeriodSchema, draftDataSchema, draftLineSchema } from './draft.js';
import { fiscalDataSchema } from './issuer.js';
import { recipientDataSchema } from './recipient.js';

// An issued invoice: the Issuance gave it its number (ADR 0002) and froze a copy of the draft,
// the issuer and the recipient. Its InvoiceRecord travels to the AEAT through the VeriFactu connector.

export const INVOICE_STATUSES = [
  /** Issued: numbered and frozen. */
  'issued',
  /** A corrective invoice corrects it (ADR 0005). */
  'rectified',
  /** Its Voiding left it without effect; its number is never reused. */
  'voided',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_RECORD_STATUSES = [
  /** Waiting in the outbox for the worker to send it to the connector. */
  'pending-submission',
  /** The connector queued it for the AEAT: it has its fingerprint and QR. */
  'submitted',
  'accepted',
  'accepted-with-errors',
  'rejected',
  /** The connector refused it synchronously (a validation error): nothing reached the AEAT. */
  'blocked',
] as const;

export type InvoiceRecordStatus = (typeof INVOICE_RECORD_STATUSES)[number];

/** Records unconfirmed this long after the Issuance warn the user and alert the operator. */
export const UNCONFIRMED_RECORD_HOURS = 24;

/** Record statuses still waiting for the AEAT's verdict. */
export const AWAITING_VERDICT_STATUSES = ['pending-submission', 'submitted'] as const satisfies InvoiceRecordStatus[];

/** Record statuses that need the user: the record is not right at the AEAT until they act. */
export const INCIDENT_RECORD_STATUSES = ['blocked', 'rejected', 'accepted-with-errors'] as const satisfies InvoiceRecordStatus[];

/** Whether a record issued at `createdAt` is, as of `now`, still unconfirmed after UNCONFIRMED_RECORD_HOURS. */
export function isRecordUnconfirmed(status: InvoiceRecordStatus, createdAt: Date, now = new Date()): boolean {
  const awaiting: readonly InvoiceRecordStatus[] = AWAITING_VERDICT_STATUSES;
  return awaiting.includes(status) && createdAt.getTime() <= unconfirmedBefore(now).getTime();
}

/** Records issued before this instant and still awaiting their verdict are unconfirmed. */
export function unconfirmedBefore(now: Date): Date {
  return new Date(now.getTime() - UNCONFIRMED_RECORD_HOURS * 3_600_000);
}

export const INVOICE_EVENTS = [
  'issued',
  'submitted',
  'blocked',
  'pdf-generated',
  'accepted',
  'accepted-with-errors',
  'rejected',
  /** The user corrected the copy and sent its record again. */
  'resubmitted',
] as const;

export type InvoiceEvent = (typeof INVOICE_EVENTS)[number];

/** An entry of the invoice's history (its timeline). */
export const invoiceHistoryEntrySchema = z.object({
  event: z.enum(INVOICE_EVENTS),
  occurredAt: z.iso.datetime({ offset: true }),
  /** The user's name; null when the system acted. */
  actor: z.string().nullable(),
});

export type InvoiceHistoryEntry = z.infer<typeof invoiceHistoryEntrySchema>;

/** Response of GET /invoices/:id. */
export const invoiceSchema = z.object({
  id: z.uuid(),
  /** Series and correlative number, e.g. F2026-0001. */
  number: z.string(),
  issueDate: z.iso.date(),
  status: z.enum(INVOICE_STATUSES),
  record: z.object({
    status: z.enum(INVOICE_RECORD_STATUSES),
    /** AEAT URL the QR encodes, once the connector queued the record. */
    verificationUrl: z.string().nullable(),
    /** Why the connector refused the record, while it is blocked; `explanation` tells the user in plain language. */
    rejection: z.object({ code: z.string(), message: z.string(), explanation: z.string() }).nullable(),
    /** The latest record is an Amendment of the first one (sent after a rejection or errors). */
    amendment: z.boolean(),
    /** When the AEAT's verdict arrived (accepted, with errors or rejected). */
    confirmedAt: z.iso.datetime({ offset: true }).nullable(),
    /** The AEAT's code for the accepted record (its CSV), when the connector passes it on. */
    registrationCode: z.string().nullable(),
    /** The AEAT's error, exactly as it returned it: accepted with errors, or the reason it rejected the record. */
    aeatError: z.object({ code: z.string(), message: z.string() }).nullable(),
    /** Still without the AEAT's verdict more than 24 h after the Issuance. */
    unconfirmed: z.boolean(),
  }),
  /** What happened to the invoice, oldest first. */
  history: z.array(invoiceHistoryEntrySchema),
  /** The current version of its PDF: there is none until the record has its QR. */
  pdf: z.object({ version: z.number().int().positive() }).nullable(),
  /** The recipient it was issued to, whose data may have changed since. */
  recipientId: z.uuid(),
  /** The issuer and the recipient as they were when the invoice was issued. */
  issuer: fiscalDataSchema,
  recipient: recipientDataSchema,
  billingPeriod: billingPeriodSchema.nullable(),
  operationDate: z.iso.date().nullable(),
  operationDescription: z.string(),
  lines: z.array(draftLineSchema),
  withholding: draftDataSchema.shape.withholding,
  breakdown: breakdownSchema,
  issuedAt: z.iso.datetime({ offset: true }),
});

export type Invoice = z.infer<typeof invoiceSchema>;

/** The frozen copy the Issuance keeps of the draft, the issuer and the recipient. */
export const invoiceSnapshotSchema = invoiceSchema.pick({
  issuer: true,
  recipient: true,
  billingPeriod: true,
  operationDate: true,
  operationDescription: true,
  lines: true,
  withholding: true,
  breakdown: true,
});

export type InvoiceSnapshot = z.infer<typeof invoiceSnapshotSchema>;

/** Body of POST /invoices: issues the draft, which becomes the invoice. */
export const issueInvoiceSchema = z.object({ draftId: z.uuid() });

/** Response of GET /invoices/next-number: the number the next Issuance assigns, unless another one comes first. */
export const nextInvoiceNumberSchema = z.object({ number: z.string() });

export type NextInvoiceNumber = z.infer<typeof nextInvoiceNumberSchema>;

/**
 * Body of POST /invoices/:id/resubmission: corrects the copy of an invoice whose record is blocked,
 * rejected or accepted with errors, and sends it again with the same number. The recipient's data
 * come again from its profile, where the user corrects them; the description is corrected here.
 */
export const invoiceResubmissionSchema = z.object({
  operationDescription: draftDataSchema.shape.operationDescription.min(1, 'Escribe la descripción de la operación'),
});

export type InvoiceResubmission = z.infer<typeof invoiceResubmissionSchema>;

/** Stable error codes of the invoice endpoints and of the Issuance, so the web can show a clear message. */
export const InvoiceErrorCode = {
  NotFound: 'INVOICE_NOT_FOUND',
  /** The draft still has problems (`problems` in the body). */
  DraftNotReady: 'DRAFT_NOT_READY',
  /** Without its key at the connector and a valid Representation, the issuer cannot issue. */
  CannotIssue: 'CANNOT_ISSUE',
  /** The invoice has no PDF yet: its record has no QR. */
  PdfNotAvailable: 'INVOICE_PDF_NOT_AVAILABLE',
  /** Only a blocked, rejected or accepted with errors record is corrected and sent again. */
  NotResubmittable: 'INVOICE_NOT_RESUBMITTABLE',
  /** The recipient's tax ID is not confirmed in the census: the user corrects it in its profile first. */
  RecipientNotReady: 'INVOICE_RECIPIENT_NOT_READY',
} as const;

export type InvoiceErrorCode = (typeof InvoiceErrorCode)[keyof typeof InvoiceErrorCode];

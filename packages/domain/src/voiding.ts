import { z } from 'zod';
import { draftSchema } from './draft.js';
import { AWAITING_VERDICT_STATUSES, invoiceSchema, type InvoiceRecordStatus, type InvoiceStatus } from './invoice.js';

// Voiding (ADR 0005): only for an invoice that should never have existed. Its record of Voiding travels
// to the AEAT like any other; the invoice stays, voided, and its number is never reused.

/**
 * Whether an invoice can be voided: issued, neither rectified (Voiding and rectification are never
 * combined) nor itself corrective, and not waiting for the AEAT's verdict on its record. The AEAT may
 * have rejected it, or never received it (blocked).
 */
export function isVoidable(invoice: { status: InvoiceStatus; recordStatus: InvoiceRecordStatus; corrective: boolean }): boolean {
  const awaiting: readonly InvoiceRecordStatus[] = AWAITING_VERDICT_STATUSES;
  return invoice.status === 'issued' && !invoice.corrective && !awaiting.includes(invoice.recordStatus);
}

/** Whether a voided invoice's Voiding is sent again: the connector blocked it, or the AEAT rejected it. */
export function canResendVoiding(invoice: { status: InvoiceStatus; recordStatus: InvoiceRecordStatus; voiding: boolean }): boolean {
  return (
    invoice.status === 'voided' && invoice.voiding && (invoice.recordStatus === 'blocked' || invoice.recordStatus === 'rejected')
  );
}

/**
 * How a Voiding tells the AEAT what came before it, from the invoice's earlier records, oldest first:
 * whether the AEAT never registered the invoice (no submission or Amendment of it was accepted), and
 * whether it rejected the latest Voiding it received (a blocked one never reached it).
 */
export function voidingFlagsOf(previous: readonly { voiding: boolean; status: InvoiceRecordStatus }[]): {
  notRegistered: boolean;
  previouslyRejected: boolean;
} {
  const registered = previous.some(
    (record) => !record.voiding && (record.status === 'accepted' || record.status === 'accepted-with-errors'),
  );
  const lastVoiding = previous.filter((record) => record.voiding && record.status !== 'blocked').at(-1);
  return { notRegistered: !registered, previouslyRejected: lastVoiding?.status === 'rejected' };
}

/**
 * Body of POST /invoices/:id/voiding: voids the invoice, or sends its Voiding again. With `reissue`, also
 * a new draft with the same content, to issue it again with a new number.
 */
export const invoiceVoidingSchema = z.object({ reissue: z.boolean().default(false) });

export type InvoiceVoidingInput = z.input<typeof invoiceVoidingSchema>;

/** Response of POST /invoices/:id/voiding: the voided invoice and, with `reissue`, its new draft. */
export const voidedInvoiceSchema = z.object({ invoice: invoiceSchema, draft: draftSchema.nullable() });

export type VoidedInvoice = z.infer<typeof voidedInvoiceSchema>;

/**
 * Body of POST /invoices/:id/recipient-correction ("Corregir destinatario", ADR 0005): whether the user
 * already sent the invoice. Not sent, it is voided; sent, a total corrective invoice (R4) is issued.
 */
export const recipientCorrectionSchema = z.object({ sent: z.boolean() });

export type RecipientCorrection = z.infer<typeof recipientCorrectionSchema>;

/**
 * Response of POST /invoices/:id/recipient-correction: the new draft with the invoice's content and no
 * recipient, for the user to choose the right one, and the corrective invoice issued if it was sent.
 */
export const correctedRecipientSchema = z.object({ draft: draftSchema, correctiveInvoice: invoiceSchema.nullable() });

export type CorrectedRecipient = z.infer<typeof correctedRecipientSchema>;

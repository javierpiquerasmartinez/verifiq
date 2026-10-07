import { z } from 'zod';
import { breakdownSchema } from './amounts.js';
import { INVOICE_RECORD_STATUSES, INVOICE_STATUSES } from './invoice.js';

// The invoice list: the main screen. Drafts and issued invoices together, newest first.

/**
 * Each invoice falls in exactly one of these, in this order: voided, rectified, with an incident (its
 * record blocked, rejected, accepted with errors or unconfirmed), pending (awaiting the AEAT) or
 * accepted. `all` is every draft and invoice.
 */
export const INVOICE_LIST_FILTERS = ['all', 'drafts', 'pending', 'accepted', 'incidents', 'rectified', 'voided'] as const;

export type InvoiceListFilter = (typeof INVOICE_LIST_FILTERS)[number];

export const INVOICE_LIST_PAGE_SIZE = 25;

/** Query of GET /invoices. `q` matches the number, the recipient's name or an amount. */
export const invoiceListQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  filter: z.enum(INVOICE_LIST_FILTERS).default('all'),
  /** The previous page's `nextCursor`. */
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(INVOICE_LIST_PAGE_SIZE),
});

export type InvoiceListQuery = z.input<typeof invoiceListQuerySchema>;

const listedDraftSchema = z.object({
  kind: z.literal('draft'),
  id: z.uuid(),
  /** The day it was last edited: a draft has no issue date. */
  date: z.iso.date(),
  recipientName: z.string().nullable(),
  totalAmount: breakdownSchema.shape.totalAmount,
  amountDue: breakdownSchema.shape.amountDue,
});

const listedInvoiceSchema = z.object({
  kind: z.literal('invoice'),
  id: z.uuid(),
  number: z.string(),
  /** Its issue date. */
  date: z.iso.date(),
  /** As it was when the invoice was issued. */
  recipientName: z.string(),
  totalAmount: breakdownSchema.shape.totalAmount,
  amountDue: breakdownSchema.shape.amountDue,
  status: z.enum(INVOICE_STATUSES),
  recordStatus: z.enum(INVOICE_RECORD_STATUSES),
  /** Still without the AEAT's verdict more than 24 h after the Issuance. */
  unconfirmed: z.boolean(),
});

export const invoiceListItemSchema = z.discriminatedUnion('kind', [listedDraftSchema, listedInvoiceSchema]);

export type InvoiceListItem = z.infer<typeof invoiceListItemSchema>;

/** Response of GET /invoices: a page of the list, and how many match `q` under each filter. */
export const invoiceListSchema = z.object({
  items: z.array(invoiceListItemSchema),
  /** For the next page; null on the last one. */
  nextCursor: z.string().nullable(),
  counts: z.record(z.enum(INVOICE_LIST_FILTERS), z.number().int().nonnegative()),
});

export type InvoiceList = z.infer<typeof invoiceListSchema>;

/** An invoice whose record needs the user: blocked, rejected, accepted with errors or unconfirmed. */
export const invoiceIncidentSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  recipientName: z.string(),
  recordStatus: z.enum(INVOICE_RECORD_STATUSES),
  unconfirmed: z.boolean(),
  /** The connector's refusal or the AEAT's error, exactly as it came; null while unconfirmed. */
  message: z.string().nullable(),
});

export type InvoiceIncident = z.infer<typeof invoiceIncidentSchema>;

/** Response of GET /invoices/incidents: oldest first, so the longest waiting comes first. */
export const invoiceIncidentsSchema = z.array(invoiceIncidentSchema);


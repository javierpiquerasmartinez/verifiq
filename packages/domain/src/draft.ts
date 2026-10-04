import { z } from 'zod';
import { breakdownLineSchema, breakdownSchema, WITHHOLDING_RATES, type VatTreatment } from './amounts.js';
import { exemptionGround } from './exemptions.js';
import { CENSUS_STATUSES, recipientDataSchema, type CensusStatus } from './recipient.js';

// A Draft is an invoice in preparation: no number (ADR 0002) and no fiscal effect, so it can be
// saved half done, edited and deleted freely. What it still lacks to be issued are its problems.

/** Interval of dates (YYYY-MM-DD, both included) in which the invoiced services were rendered. */
export const billingPeriodSchema = z
  .object({ start: z.iso.date(), end: z.iso.date() })
  .refine(({ start, end }) => start <= end, {
    message: 'El periodo no puede terminar antes de empezar',
    path: ['end'],
  });

export type BillingPeriod = z.infer<typeof billingPeriodSchema>;

/** The operation date of an invoice with a Billing Period is its last day. */
export function operationDate(period: BillingPeriod | null): string | null {
  return period?.end ?? null;
}

const unsigned = (schema: z.ZodString) =>
  schema.refine((value) => !value.startsWith('-'), { message: 'No puede ser negativo' });

/** An ordinary invoice line; corrective invoices, with their negative lines, come later. */
export const draftLineSchema = breakdownLineSchema.extend({
  /** May be blank while the draft is prepared; issuing needs it. */
  concept: z.string().trim().max(500),
  quantity: unsigned(breakdownLineSchema.shape.quantity),
  unitPrice: unsigned(breakdownLineSchema.shape.unitPrice),
});

export type DraftLine = z.infer<typeof draftLineSchema>;
export type DraftLineInput = z.input<typeof draftLineSchema>;

/** Body of POST /drafts and PUT /drafts/:id. Amounts are never sent: the api computes them. */
export const draftDataSchema = z.object({
  recipientId: z.uuid().nullable(),
  billingPeriod: billingPeriodSchema.nullable(),
  /** Travels to the AEAT in the invoice record (up to 500 characters): never patient data. */
  operationDescription: z.string().trim().max(500),
  lines: z.array(draftLineSchema).max(100),
  withholding: z.literal(WITHHOLDING_RATES),
});

export type DraftData = z.infer<typeof draftDataSchema>;
export type DraftDataInput = z.input<typeof draftDataSchema>;

/** What a draft still lacks to be issued; `line` is the index of the line. */
export const draftProblemSchema = z.discriminatedUnion('code', [
  z.object({ code: z.literal('recipient-missing') }),
  /** The census did not answer when the recipient was saved: its tax ID is not confirmed. */
  z.object({ code: z.literal('recipient-unchecked') }),
  /** Archived after the draft picked it: archived recipients are not invoiced any more. */
  z.object({ code: z.literal('recipient-archived') }),
  /** The billing period has not ended yet: the AEAT refuses an operation date after the issue date. */
  z.object({ code: z.literal('operation-date-in-future') }),
  z.object({ code: z.literal('operation-description-missing') }),
  z.object({ code: z.literal('lines-missing') }),
  z.object({ code: z.literal('line-concept-missing'), line: z.int().nonnegative() }),
]);

export type DraftProblem = z.infer<typeof draftProblemSchema>;

/**
 * The problems of a draft issued on `today` (YYYY-MM-DD), in the order of the form. Shared by the
 * web (inline) and the api.
 */
export function findDraftProblems(
  draft: {
    recipient: { censusStatus: CensusStatus; archived: boolean } | null;
    billingPeriod: BillingPeriod | null;
    operationDescription: string;
    lines: { concept: string }[];
  },
  today: string,
): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (!draft.recipient) problems.push({ code: 'recipient-missing' });
  else if (draft.recipient.archived) problems.push({ code: 'recipient-archived' });
  else if (draft.recipient.censusStatus !== 'identified') problems.push({ code: 'recipient-unchecked' });
  const date = operationDate(draft.billingPeriod);
  if (date && date > today) problems.push({ code: 'operation-date-in-future' });
  if (!draft.operationDescription.trim()) problems.push({ code: 'operation-description-missing' });
  if (draft.lines.length === 0) problems.push({ code: 'lines-missing' });
  draft.lines.forEach(({ concept }, line) => {
    if (!concept.trim()) problems.push({ code: 'line-concept-missing', line });
  });
  return problems;
}

/** The recipient's current data as a draft shows it; issuing freezes a copy of it. */
export const draftRecipientSchema = recipientDataSchema.extend({
  id: z.uuid(),
  censusStatus: z.enum(CENSUS_STATUSES),
  archived: z.boolean(),
});

export type DraftRecipient = z.infer<typeof draftRecipientSchema>;

/** Response of the draft endpoints. */
export const draftSchema = draftDataSchema.omit({ recipientId: true }).extend({
  id: z.uuid(),
  recipient: draftRecipientSchema.nullable(),
  operationDate: z.iso.date().nullable(),
  /** Always today (Europe/Madrid): a draft is issued the day it is issued, never back-dated. */
  issueDate: z.iso.date(),
  breakdown: breakdownSchema,
  problems: z.array(draftProblemSchema),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type Draft = z.infer<typeof draftSchema>;

/** A row of GET /drafts, most recently edited first. */
export const draftSummarySchema = z.object({
  id: z.uuid(),
  recipientName: z.string().nullable(),
  operationDescription: z.string(),
  amountDue: breakdownSchema.shape.amountDue,
  updatedAt: z.iso.datetime({ offset: true }),
});

export type DraftSummary = z.infer<typeof draftSummarySchema>;

/** Stable error codes of the draft endpoints, so the web can show a clear message. */
export const DraftErrorCode = {
  NotFound: 'DRAFT_NOT_FOUND',
  /** The recipient does not exist or belongs to another issuer. */
  RecipientNotFound: 'DRAFT_RECIPIENT_NOT_FOUND',
} as const;

export type DraftErrorCode = (typeof DraftErrorCode)[keyof typeof DraftErrorCode];

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** "2026-09-30" → "30/09/2026". */
export const formatSpanishDate = (date: string) => date.split('-').reverse().join('/');

/** Last day of the month of a YYYY-MM-DD date. */
function endOfMonth(date: string): string {
  const [year, month] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
}

/** "septiembre 2026" for a whole calendar month; the dates otherwise. */
function periodText({ start, end }: BillingPeriod): string {
  if (start.endsWith('-01') && end === endOfMonth(start)) {
    const [year, month] = start.split('-').map(Number);
    return `${MONTHS[month! - 1]} ${year}`;
  }
  if (start === end) return formatSpanishDate(start);
  return `del ${formatSpanishDate(start)} al ${formatSpanishDate(end)}`;
}

/**
 * Generic Operation Description prefilled from the Billing Period, e.g. "Servicios odontológicos
 * septiembre 2026". The services are named after the issuer's default VAT treatment.
 */
export function defaultOperationDescription(period: BillingPeriod, vat: VatTreatment): string {
  const services = vat.kind === 'exempt' ? exemptionGround(vat.ground).services : 'Servicios profesionales';
  return `${services} ${periodText(period)}`;
}

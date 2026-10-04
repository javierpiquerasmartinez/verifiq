import { z } from 'zod';
import { fiscalDataSchema } from './issuer.js';

/**
 * Body of POST /recipients and PUT /recipients/:id: the data every invoice carries about its
 * Recipient. Spanish tax IDs only (NIF, NIE or CIF); the same rules as the issuer's own data.
 */
export const recipientDataSchema = fiscalDataSchema.pick({
  name: true,
  taxId: true,
  address: true,
  postalCode: true,
  municipality: true,
  province: true,
});

export type RecipientData = z.infer<typeof recipientDataSchema>;
export type RecipientDataInput = z.input<typeof recipientDataSchema>;

export const CENSUS_STATUSES = [
  /** The AEAT census has the tax ID under this name. */
  'identified',
  /** The census could not be asked when it was saved: it is asked again on the next save. */
  'unchecked',
] as const;

export type CensusStatus = (typeof CENSUS_STATUSES)[number];

export const recipientSchema = recipientDataSchema.extend({
  id: z.uuid(),
  censusStatus: z.enum(CENSUS_STATUSES),
  /** Archived recipients are left out of the selectors but stay in their invoices. */
  archived: z.boolean(),
  /** A recipient with issued invoices can only be archived, never deleted. */
  hasInvoices: z.boolean(),
});

export type Recipient = z.infer<typeof recipientSchema>;

/** `status` of GET /recipients: the active ones (the default) or the archived ones. */
export const RECIPIENT_LIST_STATUSES = ['active', 'archived'] as const;

export type RecipientListStatus = (typeof RECIPIENT_LIST_STATUSES)[number];

/** Stable error codes of the recipient endpoints, so the web can show a clear message. */
export const RecipientErrorCode = {
  NotFound: 'RECIPIENT_NOT_FOUND',
  /** The AEAT census does not have the tax ID. */
  TaxIdNotInCensus: 'TAX_ID_NOT_IN_CENSUS',
  /** The census has the tax ID, but deregistered or revoked. */
  TaxIdInactive: 'TAX_ID_INACTIVE',
  /** The census has the tax ID under another name; the body carries it as `censusName` when known. */
  CensusNameMismatch: 'CENSUS_NAME_MISMATCH',
  /** The connector refused the census query itself; `message` carries its explanation. */
  CensusRejected: 'CENSUS_REJECTED',
  HasInvoices: 'RECIPIENT_HAS_INVOICES',
} as const;

export type RecipientErrorCode = (typeof RecipientErrorCode)[keyof typeof RecipientErrorCode];

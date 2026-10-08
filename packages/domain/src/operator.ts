import { z } from 'zod';
import { REPRESENTATION_ERRORS, REPRESENTATION_STATES } from './representation.js';

// The operator's panel: invitations and the operational health of every issuer. It never shows
// invoices, their lines or recipients (spec, stories 91–93).

/** What a user can reach: a `user` acts for its issuer; the `operator` runs the SaaS and has no issuer. */
export const USER_ROLES = ['user', 'operator'] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Body of POST /operator/invitations. */
export const newInvitationSchema = z.object({ email: z.email().trim().toLowerCase() });

export type NewInvitation = z.infer<typeof newInvitationSchema>;

export const INVITATION_STATUSES = ['pending', 'accepted', 'expired', 'revoked'] as const;

export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

/** An invitation as the operator sees it. */
export const operatorInvitationSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  status: z.enum(INVITATION_STATUSES),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

export type OperatorInvitation = z.infer<typeof operatorInvitationSchema>;

/** Response of POST /operator/invitations: the link is shown once (only its hash is kept). */
export const createdInvitationSchema = operatorInvitationSchema.extend({ url: z.url() });

export type CreatedInvitation = z.infer<typeof createdInvitationSchema>;

export const operatorInvitationListSchema = operatorInvitationSchema.array();

/** An issuer as the operator sees it: who it is and how it is doing, never its business data. */
export const operatorIssuerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  taxId: z.string(),
  /** When it completed its onboarding (its "alta"); null while still onboarding. */
  onboardedAt: z.iso.datetime().nullable(),
  /** The last state the connector reported (the operator's panel never asks it). */
  representation: z.object({
    state: z.enum(REPRESENTATION_STATES),
    error: z.enum(REPRESENTATION_ERRORS).nullable(),
  }),
  invoiceCount: z.number().int().nonnegative(),
  /** Invoices under the user's "incidents" filter: their record blocked, rejected, accepted with errors or unconfirmed. */
  openIncidents: z.number().int().nonnegative(),
});

export type OperatorIssuer = z.infer<typeof operatorIssuerSchema>;

export const operatorIssuerListSchema = operatorIssuerSchema.array();

/**
 * Why a record alerts the operator: still without the AEAT's verdict after 24 h, rejected by the AEAT,
 * or blocked (refused by the connector before reaching the AEAT; it waits for the user's Resubmission).
 */
export const RECORD_ALERT_KINDS = ['unconfirmed', 'rejected', 'blocked'] as const;

export type RecordAlertKind = (typeof RECORD_ALERT_KINDS)[number];

/** The latest record of an invoice, stuck, rejected or blocked. */
export const recordAlertSchema = z.object({
  invoiceRecordId: z.uuid(),
  kind: z.enum(RECORD_ALERT_KINDS),
  issuer: z.object({ id: z.uuid(), name: z.string(), taxId: z.string() }),
  /** To talk about it with the user: the invoice's number, nothing of its content. */
  invoiceNumber: z.string(),
  /** Unconfirmed: when it was issued. Rejected: when the AEAT's verdict arrived. Blocked: when the connector refused it. */
  since: z.iso.datetime(),
  /** The AEAT's error code, or the connector's when blocked; their messages may name the recipient, so they are left out. */
  errorCode: z.string().nullable(),
});

export type RecordAlert = z.infer<typeof recordAlertSchema>;

export const recordAlertListSchema = recordAlertSchema.array();

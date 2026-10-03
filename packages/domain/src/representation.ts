import { z } from 'zod';

const requiredText = (max: number) => z.string().trim().min(1).max(max);

/**
 * Body of POST /issuer/representation/signing: the person who signs the Representation online,
 * verifying their identity with their DNI. The link goes to the email of the signed-in user.
 */
export const representationSignerSchema = z.object({
  firstName: requiredText(100),
  lastNames: requiredText(150),
  street: requiredText(150),
  streetNumber: requiredText(20),
  municipality: requiredText(100),
});

export type RepresentationSigner = z.infer<typeof representationSignerSchema>;

export const REPRESENTATION_STATES = [
  /** The connector's environment (staging, AEAT test environment) needs no Representation. */
  'not-required',
  'not-started',
  /** A remote signing was started and is waiting for the signer. */
  'pending',
  'signed',
  /** The last signing failed: `error` says why. A new signing can be started. */
  'error',
] as const;

export type RepresentationState = (typeof REPRESENTATION_STATES)[number];

export const REPRESENTATION_ERRORS = [
  'rejected',
  'expired',
  'cancelled',
  /** The connector refused to register the issuer (e.g. its tax ID is not in the AEAT census). */
  'issuer-not-accepted',
] as const;

export type RepresentationError = (typeof REPRESENTATION_ERRORS)[number];

/** Response of GET /issuer/representation. */
export const representationSchema = z.object({
  state: z.enum(REPRESENTATION_STATES),
  error: z.enum(REPRESENTATION_ERRORS).nullable(),
  /** While a signing is pending: where to sign. */
  signingUrl: z.string().nullable(),
  /** The connector could not be reached: `state` is the last one known. */
  stale: z.boolean(),
  /** Only with a valid Representation (or none required) can the issuer issue invoices. */
  canIssue: z.boolean(),
});

export type Representation = z.infer<typeof representationSchema>;

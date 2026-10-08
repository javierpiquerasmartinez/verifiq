import { z } from 'zod';
import { issuerDefaultsSchema, fiscalDataSchema } from './issuer.js';
import { seriesSchema } from './series.js';

/**
 * The steps of the issuer onboarding, in order. Signing the Representation comes after them: the
 * issuer can prepare its data meanwhile, but cannot issue (representation.ts).
 */
export const ONBOARDING_STEPS = ['fiscal-data', 'defaults', 'series', 'terms'] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Current versions of the legal documents accepted during onboarding. Bumping one records a new
 * acceptance the next time it is asked for; acceptances of older versions are kept.
 */
export const LEGAL_DOCUMENTS = {
  termsOfUse: { title: 'Términos de uso', version: '2026-10-02' },
  dataProcessingAgreement: { title: 'Contrato de encargo del tratamiento', version: '2026-10-02' },
} as const;

export type LegalDocument = keyof typeof LEGAL_DOCUMENTS;

/** Body of POST /onboarding/terms: the versions the user read and accepts. */
export const acceptTermsSchema = z.object({
  termsOfUseVersion: z.string(),
  dataProcessingAgreementVersion: z.string(),
});

export type AcceptTerms = z.infer<typeof acceptTermsSchema>;

/**
 * Response of GET /onboarding: where the user left the onboarding and what is already saved. Also
 * the issuer's settings once it is complete (PUT /issuer/fiscal-data, PUT /issuer/defaults).
 */
export const onboardingSchema = z.object({
  /** The first step not done yet; `completed` once the terms are accepted. */
  step: z.enum([...ONBOARDING_STEPS, 'completed']),
  fiscalData: fiscalDataSchema.nullable(),
  hasLogo: z.boolean(),
  defaults: issuerDefaultsSchema.nullable(),
  /** Set once confirmed; it never changes afterwards. */
  series: seriesSchema.nullable(),
  /** The acceptance recorded in step 4. */
  terms: z
    .object({ termsOfUseVersion: z.string(), dataProcessingAgreementVersion: z.string(), acceptedAt: z.iso.datetime() })
    .nullable(),
});

export type Onboarding = z.infer<typeof onboardingSchema>;

/** Response of GET /issuer: the active issuer, shown in the header. */
export const issuerSummarySchema = z.object({
  name: z.string(),
  taxId: z.string(),
  /** Whether the issuer can issue invoices: needs its connector key and, in production, a signed Representation (representation.ts). */
  canIssue: z.boolean(),
});

export type IssuerSummary = z.infer<typeof issuerSummarySchema>;

/** The logo printed on the invoices: PNG or JPEG (what the PDF renderer accepts), up to 1 MB. */
export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg'] as const;
export const LOGO_MAX_BYTES = 1024 * 1024;

/** Stable error codes of the issuer endpoints, so the web can show a clear message. */
export const IssuerErrorCode = {
  /** The user has not finished onboarding: business endpoints are not reachable yet. */
  OnboardingIncomplete: 'ONBOARDING_INCOMPLETE',
  /** A step was sent before the ones it depends on. */
  OnboardingStepPending: 'ONBOARDING_STEP_PENDING',
  /** Onboarding is complete: the issuer's data is edited from the settings (PUT /issuer/*). */
  OnboardingCompleted: 'ONBOARDING_COMPLETED',
  TaxIdTaken: 'TAX_ID_TAKEN',
  SeriesAlreadyConfirmed: 'SERIES_ALREADY_CONFIRMED',
  /** The accepted versions of the legal documents are not the current ones. */
  LegalVersionOutdated: 'LEGAL_VERSION_OUTDATED',
  LogoInvalid: 'LOGO_INVALID',
  LogoNotFound: 'LOGO_NOT_FOUND',
  /** A signing is pending or the Representation is already signed: starting another would duplicate it. */
  RepresentationInPlace: 'REPRESENTATION_IN_PLACE',
  /** The connector's environment needs no Representation. */
  RepresentationNotRequired: 'REPRESENTATION_NOT_REQUIRED',
  /** There is no pending signing whose link could be resent. */
  RepresentationNotPending: 'REPRESENTATION_NOT_PENDING',
  /** The connector refused the request; `message` carries its explanation. */
  ConnectorRejected: 'CONNECTOR_REJECTED',
  /** The connector did not answer: try again later. */
  ConnectorUnavailable: 'CONNECTOR_UNAVAILABLE',
  ValidationFailed: 'VALIDATION_FAILED',
} as const;

export type IssuerErrorCode = (typeof IssuerErrorCode)[keyof typeof IssuerErrorCode];

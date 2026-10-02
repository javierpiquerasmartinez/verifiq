import { z } from 'zod';
import { emisorDefaultsSchema, fiscalDataSchema } from './emisor.js';
import { seriesSchema } from './serie.js';

/** The steps of the alta del Emisor, in order. The Representación (issue 06) comes after them. */
export const ONBOARDING_STEPS = ['fiscal-data', 'defaults', 'serie', 'terms'] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Current versions of the legal documents accepted in the alta. Bumping one records a new
 * acceptance the next time it is asked for; acceptances of older versions are kept.
 */
export const LEGAL_DOCUMENTS = {
  terminos: { title: 'Términos de uso', version: '2026-10-02' },
  contratoEncargo: { title: 'Contrato de encargo del tratamiento', version: '2026-10-02' },
} as const;

export type LegalDocument = keyof typeof LEGAL_DOCUMENTS;

/** Body of POST /onboarding/terms: the versions the Usuario read and accepts. */
export const acceptTermsSchema = z.object({
  terminosVersion: z.string(),
  contratoEncargoVersion: z.string(),
});

export type AcceptTerms = z.infer<typeof acceptTermsSchema>;

/** Response of GET /onboarding: where the Usuario left the alta and what is already saved. */
export const onboardingSchema = z.object({
  /** The first step not done yet; `completed` once the terms are accepted. */
  step: z.enum([...ONBOARDING_STEPS, 'completed']),
  fiscalData: fiscalDataSchema.nullable(),
  hasLogo: z.boolean(),
  defaults: emisorDefaultsSchema.nullable(),
  /** Set once confirmed; it never changes afterwards. */
  series: seriesSchema.nullable(),
  /** The acceptance recorded in step 4. */
  terms: z
    .object({ terminosVersion: z.string(), contratoEncargoVersion: z.string(), acceptedAt: z.iso.datetime() })
    .nullable(),
});

export type Onboarding = z.infer<typeof onboardingSchema>;

/** Response of GET /emisor: the active Emisor, shown in the header. */
export const emisorSummarySchema = z.object({
  name: z.string(),
  nif: z.string(),
});

export type EmisorSummary = z.infer<typeof emisorSummarySchema>;

/** The logo printed on the invoices: PNG or JPEG (what the PDF renderer accepts), up to 1 MB. */
export const LOGO_CONTENT_TYPES = ['image/png', 'image/jpeg'] as const;
export const LOGO_MAX_BYTES = 1024 * 1024;

/** Stable error codes of the Emisor endpoints, so the web can show a clear message. */
export const EmisorErrorCode = {
  /** The Usuario has not finished the alta: business endpoints are not reachable yet. */
  OnboardingIncomplete: 'ONBOARDING_INCOMPLETE',
  /** A step was sent before the ones it depends on. */
  OnboardingStepPending: 'ONBOARDING_STEP_PENDING',
  NifTaken: 'NIF_TAKEN',
  SerieAlreadyConfirmed: 'SERIE_ALREADY_CONFIRMED',
  /** The accepted versions of the legal documents are not the current ones. */
  LegalVersionOutdated: 'LEGAL_VERSION_OUTDATED',
  LogoInvalid: 'LOGO_INVALID',
  LogoNotFound: 'LOGO_NOT_FOUND',
  ValidationFailed: 'VALIDATION_FAILED',
} as const;

export type EmisorErrorCode = (typeof EmisorErrorCode)[keyof typeof EmisorErrorCode];

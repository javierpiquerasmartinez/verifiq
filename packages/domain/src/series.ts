import { z } from 'zod';

/**
 * A series is `<prefix><year>-` (ADR 0004): the prefix is chosen once during onboarding and the year
 * restarts the numbering every January. Digits are allowed only inside the prefix, so it never
 * blurs into the year.
 */
const PREFIX = /^[A-Z]([A-Z0-9]{0,8}[A-Z])?$/;

/** Proposed during onboarding: `F<year>-` and `R<year>-`. */
export const DEFAULT_SERIES_PREFIX = 'F';
export const DEFAULT_CORRECTIVE_PREFIX = 'R';

const prefixSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(
    z.string().regex(PREFIX, {
      message: 'De 1 a 10 letras sin tildes ni símbolos; puede llevar cifras, pero no al principio ni al final',
    }),
  );

/** The ordinary series and the corrective invoice series; they can never share a prefix. */
export const seriesSchema = z
  .object({ prefix: prefixSchema, correctivePrefix: prefixSchema })
  .refine(({ prefix, correctivePrefix }) => prefix !== correctivePrefix, {
    message: 'Las rectificativas necesitan una Serie propia',
    path: ['correctivePrefix'],
  });

export type Series = z.infer<typeof seriesSchema>;

export function seriesCode(prefix: string, year: number): string {
  return `${prefix}${year}-`;
}

/** Correlative number within its series, padded to 4 digits: the 0001 of F2026-0001. */
export function serialNumber(number: number): string {
  return String(number).padStart(4, '0');
}

/** Series and correlative number: F2026-0001. */
export function invoiceNumber(prefix: string, year: number, number: number): string {
  return invoiceNumberIn(seriesCode(prefix, year), number);
}

/** The number of an invoice of a series code: F2026- and 1 → F2026-0001. */
export function invoiceNumberIn(series: string, number: number): string {
  return `${series}${serialNumber(number)}`;
}

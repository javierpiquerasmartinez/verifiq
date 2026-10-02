import { z } from 'zod';

/**
 * A Serie is `<prefix><year>-` (ADR 0004): the prefix is chosen once in the alta and the year
 * restarts the numbering every January. Digits are allowed only inside the prefix, so it never
 * blurs into the year.
 */
const PREFIX = /^[A-Z]([A-Z0-9]{0,8}[A-Z])?$/;

/** Proposed in the alta: `F<año>-` and `R<año>-`. */
export const DEFAULT_SERIE_PREFIX = 'F';
export const DEFAULT_RECTIFICATIVA_PREFIX = 'R';

const prefixSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(
    z.string().regex(PREFIX, {
      message: 'De 1 a 10 letras sin tildes ni símbolos; puede llevar cifras, pero no al principio ni al final',
    }),
  );

/** The ordinary Serie and the Serie of rectificativas; they can never share a prefix. */
export const seriesSchema = z
  .object({ prefix: prefixSchema, rectificativaPrefix: prefixSchema })
  .refine(({ prefix, rectificativaPrefix }) => prefix !== rectificativaPrefix, {
    message: 'Las rectificativas necesitan una Serie propia',
    path: ['rectificativaPrefix'],
  });

export type Series = z.infer<typeof seriesSchema>;

export function serieCode(prefix: string, year: number): string {
  return `${prefix}${year}-`;
}

/** Correlative number within the Serie, padded to 4 digits: F2026-0001. */
export function invoiceNumber(prefix: string, year: number, number: number): string {
  return `${serieCode(prefix, year)}${String(number).padStart(4, '0')}`;
}

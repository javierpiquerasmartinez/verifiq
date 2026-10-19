import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

// Text search shared by the lists (recipients, invoices).

const ACCENTED = 'áàäâéèëêíìïîóòöôúùüûç';
const UNACCENTED = 'aaaaeeeeiiiioooouuuuc';

/** Lowercase without accents (ñ kept), on both sides of a search: the same mapping as `foldColumn`. */
export const fold = (text: string) =>
  [...text.normalize('NFC').toLowerCase()].map((char) => UNACCENTED[ACCENTED.indexOf(char)] ?? char).join('');
export const foldColumn = (column: AnyPgColumn | SQL) =>
  sql`translate(lower(normalize(${column}, NFC)), ${ACCENTED}, ${UNACCENTED})`;
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');

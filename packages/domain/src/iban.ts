import { z } from 'zod';

const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const SPANISH_IBAN = /^ES\d{22}$/;

/** ISO 13616 check: move the first four characters to the end, letters to numbers, mod 97 must be 1. */
function hasValidCheckDigits(iban: string): boolean {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const value = char >= 'A' ? char.charCodeAt(0) - 55 : Number(char);
    remainder = (remainder * (value >= 10 ? 100 : 10) + value) % 97;
  }
  return remainder === 1;
}

/** Uppercases and strips the separators people usually type (spaces, hyphens). */
export function normalizeIban(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function isValidIban(input: string): boolean {
  const iban = normalizeIban(input);
  if (!IBAN.test(iban)) return false;
  if (iban.startsWith('ES') && !SPANISH_IBAN.test(iban)) return false;
  return hasValidCheckDigits(iban);
}

/** An IBAN; parses to its normalised form, without spaces. */
export const ibanSchema = z
  .string()
  .transform(normalizeIban)
  .refine(isValidIban, { message: 'IBAN no válido' });

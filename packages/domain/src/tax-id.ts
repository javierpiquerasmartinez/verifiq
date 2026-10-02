import { z } from 'zod';

/** Spanish tax identifier kinds. NIF covers DNI-based ones and the K/L/M special NIFs. */
export type TaxIdKind = 'NIF' | 'NIE' | 'CIF';

export type TaxIdCheck = { valid: true; kind: TaxIdKind; value: string } | { valid: false };

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';
const CIF_CONTROL_LETTERS = 'JABCDEFGHI';
const NIE_PREFIX_DIGIT: Record<string, string> = { X: '0', Y: '1', Z: '2' };

const NIF = /^(\d{8})([A-Z])$/;
const SPECIAL_NIF = /^[KLM](\d{7})([A-Z])$/;
const NIE = /^([XYZ])(\d{7})([A-Z])$/;
const CIF = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/;

/** Entity letters whose control character must be a digit, or must be a letter; the rest accept either. */
const CIF_DIGIT_CONTROL = 'ABEH';
const CIF_LETTER_CONTROL = 'NPQRSW';

function dniLetter(digits: string): string {
  return DNI_LETTERS[Number(digits) % 23]!;
}

function cifControlDigit(digits: string): number {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    const digit = Number(digits[i]);
    if (i % 2 === 0) {
      const doubled = digit * 2;
      sum += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sum += digit;
    }
  }
  return (10 - (sum % 10)) % 10;
}

function isValidCif(entity: string, digits: string, control: string): boolean {
  const expected = cifControlDigit(digits);
  const isDigit = /\d/.test(control);
  if (CIF_DIGIT_CONTROL.includes(entity)) return isDigit && Number(control) === expected;
  if (CIF_LETTER_CONTROL.includes(entity)) return !isDigit && control === CIF_CONTROL_LETTERS[expected];
  return isDigit ? Number(control) === expected : control === CIF_CONTROL_LETTERS[expected];
}

/** Uppercases and strips the separators people usually type (spaces, dots, hyphens). */
export function normalizeTaxId(input: string): string {
  return input.toUpperCase().replace(/[\s.-]/g, '');
}

/** Checks the format and control character of a Spanish NIF, NIE or CIF. */
export function parseTaxId(input: string): TaxIdCheck {
  const value = normalizeTaxId(input);

  const nif = NIF.exec(value);
  if (nif) return nif[2] === dniLetter(nif[1]!) ? { valid: true, kind: 'NIF', value } : { valid: false };

  const special = SPECIAL_NIF.exec(value);
  if (special) {
    return special[2] === dniLetter(special[1]!) ? { valid: true, kind: 'NIF', value } : { valid: false };
  }

  const nie = NIE.exec(value);
  if (nie) {
    const digits = NIE_PREFIX_DIGIT[nie[1]!]! + nie[2]!;
    return nie[3] === dniLetter(digits) ? { valid: true, kind: 'NIE', value } : { valid: false };
  }

  const cif = CIF.exec(value);
  if (cif && isValidCif(cif[1]!, cif[2]!, cif[3]!)) return { valid: true, kind: 'CIF', value };

  return { valid: false };
}

/** A Spanish NIF, NIE or CIF; parses to its normalised form. */
export const taxIdSchema = z
  .string()
  .transform(normalizeTaxId)
  .refine((value) => parseTaxId(value).valid, { message: 'NIF, NIE o CIF no válido' });

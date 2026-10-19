import { describe, expect, it } from 'vitest';
import { ibanSchema } from './iban.js';

describe('ibanSchema', () => {
  it.each([
    ['ES9121000418450200051332', 'ES9121000418450200051332'],
    ['ES91 2100 0418 4502 0005 1332', 'ES9121000418450200051332'],
    ['es91-2100-0418-4502-0005-1332', 'ES9121000418450200051332'],
    ['DE89370400440532013000', 'DE89370400440532013000'],
    ['GB82WEST12345698765432', 'GB82WEST12345698765432'],
  ])('accepts %s', (input, normalised) => {
    expect(ibanSchema.parse(input)).toBe(normalised);
  });

  it.each([
    ['wrong check digits', 'ES9121000418450200051333'],
    ['Spanish IBAN too short', 'ES912100041845020005133'],
    ['Spanish IBAN too long', 'ES91210004184502000513321'],
    ['no country code', '9121000418450200051332'],
    ['empty', ''],
  ])('rejects %s', (_, input) => {
    expect(ibanSchema.safeParse(input).success).toBe(false);
  });
});

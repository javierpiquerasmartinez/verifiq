import { z } from 'zod';
import { vatTreatmentSchema, WITHHOLDING_RATES } from './amounts.js';
import { ibanSchema } from './iban.js';
import { taxIdSchema } from './tax-id.js';

const requiredText = (max: number) => z.string().trim().min(1).max(max);

/** Blank or missing means "not given" and parses to null. */
const optionalText = <T extends z.ZodType<unknown, string>>(schema: T) =>
  z
    .string()
    .nullish()
    .transform((value) => value?.trim() || null)
    .pipe(schema.nullable());

/** Spanish postal code: 5 digits, the first two being the province (01–52). */
const postalCodeSchema = z
  .string()
  .trim()
  .regex(/^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/, { message: 'Código postal no válido' });

/** Onboarding step 1: the data every invoice carries about its issuer. */
export const fiscalDataSchema = z.object({
  /** Full name or company name; VeriFactu takes up to 120 characters. */
  name: requiredText(120),
  taxId: taxIdSchema,
  /** Fiscal address. */
  address: requiredText(200),
  postalCode: postalCodeSchema,
  municipality: requiredText(100),
  province: requiredText(100),
  email: optionalText(z.email({ message: 'Email no válido' }).max(254)),
  phone: optionalText(
    z.string().regex(/^\+?[\d\s().-]{6,20}$/, { message: 'Teléfono no válido' }),
  ),
  iban: optionalText(ibanSchema),
});

export type FiscalData = z.infer<typeof fiscalDataSchema>;
export type FiscalDataInput = z.input<typeof fiscalDataSchema>;

/**
 * Body of PUT /issuer/fiscal-data: the fiscal data editable from the settings. The tax ID is not:
 * the connector key and the Representation are bound to it.
 */
export const editableFiscalDataSchema = fiscalDataSchema.omit({ taxId: true });

export type EditableFiscalData = z.infer<typeof editableFiscalDataSchema>;
export type EditableFiscalDataInput = z.input<typeof editableFiscalDataSchema>;

/** Onboarding step 2: what every new invoice line and invoice starts with. */
export const issuerDefaultsSchema = z.object({
  withholding: z.literal(WITHHOLDING_RATES),
  vat: vatTreatmentSchema,
});

export type IssuerDefaults = z.infer<typeof issuerDefaultsSchema>;

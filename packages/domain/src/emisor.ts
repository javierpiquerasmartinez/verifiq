import { z } from 'zod';
import { ivaTreatmentSchema, RETENCION_IRPF_RATES } from './amounts.js';
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

/** Step 1 of the alta: the data every invoice carries about its Emisor. */
export const fiscalDataSchema = z.object({
  /** Nombre o razón social; VeriFactu takes up to 120 characters. */
  name: requiredText(120),
  nif: taxIdSchema,
  /** Domicilio fiscal. */
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

/** Step 2 of the alta: what every new invoice line and invoice starts with. */
export const emisorDefaultsSchema = z.object({
  retencionIrpf: z.literal(RETENCION_IRPF_RATES),
  iva: ivaTreatmentSchema,
});

export type EmisorDefaults = z.infer<typeof emisorDefaultsSchema>;

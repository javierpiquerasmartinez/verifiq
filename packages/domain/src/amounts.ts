import Big from 'big.js';
import { z } from 'zod';
import { SUPUESTO_EXENCION_IDS, supuestoExencionSchema, type SupuestoExencionId } from './exemptions.js';

export const IVA_RATES = [21, 10, 4, 0] as const;
export type IvaRate = (typeof IVA_RATES)[number];

export const RETENCION_IRPF_RATES = [15, 7, 0] as const;
export type RetencionIrpfRate = (typeof RETENCION_IRPF_RATES)[number];

/** Decimal amounts travel as strings so they never go through a float. */
const decimalString = (maxDecimals: number, { signed }: { signed: boolean }) =>
  z.string().regex(new RegExp(`^${signed ? '-?' : ''}\\d{1,9}(\\.\\d{1,${maxDecimals}})?$`));

/** A line is either taxed at an IVA rate or exempt under a Supuesto de exención. */
export const ivaTreatmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('taxed'), rate: z.literal(IVA_RATES) }),
  z.object({ kind: z.literal('exempt'), supuesto: supuestoExencionSchema }),
]);

export type IvaTreatment = z.infer<typeof ivaTreatmentSchema>;

export const breakdownLineSchema = z.object({
  /** Signed: rectificativas por diferencias carry negative lines. */
  quantity: decimalString(2, { signed: true }),
  unitPrice: decimalString(4, { signed: true }),
  discountPercent: decimalString(2, { signed: false })
    .refine((value) => new Big(value).lte(100), { message: 'El descuento no puede superar el 100 %' })
    .optional(),
  iva: ivaTreatmentSchema,
});

export type BreakdownLine = z.infer<typeof breakdownLineSchema>;

export const breakdownInputSchema = z.object({
  lines: z.array(breakdownLineSchema),
  retencionIrpf: z.literal(RETENCION_IRPF_RATES),
});

export type BreakdownInput = z.infer<typeof breakdownInputSchema>;

/** Every amount is a decimal string with exactly 2 decimals. */
export interface Breakdown {
  lines: { base: string }[];
  /** Highest rate first. */
  taxed: { rate: IvaRate; base: string; cuota: string }[];
  /** In catalogue order. */
  exempt: { supuesto: SupuestoExencionId; base: string }[];
  /** Sum of every line base, taxed and exempt. */
  baseImponible: string;
  /** Base imponible plus cuotas: what is declared to the AEAT. */
  importeTotal: string;
  retencionIrpf: { rate: RetencionIrpfRate; amount: string };
  /** Importe total minus the Retención de IRPF: what the Destinatario pays. */
  totalAPagar: string;
}

const HUNDRED = new Big(100);

/** Half-up to cents, away from zero for negatives, so negating an invoice negates every amount. */
function toCents(value: Big): Big {
  return value.round(2, Big.roundHalfUp);
}

function format(value: Big): string {
  return value.eq(0) ? '0.00' : value.toFixed(2);
}

function percentOf(base: Big, rate: number): Big {
  return toCents(base.times(rate).div(HUNDRED));
}

function lineBase(line: BreakdownLine): Big {
  const discount = new Big(line.discountPercent ?? '0');
  return toCents(new Big(line.quantity).times(line.unitPrice).times(HUNDRED.minus(discount)).div(HUNDRED));
}

/**
 * Invoice breakdown, the single source of truth for amounts in web and api.
 * Line bases are rounded to cents; each cuota is computed on the sum of its rate's bases;
 * the Retención de IRPF on the whole base imponible.
 */
export function computeBreakdown(input: BreakdownInput): Breakdown {
  const bases = input.lines.map(lineBase);

  const taxedBases = new Map<IvaRate, Big>();
  const exemptBases = new Map<SupuestoExencionId, Big>();
  input.lines.forEach((line, i) => {
    const base = bases[i]!;
    if (line.iva.kind === 'taxed') {
      taxedBases.set(line.iva.rate, (taxedBases.get(line.iva.rate) ?? new Big(0)).plus(base));
    } else {
      exemptBases.set(line.iva.supuesto, (exemptBases.get(line.iva.supuesto) ?? new Big(0)).plus(base));
    }
  });

  const taxed = IVA_RATES.filter((rate) => taxedBases.has(rate)).map((rate) => {
    const base = taxedBases.get(rate)!;
    return { rate, base, cuota: percentOf(base, rate) };
  });

  const baseImponible = bases.reduce((sum, base) => sum.plus(base), new Big(0));
  const importeTotal = taxed.reduce((sum, { cuota }) => sum.plus(cuota), baseImponible);
  const retencion = percentOf(baseImponible, input.retencionIrpf);

  return {
    lines: bases.map((base) => ({ base: format(base) })),
    taxed: taxed.map(({ rate, base, cuota }) => ({ rate, base: format(base), cuota: format(cuota) })),
    exempt: SUPUESTO_EXENCION_IDS.filter((id) => exemptBases.has(id)).map((supuesto) => ({
      supuesto,
      base: format(exemptBases.get(supuesto)!),
    })),
    baseImponible: format(baseImponible),
    importeTotal: format(importeTotal),
    retencionIrpf: { rate: input.retencionIrpf, amount: format(retencion) },
    totalAPagar: format(importeTotal.minus(retencion)),
  };
}

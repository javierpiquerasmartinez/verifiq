import Big from 'big.js';
import { z } from 'zod';
import {
  EXEMPTION_GROUND_IDS,
  exemptionGround,
  exemptionGroundSchema,
  type ExemptionGroundId,
} from './exemptions.js';

/** 0 % is a taxed rate (e.g. some resold goods), not an exemption: exempt lines carry an exemption ground. */
export const VAT_RATES = [21, 10, 4, 0] as const;
export type VatRate = (typeof VAT_RATES)[number];

export const WITHHOLDING_RATES = [15, 7, 0] as const;
export type WithholdingRate = (typeof WITHHOLDING_RATES)[number];

/** Decimal amounts travel as strings so they never go through a float. */
const decimalString = (maxDecimals: number, { signed }: { signed: boolean }) =>
  z.string().regex(new RegExp(`^${signed ? '-?' : ''}\\d{1,9}(\\.\\d{1,${maxDecimals}})?$`));

/** A line is either taxed at a VAT rate or exempt under an exemption ground. */
export const vatTreatmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('taxed'), rate: z.literal(VAT_RATES) }),
  z.object({ kind: z.literal('exempt'), ground: exemptionGroundSchema }),
]);

export type VatTreatment = z.infer<typeof vatTreatmentSchema>;

export const breakdownLineSchema = z.object({
  /** Signed: corrective invoices by differences carry negative lines. */
  quantity: decimalString(2, { signed: true }),
  unitPrice: decimalString(4, { signed: true }),
  discountPercent: decimalString(2, { signed: false })
    .refine((value) => new Big(value).lte(100), { message: 'El descuento no puede superar el 100 %' })
    .optional(),
  vat: vatTreatmentSchema,
});

export type BreakdownLine = z.infer<typeof breakdownLineSchema>;

export const breakdownInputSchema = z.object({
  lines: z.array(breakdownLineSchema),
  withholding: z.literal(WITHHOLDING_RATES),
});

export type BreakdownInput = z.infer<typeof breakdownInputSchema>;

/** Every amount is a decimal string with exactly 2 decimals. */
export interface Breakdown {
  lines: { base: string }[];
  /** Highest rate first. */
  taxed: { rate: VatRate; base: string; taxAmount: string }[];
  /** In catalogue order, with the legal mention to print. */
  exempt: { ground: ExemptionGroundId; base: string; mention: string }[];
  /** Sum of every line base, taxed and exempt. */
  taxBase: string;
  /** Tax base plus tax amounts: what is declared to the AEAT. */
  totalAmount: string;
  withholding: { rate: WithholdingRate; amount: string };
  /** Total amount minus the withholding: what the recipient pays. */
  amountDue: string;
}

const HUNDRED = new Big(100);

/** Half-up to cents, away from zero for negatives, so negating an invoice negates every amount. */
function toCents(value: Big): Big {
  return value.round(2, Big.roundHalfUp);
}

function formatCents(value: Big): string {
  return value.eq(0) ? '0.00' : value.toFixed(2);
}

function percentOf(base: Big, rate: number): Big {
  return toCents(base.times(rate).div(HUNDRED));
}

function addTo<K>(sums: Map<K, Big>, key: K, amount: Big): void {
  sums.set(key, (sums.get(key) ?? new Big(0)).plus(amount));
}

function lineBase(line: BreakdownLine): Big {
  const discount = new Big(line.discountPercent ?? '0');
  return toCents(new Big(line.quantity).times(line.unitPrice).times(HUNDRED.minus(discount)).div(HUNDRED));
}

/**
 * Invoice breakdown, the single source of truth for amounts in web and api.
 * Line bases are rounded to cents; each tax amount is computed on the sum of its rate's bases;
 * the withholding on the whole tax base.
 */
export function computeBreakdown(input: BreakdownInput): Breakdown {
  const bases = input.lines.map(lineBase);

  const taxedBases = new Map<VatRate, Big>();
  const exemptBases = new Map<ExemptionGroundId, Big>();
  input.lines.forEach((line, i) => {
    const base = bases[i]!;
    if (line.vat.kind === 'taxed') addTo(taxedBases, line.vat.rate, base);
    else addTo(exemptBases, line.vat.ground, base);
  });

  const taxed = VAT_RATES.filter((rate) => taxedBases.has(rate)).map((rate) => {
    const base = taxedBases.get(rate)!;
    return { rate, base, taxAmount: percentOf(base, rate) };
  });

  const taxBase = bases.reduce((sum, base) => sum.plus(base), new Big(0));
  const totalAmount = taxed.reduce((sum, { taxAmount }) => sum.plus(taxAmount), taxBase);
  const withheld = percentOf(taxBase, input.withholding);

  return {
    lines: bases.map((base) => ({ base: formatCents(base) })),
    taxed: taxed.map(({ rate, base, taxAmount }) => ({ rate, base: formatCents(base), taxAmount: formatCents(taxAmount) })),
    exempt: EXEMPTION_GROUND_IDS.filter((id) => exemptBases.has(id)).map((ground) => ({
      ground,
      base: formatCents(exemptBases.get(ground)!),
      mention: exemptionGround(ground).mention,
    })),
    taxBase: formatCents(taxBase),
    totalAmount: formatCents(totalAmount),
    withholding: { rate: input.withholding, amount: formatCents(withheld) },
    amountDue: formatCents(totalAmount.minus(withheld)),
  };
}

import { describe, expect, it } from 'vitest';
import { breakdownInputSchema, computeBreakdown, sumAmounts, type BreakdownInput, type BreakdownLine } from './amounts.js';

const exempt = { kind: 'exempt', ground: 'dentistry' } as const;
const mention =
  'Operación exenta de IVA en virtud del artículo 20.Uno.5º de la Ley 37/1992, del Impuesto sobre el Valor Añadido.';
const taxed = (rate: 21 | 10 | 4 | 0) => ({ kind: 'taxed', rate }) as const;
const line = (quantity: string, unitPrice: string, vat: BreakdownLine['vat'], discountPercent?: string) => ({
  quantity,
  unitPrice,
  vat,
  ...(discountPercent === undefined ? {} : { discountPercent }),
});

describe('computeBreakdown', () => {
  it('exempt dental invoice with 15 % withholding', () => {
    expect(computeBreakdown({ lines: [line('1', '2500', exempt)], withholding: 15 })).toEqual({
      lines: [{ base: '2500.00' }],
      taxed: [],
      exempt: [{ ground: 'dentistry', base: '2500.00', mention }],
      taxBase: '2500.00',
      totalAmount: '2500.00',
      withholding: { rate: 15, amount: '375.00' },
      amountDue: '2125.00',
    });
  });

  it('mixed invoice: bases by rate (highest first), exempt bases and withholding on the whole base', () => {
    const breakdown = computeBreakdown({
      lines: [
        line('1', '1000', exempt),
        line('2', '10.50', taxed(10)),
        line('1', '100', taxed(21)),
        line('3', '5', taxed(4)),
        line('1', '50', taxed(0)),
        line('1', '200', exempt),
        line('1', '20', taxed(21)),
      ],
      withholding: 7,
    });

    expect(breakdown.taxed).toEqual([
      { rate: 21, base: '120.00', taxAmount: '25.20' },
      { rate: 10, base: '21.00', taxAmount: '2.10' },
      { rate: 4, base: '15.00', taxAmount: '0.60' },
      { rate: 0, base: '50.00', taxAmount: '0.00' },
    ]);
    expect(breakdown.exempt).toEqual([{ ground: 'dentistry', base: '1200.00', mention }]);
    expect(breakdown.taxBase).toBe('1406.00');
    expect(breakdown.totalAmount).toBe('1433.90');
    expect(breakdown.withholding).toEqual({ rate: 7, amount: '98.42' });
    expect(breakdown.amountDue).toBe('1335.48');
  });

  it('one exempt base and one mention per exemption ground, in catalogue order', () => {
    const breakdown = computeBreakdown({
      lines: [
        line('1', '300', { kind: 'exempt', ground: 'otherArticle20' }),
        line('1', '1000', exempt),
        line('1', '80', { kind: 'exempt', ground: 'healthcare' }),
        line('1', '200', exempt),
      ],
      withholding: 15,
    });

    expect(breakdown.exempt).toEqual([
      {
        ground: 'healthcare',
        base: '80.00',
        mention:
          'Operación exenta de IVA en virtud del artículo 20.Uno.3º de la Ley 37/1992, del Impuesto sobre el Valor Añadido.',
      },
      { ground: 'dentistry', base: '1200.00', mention },
      {
        ground: 'otherArticle20',
        base: '300.00',
        mention: 'Operación exenta de IVA en virtud del artículo 20 de la Ley 37/1992, del Impuesto sobre el Valor Añadido.',
      },
    ]);
    expect(breakdown.taxBase).toBe('1580.00');
    expect(breakdown.totalAmount).toBe('1580.00');
  });

  it('no withholding', () => {
    const breakdown = computeBreakdown({ lines: [line('1', '100', taxed(21))], withholding: 0 });
    expect(breakdown.withholding).toEqual({ rate: 0, amount: '0.00' });
    expect(breakdown.amountDue).toBe('121.00');
  });

  it('empty invoice', () => {
    expect(computeBreakdown({ lines: [], withholding: 15 })).toEqual({
      lines: [],
      taxed: [],
      exempt: [],
      taxBase: '0.00',
      totalAmount: '0.00',
      withholding: { rate: 15, amount: '0.00' },
      amountDue: '0.00',
    });
  });

  describe('line base: quantity × price × (1 − discount), half-up to 2 decimals', () => {
    it.each([
      ['1', '2500', undefined, '2500.00'],
      ['3', '33.3333', undefined, '100.00'],
      ['1.5', '0.3333', undefined, '0.50'],
      ['1', '0.0049', undefined, '0.00'],
      ['1', '0.0050', undefined, '0.01'],
      ['0.01', '0.0001', undefined, '0.00'],
      ['2', '100', '15', '170.00'],
      ['1', '9.99', '12.5', '8.74'],
      ['1', '10.01', '50', '5.01'],
      ['1', '0.01', '50', '0.01'],
      ['4', '25', '100', '0.00'],
      ['1', '100', '0', '100.00'],
      ['-1', '0.0050', undefined, '-0.01'],
      ['1', '-0.0049', undefined, '0.00'],
      ['-2', '100', '15', '-170.00'],
    ])('%s × %s with %s %% discount → %s', (quantity, unitPrice, discountPercent, base) => {
      const breakdown = computeBreakdown({
        lines: [line(quantity, unitPrice, taxed(0), discountPercent)],
        withholding: 0,
      });
      expect(breakdown.lines).toEqual([{ base }]);
    });
  });

  describe('tax amount: rate × sum of the rate bases, half-up to 2 decimals', () => {
    it.each([
      [['0.50'], 21, '0.11'],
      [['0.25'], 10, '0.03'],
      [['0.24'], 10, '0.02'],
      [['12.50'], 4, '0.50'],
      [['0.12'], 4, '0.00'],
      [['0.13'], 4, '0.01'],
      // Per-line rounding would give 0.01 × 3 = 0.03.
      [['0.05', '0.05', '0.05'], 10, '0.02'],
      [['-0.25'], 10, '-0.03'],
      [['100', '-100'], 21, '0.00'],
    ] as const)('bases %j at %i %% → %s', (prices, rate, taxAmount) => {
      const breakdown = computeBreakdown({
        lines: prices.map((price) => line('1', price, taxed(rate))),
        withholding: 0,
      });
      expect(breakdown.taxed).toEqual([{ rate, base: expect.any(String), taxAmount }]);
    });
  });

  describe('withholding: rate × tax base, half-up to 2 decimals', () => {
    it.each([
      ['33.35', 15, '5.00'],
      ['0.10', 15, '0.02'],
      ['0.07', 7, '0.00'],
      ['0.50', 7, '0.04'],
      ['1000', 7, '70.00'],
      ['-0.10', 15, '-0.02'],
    ] as const)('base %s at %i %% → %s', (price, rate, amount) => {
      const breakdown = computeBreakdown({ lines: [line('1', price, exempt)], withholding: rate });
      expect(breakdown.withholding).toEqual({ rate, amount });
    });
  });

  describe('negative amounts (corrective invoices by differences)', () => {
    it('exempt dental difference', () => {
      expect(computeBreakdown({ lines: [line('-1', '2500', exempt)], withholding: 15 })).toMatchObject({
        exempt: [{ ground: 'dentistry', base: '-2500.00' }],
        totalAmount: '-2500.00',
        withholding: { rate: 15, amount: '-375.00' },
        amountDue: '-2125.00',
      });
    });

    it('rounds symmetrically, so negating every line negates every amount', () => {
      const original: BreakdownInput = {
        lines: [
          line('3', '33.3333', taxed(21)),
          line('1', '0.0050', taxed(10)),
          line('1', '0.25', taxed(10)),
          line('1.5', '0.3333', taxed(4), '12.5'),
          line('1', '33.35', exempt),
        ],
        withholding: 15,
      };
      const negated: BreakdownInput = {
        ...original,
        lines: original.lines.map((l) => ({ ...l, quantity: `-${l.quantity}` })),
      };

      const negate = (amount: string) => (amount.startsWith('-') ? amount.slice(1) : `-${amount}`);
      const before = computeBreakdown(original);
      const after = computeBreakdown(negated);

      expect(after.totalAmount).toBe(negate(before.totalAmount));
      expect(after.withholding.amount).toBe(negate(before.withholding.amount));
      expect(after.amountDue).toBe(negate(before.amountDue));
      expect(after.taxed.map((t) => t.taxAmount)).toEqual(before.taxed.map((t) => negate(t.taxAmount)));
    });

    it('never prints a negative zero', () => {
      const breakdown = computeBreakdown({ lines: [line('-1', '0.0001', taxed(21))], withholding: 15 });
      expect(breakdown).toMatchObject({
        lines: [{ base: '0.00' }],
        taxed: [{ rate: 21, base: '0.00', taxAmount: '0.00' }],
        totalAmount: '0.00',
        withholding: { rate: 15, amount: '0.00' },
        amountDue: '0.00',
      });
    });
  });
});

describe('breakdownInputSchema', () => {
  const valid = { lines: [line('1', '2500', exempt)], withholding: 15 };
  const withLine = (patch: Record<string, unknown>) => ({ ...valid, lines: [{ ...valid.lines[0], ...patch }] });

  it('accepts a valid input', () => {
    expect(breakdownInputSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['quantity with 2 decimals', { quantity: '1.25' }],
    ['negative quantity', { quantity: '-1' }],
    ['price with 4 decimals', { unitPrice: '0.3333' }],
    ['negative price', { unitPrice: '-10.5' }],
    ['discount with 2 decimals', { discountPercent: '12.75' }],
    ['full discount', { discountPercent: '100' }],
    ['21 % VAT', { vat: taxed(21) }],
    ['0 % VAT', { vat: taxed(0) }],
  ])('accepts %s', (_, patch) => {
    expect(breakdownInputSchema.safeParse(withLine(patch)).success).toBe(true);
  });

  it.each([
    ['quantity with 3 decimals', { quantity: '1.255' }],
    ['price with 5 decimals', { unitPrice: '0.33333' }],
    ['numeric quantity', { quantity: 1 }],
    ['quantity with a comma', { quantity: '1,5' }],
    ['empty price', { unitPrice: '' }],
    ['discount over 100 %', { discountPercent: '100.01' }],
    ['negative discount', { discountPercent: '-5' }],
    ['discount with 3 decimals', { discountPercent: '1.125' }],
    ['5 % VAT', { vat: { kind: 'taxed', rate: 5 } }],
    ['unknown exemption ground', { vat: { kind: 'exempt', ground: 'medicina' } }],
  ])('rejects %s', (_, patch) => {
    expect(breakdownInputSchema.safeParse(withLine(patch)).success).toBe(false);
  });

  it.each([19, 2, '15'])('rejects a %j withholding', (withholding) => {
    expect(breakdownInputSchema.safeParse({ ...valid, withholding }).success).toBe(false);
  });
});

describe('sumAmounts', () => {
  it.each([
    [[], '0.00'],
    [['2340.00'], '2340.00'],
    [['0.10', '0.20'], '0.30'],
    [['100.00', '-100.00'], '0.00'],
    [['-0.01', '-0.02'], '-0.03'],
  ])('%j → %s', (amounts, sum) => {
    expect(sumAmounts(amounts)).toBe(sum);
  });
});

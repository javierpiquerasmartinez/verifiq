import { describe, expect, it } from 'vitest';
import { breakdownInputSchema, computeBreakdown, type BreakdownInput, type BreakdownLine } from './amounts.js';

const exempt = { kind: 'exempt', supuesto: 'odontologia' } as const;
const mention =
  'Operación exenta de IVA en virtud del artículo 20.Uno.5º de la Ley 37/1992, del Impuesto sobre el Valor Añadido.';
const taxed = (rate: 21 | 10 | 4 | 0) => ({ kind: 'taxed', rate }) as const;
const line = (quantity: string, unitPrice: string, iva: BreakdownLine['iva'], discountPercent?: string) => ({
  quantity,
  unitPrice,
  iva,
  ...(discountPercent === undefined ? {} : { discountPercent }),
});

describe('computeBreakdown', () => {
  it('exempt dental invoice with 15 % retention', () => {
    expect(computeBreakdown({ lines: [line('1', '2500', exempt)], retencionIrpf: 15 })).toEqual({
      lines: [{ base: '2500.00' }],
      taxed: [],
      exempt: [{ supuesto: 'odontologia', base: '2500.00', mention }],
      baseImponible: '2500.00',
      importeTotal: '2500.00',
      retencionIrpf: { rate: 15, amount: '375.00' },
      totalAPagar: '2125.00',
    });
  });

  it('mixed invoice: bases by rate (highest first), exempt bases and IRPF on the whole base', () => {
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
      retencionIrpf: 7,
    });

    expect(breakdown.taxed).toEqual([
      { rate: 21, base: '120.00', cuota: '25.20' },
      { rate: 10, base: '21.00', cuota: '2.10' },
      { rate: 4, base: '15.00', cuota: '0.60' },
      { rate: 0, base: '50.00', cuota: '0.00' },
    ]);
    expect(breakdown.exempt).toEqual([{ supuesto: 'odontologia', base: '1200.00', mention }]);
    expect(breakdown.baseImponible).toBe('1406.00');
    expect(breakdown.importeTotal).toBe('1433.90');
    expect(breakdown.retencionIrpf).toEqual({ rate: 7, amount: '98.42' });
    expect(breakdown.totalAPagar).toBe('1335.48');
  });

  it('no retention', () => {
    const breakdown = computeBreakdown({ lines: [line('1', '100', taxed(21))], retencionIrpf: 0 });
    expect(breakdown.retencionIrpf).toEqual({ rate: 0, amount: '0.00' });
    expect(breakdown.totalAPagar).toBe('121.00');
  });

  it('empty invoice', () => {
    expect(computeBreakdown({ lines: [], retencionIrpf: 15 })).toEqual({
      lines: [],
      taxed: [],
      exempt: [],
      baseImponible: '0.00',
      importeTotal: '0.00',
      retencionIrpf: { rate: 15, amount: '0.00' },
      totalAPagar: '0.00',
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
        retencionIrpf: 0,
      });
      expect(breakdown.lines).toEqual([{ base }]);
    });
  });

  describe('cuota: rate × sum of the rate bases, half-up to 2 decimals', () => {
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
    ] as const)('bases %j at %i %% → %s', (prices, rate, cuota) => {
      const breakdown = computeBreakdown({
        lines: prices.map((price) => line('1', price, taxed(rate))),
        retencionIrpf: 0,
      });
      expect(breakdown.taxed).toEqual([{ rate, base: expect.any(String), cuota }]);
    });
  });

  describe('Retención de IRPF: rate × base imponible, half-up to 2 decimals', () => {
    it.each([
      ['33.35', 15, '5.00'],
      ['0.10', 15, '0.02'],
      ['0.07', 7, '0.00'],
      ['0.50', 7, '0.04'],
      ['1000', 7, '70.00'],
      ['-0.10', 15, '-0.02'],
    ] as const)('base %s at %i %% → %s', (price, rate, amount) => {
      const breakdown = computeBreakdown({ lines: [line('1', price, exempt)], retencionIrpf: rate });
      expect(breakdown.retencionIrpf).toEqual({ rate, amount });
    });
  });

  describe('negative amounts (rectificativas por diferencias)', () => {
    it('exempt dental difference', () => {
      expect(computeBreakdown({ lines: [line('-1', '2500', exempt)], retencionIrpf: 15 })).toMatchObject({
        exempt: [{ supuesto: 'odontologia', base: '-2500.00' }],
        importeTotal: '-2500.00',
        retencionIrpf: { rate: 15, amount: '-375.00' },
        totalAPagar: '-2125.00',
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
        retencionIrpf: 15,
      };
      const negated: BreakdownInput = {
        ...original,
        lines: original.lines.map((l) => ({ ...l, quantity: `-${l.quantity}` })),
      };

      const negate = (amount: string) => (amount.startsWith('-') ? amount.slice(1) : `-${amount}`);
      const before = computeBreakdown(original);
      const after = computeBreakdown(negated);

      expect(after.importeTotal).toBe(negate(before.importeTotal));
      expect(after.retencionIrpf.amount).toBe(negate(before.retencionIrpf.amount));
      expect(after.totalAPagar).toBe(negate(before.totalAPagar));
      expect(after.taxed.map((t) => t.cuota)).toEqual(before.taxed.map((t) => negate(t.cuota)));
    });

    it('never prints a negative zero', () => {
      const breakdown = computeBreakdown({ lines: [line('-1', '0.0001', taxed(21))], retencionIrpf: 15 });
      expect(breakdown).toMatchObject({
        lines: [{ base: '0.00' }],
        taxed: [{ rate: 21, base: '0.00', cuota: '0.00' }],
        importeTotal: '0.00',
        retencionIrpf: { rate: 15, amount: '0.00' },
        totalAPagar: '0.00',
      });
    });
  });
});

describe('breakdownInputSchema', () => {
  const valid = { lines: [line('1', '2500', exempt)], retencionIrpf: 15 };
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
    ['21 % IVA', { iva: taxed(21) }],
    ['0 % IVA', { iva: taxed(0) }],
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
    ['5 % IVA', { iva: { kind: 'taxed', rate: 5 } }],
    ['unknown Supuesto de exención', { iva: { kind: 'exempt', supuesto: 'medicina' } }],
  ])('rejects %s', (_, patch) => {
    expect(breakdownInputSchema.safeParse(withLine(patch)).success).toBe(false);
  });

  it.each([19, 2, '15'])('rejects a %j retention', (retencionIrpf) => {
    expect(breakdownInputSchema.safeParse({ ...valid, retencionIrpf }).success).toBe(false);
  });
});

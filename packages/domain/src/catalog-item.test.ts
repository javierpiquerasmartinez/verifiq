import { describe, expect, it } from 'vitest';
import { catalogItemDataSchema, draftLineFromCatalogItem, type CatalogItem } from './catalog-item.js';
import { draftLineSchema } from './draft.js';

const cleaning: CatalogItem = {
  id: '6f1c1a52-0a51-4c4b-9a43-0b0f6f3c2a11',
  name: 'Limpieza dental',
  defaultUnitPrice: '45.5',
  defaultVat: { kind: 'exempt', ground: 'dentistry' },
};

describe('catalogItemDataSchema', () => {
  it('takes a name, a default unit price and a default VAT treatment', () => {
    expect(
      catalogItemDataSchema.parse({ name: '  Limpieza dental ', defaultUnitPrice: '45.5', defaultVat: { kind: 'taxed', rate: 21 } }),
    ).toEqual({ name: 'Limpieza dental', defaultUnitPrice: '45.5', defaultVat: { kind: 'taxed', rate: 21 } });
  });

  it.each([
    ['a blank name', { name: '  ' }],
    ['a name longer than a line concept', { name: 'x'.repeat(501) }],
    ['a negative price', { defaultUnitPrice: '-1' }],
    ['a price with more than 4 decimals', { defaultUnitPrice: '1.23456' }],
    ['an exempt VAT without exemption ground', { defaultVat: { kind: 'exempt' } }],
    ['a VAT rate that does not exist', { defaultVat: { kind: 'taxed', rate: 7 } }],
  ])('refuses %s', (_, change) => {
    const data = { name: 'Limpieza dental', defaultUnitPrice: '45.5', defaultVat: { kind: 'taxed', rate: 21 }, ...change };
    expect(catalogItemDataSchema.safeParse(data).success).toBe(false);
  });
});

describe('draftLineFromCatalogItem', () => {
  it('copies the name, price and VAT into a line of one unit', () => {
    const line = draftLineFromCatalogItem(cleaning);

    expect(line).toEqual({
      concept: 'Limpieza dental',
      quantity: '1',
      unitPrice: '45.5',
      vat: { kind: 'exempt', ground: 'dentistry' },
    });
    expect(draftLineSchema.parse(line)).toEqual(line);
  });

  it('copies the values: changing the catalog item afterwards leaves the line as it was', () => {
    const item: CatalogItem = { ...cleaning, defaultVat: { ...cleaning.defaultVat } };
    const line = draftLineFromCatalogItem(item);

    item.name = 'Limpieza con ultrasonidos';
    item.defaultUnitPrice = '60';

    expect(line).toEqual(draftLineFromCatalogItem(cleaning));
  });

  it('never shares the VAT object with the catalog item', () => {
    const item: CatalogItem = { ...cleaning, defaultVat: { ...cleaning.defaultVat } };
    const line = draftLineFromCatalogItem(item);

    (item.defaultVat as { ground: string }).ground = 'other';

    expect(line.vat).toEqual({ kind: 'exempt', ground: 'dentistry' });
  });
});

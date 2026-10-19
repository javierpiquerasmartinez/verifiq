import { z } from 'zod';
import { vatTreatmentSchema } from './amounts.js';
import { draftLineSchema, type DraftLine } from './draft.js';

// A CatalogItem ("Artículo") is a reusable concept of the issuer. A line copies its
// values and never refers to it, so editing or deleting it never changes a draft or an invoice.

/** Body of POST /catalog-items and PUT /catalog-items/:id. */
export const catalogItemDataSchema = z.object({
  /** Becomes the concept of the line. */
  name: draftLineSchema.shape.concept.min(1),
  defaultUnitPrice: draftLineSchema.shape.unitPrice,
  /** A VAT rate, or exempt under an exemption ground. */
  defaultVat: vatTreatmentSchema,
});

export type CatalogItemData = z.infer<typeof catalogItemDataSchema>;
export type CatalogItemDataInput = z.input<typeof catalogItemDataSchema>;

export const catalogItemSchema = catalogItemDataSchema.extend({ id: z.uuid() });

export type CatalogItem = z.infer<typeof catalogItemSchema>;

/** A line of one unit with a copy of the item's values. */
export function draftLineFromCatalogItem(item: CatalogItem): DraftLine {
  return { concept: item.name, quantity: '1', unitPrice: item.defaultUnitPrice, vat: { ...item.defaultVat } };
}

/** Stable error codes of the catalog item endpoints, so the web can show a clear message. */
export const CatalogItemErrorCode = {
  NotFound: 'CATALOG_ITEM_NOT_FOUND',
} as const;

export type CatalogItemErrorCode = (typeof CatalogItemErrorCode)[keyof typeof CatalogItemErrorCode];

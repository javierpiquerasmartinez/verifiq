import { Inject, Injectable } from '@nestjs/common';
import type { CatalogItem, CatalogItemData, VatTreatment } from '@verifiq/domain';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { catalogItems } from '../database/schema.js';

// Every method takes the issuer id resolved by the isolation layer (issuer-context.ts) and filters by it.

export class CatalogItemNotFoundError extends Error {}

/**
 * The issuer's catalog items ("Artículos"). Draft lines copy an item's values and never refer to it,
 * so items are edited and deleted freely.
 */
@Injectable()
export class CatalogItemsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Sorted by name, ignoring case. */
  list(issuerId: string): Promise<CatalogItem[]> {
    return this.select(eq(catalogItems.issuerId, issuerId)).orderBy(
      asc(sql`lower(${catalogItems.name})`),
      asc(catalogItems.createdAt),
    );
  }

  async find(issuerId: string, id: string): Promise<CatalogItem> {
    const [item] = await this.select(this.owned(issuerId, id));
    if (!item) throw new CatalogItemNotFoundError();
    return item;
  }

  async create(issuerId: string, data: CatalogItemData): Promise<CatalogItem> {
    const [created] = await this.db
      .insert(catalogItems)
      .values({ ...data, issuerId })
      .returning({ id: catalogItems.id });
    return this.find(issuerId, created!.id);
  }

  async update(issuerId: string, id: string, data: CatalogItemData): Promise<CatalogItem> {
    const updated = await this.db
      .update(catalogItems)
      .set({ ...data, updatedAt: new Date() })
      .where(this.owned(issuerId, id))
      .returning({ id: catalogItems.id });
    if (updated.length === 0) throw new CatalogItemNotFoundError();
    return this.find(issuerId, id);
  }

  async delete(issuerId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(catalogItems)
      .where(this.owned(issuerId, id))
      .returning({ id: catalogItems.id });
    if (deleted.length === 0) throw new CatalogItemNotFoundError();
  }

  private owned(issuerId: string, id: string): SQL {
    return and(eq(catalogItems.issuerId, issuerId), eq(catalogItems.id, id))!;
  }

  private select(where: SQL) {
    return this.db
      .select({
        id: catalogItems.id,
        name: catalogItems.name,
        defaultUnitPrice: catalogItems.defaultUnitPrice,
        // Written only from a parsed CatalogItemData.
        defaultVat: sql<VatTreatment>`${catalogItems.defaultVat}`,
      })
      .from(catalogItems)
      .where(where);
  }
}

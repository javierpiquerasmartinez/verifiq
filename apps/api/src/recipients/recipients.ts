import { Inject, Injectable } from '@nestjs/common';
import type { CensusStatus, Recipient, RecipientData, RecipientListStatus } from '@verifiq/domain';
import { and, asc, eq, exists, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { invoices, issuers, recipients } from '../database/schema.js';
import { escapeLike, fold, foldColumn } from '../database/search.js';
import { VERIFACTU_CONNECTOR, type IssuerRef, type VerifactuConnector } from '../verifactu/connector.js';

// Every method takes the issuer id resolved by the isolation layer (issuer-context.ts) and filters by it.

export class RecipientNotFoundError extends Error {}

export class TaxIdNotInCensusError extends Error {}

/** Deregistered or revoked. */
export class TaxIdInactiveError extends Error {}

export class CensusNameMismatchError extends Error {
  constructor(readonly censusName: string | undefined) {
    super('The census has the tax ID under another name');
  }
}

/** The connector refused the query (a permanent error, unlike a census that does not answer). */
export class CensusRejectedError extends Error {}

export class RecipientHasInvoicesError extends Error {}

const hasInvoices = (db: Database) =>
  exists(db.select({ one: sql`1` }).from(invoices).where(eq(invoices.recipientId, recipients.id)));

/**
 * The issuer's Recipients. Each tax ID is checked against the AEAT census when it is saved, so
 * issuance does not fail later on a wrong one; the result is kept on the recipient.
 */
@Injectable()
export class RecipientsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(VERIFACTU_CONNECTOR) private readonly connector: VerifactuConnector,
  ) {}

  /** Sorted by name. `query` matches the name, tax ID or municipality. */
  async list(issuerId: string, { query, status }: { query: string; status: RecipientListStatus }): Promise<Recipient[]> {
    const filters = [
      eq(recipients.issuerId, issuerId),
      status === 'archived' ? isNotNull(recipients.archivedAt) : isNull(recipients.archivedAt),
    ];
    const text = query.trim();
    if (text) {
      const pattern = `%${escapeLike(fold(text))}%`;
      filters.push(
        or(
          sql`${foldColumn(recipients.name)} LIKE ${pattern}`,
          sql`${foldColumn(recipients.municipality)} LIKE ${pattern}`,
          ilike(recipients.taxId, `%${escapeLike(text.replace(/[\s.-]/g, ''))}%`),
        )!,
      );
    }
    return this.select(and(...filters)!).orderBy(asc(recipients.name), asc(recipients.createdAt));
  }

  async find(issuerId: string, id: string): Promise<Recipient> {
    const [recipient] = await this.select(this.owned(issuerId, id));
    if (!recipient) throw new RecipientNotFoundError();
    return recipient;
  }

  async create(issuerId: string, data: RecipientData): Promise<Recipient> {
    const census = await this.checkCensus(issuerId, data);
    const [created] = await this.db
      .insert(recipients)
      .values({ ...data, ...census, issuerId })
      .returning({ id: recipients.id });
    return this.find(issuerId, created!.id);
  }

  /** Issued invoices keep their own copy of the recipient: editing it never changes them. */
  async update(issuerId: string, id: string, data: RecipientData): Promise<Recipient> {
    const current = await this.find(issuerId, id);
    const recheck =
      current.censusStatus !== 'identified' || current.taxId !== data.taxId || current.name !== data.name;
    const census = recheck ? await this.checkCensus(issuerId, data) : {};
    await this.db
      .update(recipients)
      .set({ ...data, ...census, updatedAt: new Date() })
      .where(this.owned(issuerId, id));
    return this.find(issuerId, id);
  }

  /** Only a recipient that was never invoiced can be deleted; the others are archived. */
  async delete(issuerId: string, id: string): Promise<void> {
    try {
      const deleted = await this.db
        .delete(recipients)
        .where(this.owned(issuerId, id))
        .returning({ id: recipients.id });
      if (deleted.length === 0) throw new RecipientNotFoundError();
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new RecipientHasInvoicesError();
      throw error;
    }
  }

  async setArchived(issuerId: string, id: string, archived: boolean): Promise<Recipient> {
    const changed = await this.db
      .update(recipients)
      .set({ archivedAt: archived ? sql`coalesce(${recipients.archivedAt}, now())` : null, updatedAt: new Date() })
      .where(this.owned(issuerId, id))
      .returning({ id: recipients.id });
    if (changed.length === 0) throw new RecipientNotFoundError();
    return this.find(issuerId, id);
  }

  private owned(issuerId: string, id: string): SQL {
    return and(eq(recipients.issuerId, issuerId), eq(recipients.id, id))!;
  }

  private select(where: SQL) {
    return this.db
      .select({
        id: recipients.id,
        name: recipients.name,
        taxId: recipients.taxId,
        address: recipients.address,
        postalCode: recipients.postalCode,
        municipality: recipients.municipality,
        province: recipients.province,
        censusStatus: sql<CensusStatus>`${recipients.censusStatus}`,
        archived: sql<boolean>`${recipients.archivedAt} IS NOT NULL`,
        hasInvoices: sql<boolean>`${hasInvoices(this.db)}`,
      })
      .from(recipients)
      .where(where);
  }

  /**
   * Asks the census for the tax ID under the recipient's name. A census that does not answer
   * leaves the recipient `unchecked` rather than blocking the user; the next save asks again.
   */
  private async checkCensus(
    issuerId: string,
    { taxId, name }: RecipientData,
  ): Promise<{ censusStatus: CensusStatus; censusCheckedAt: Date | null }> {
    const result = await this.connector.validateTaxId(await this.issuerRef(issuerId), { taxId, name });
    if (result.outcome === 'transient') return { censusStatus: 'unchecked', censusCheckedAt: null };
    if (result.outcome === 'rejected') throw new CensusRejectedError(`${result.code}: ${result.message}`);
    switch (result.value.result) {
      case 'identified':
        return { censusStatus: 'identified', censusCheckedAt: new Date() };
      case 'name-mismatch':
        throw new CensusNameMismatchError(result.value.name);
      case 'not-identified':
        throw new TaxIdNotInCensusError();
      case 'deregistered':
      case 'revoked':
        throw new TaxIdInactiveError();
    }
  }

  private async issuerRef(issuerId: string): Promise<IssuerRef> {
    const [issuer] = await this.db.select({ taxId: issuers.taxId }).from(issuers).where(eq(issuers.id, issuerId));
    if (!issuer) throw new Error(`Issuer ${issuerId} not found`);
    return { issuerId, taxId: issuer.taxId };
  }
}

function isForeignKeyViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } }).cause ?? error;
  return (cause as { code?: string }).code === '23503';
}

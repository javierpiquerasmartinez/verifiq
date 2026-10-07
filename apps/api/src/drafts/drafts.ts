import { Inject, Injectable } from '@nestjs/common';
import {
  computeBreakdown,
  findDraftProblems,
  operationDate,
  todayInSpain,
  type CensusStatus,
  type Draft,
  type DraftData,
  type DraftLine,
  type DraftRecipient,
  type DraftSummary,
  type WithholdingRate,
} from '@verifiq/domain';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { DATABASE, type Database, type Queryable } from '../database/database.module.js';
import { drafts, recipients } from '../database/schema.js';

// Every method takes the issuer id resolved by the isolation layer (issuer-context.ts) and filters by it.

export class DraftNotFoundError extends Error {}

export class DraftRecipientNotFoundError extends Error {}

/**
 * The issuer's Drafts: invoices in preparation, without number (ADR 0002), saved half done and
 * deleted freely. Their amounts are always computed here with the domain, never taken from the web.
 */
@Injectable()
export class DraftsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Most recently edited first. */
  async list(issuerId: string): Promise<DraftSummary[]> {
    const rows = await this.db
      .select({
        id: drafts.id,
        recipientName: recipients.name,
        operationDescription: drafts.operationDescription,
        lines: drafts.lines,
        withholding: drafts.withholding,
        updatedAt: drafts.updatedAt,
      })
      .from(drafts)
      .leftJoin(recipients, eq(recipients.id, drafts.recipientId))
      .where(eq(drafts.issuerId, issuerId))
      .orderBy(desc(drafts.updatedAt), desc(drafts.createdAt));
    return rows.map((row) => {
      const { totalAmount, amountDue } = computeBreakdown(amountsOf(row));
      return {
        id: row.id,
        recipientName: row.recipientName,
        operationDescription: row.operationDescription,
        totalAmount,
        amountDue,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  /**
   * With `lock`, inside the transaction `db`, the draft stays locked until it ends: no one else can
   * edit, delete or issue it meanwhile.
   */
  async find(issuerId: string, id: string, { db = this.db, lock = false }: { db?: Queryable; lock?: boolean } = {}): Promise<Draft> {
    const query = db
      .select({
        draft: drafts,
        recipient: {
          id: recipients.id,
          name: recipients.name,
          taxId: recipients.taxId,
          address: recipients.address,
          postalCode: recipients.postalCode,
          municipality: recipients.municipality,
          province: recipients.province,
          censusStatus: recipients.censusStatus,
          archivedAt: recipients.archivedAt,
        },
      })
      .from(drafts)
      .leftJoin(recipients, eq(recipients.id, drafts.recipientId))
      .where(this.owned(issuerId, id));
    const [row] = await (lock ? query.for('update', { of: drafts }) : query);
    if (!row) throw new DraftNotFoundError();

    const { draft } = row;
    const { lines, withholding } = amountsOf(draft);
    const billingPeriod =
      draft.billingPeriodStart && draft.billingPeriodEnd
        ? { start: draft.billingPeriodStart, end: draft.billingPeriodEnd }
        : null;
    const recipient: DraftRecipient | null = row.recipient && {
      id: row.recipient.id,
      name: row.recipient.name,
      taxId: row.recipient.taxId,
      address: row.recipient.address,
      postalCode: row.recipient.postalCode,
      municipality: row.recipient.municipality,
      province: row.recipient.province,
      censusStatus: row.recipient.censusStatus as CensusStatus,
      archived: row.recipient.archivedAt !== null,
    };
    const issueDate = todayInSpain();
    return {
      id: draft.id,
      recipient,
      billingPeriod,
      operationDate: operationDate(billingPeriod),
      operationDescription: draft.operationDescription,
      lines,
      withholding,
      issueDate,
      breakdown: computeBreakdown({ lines, withholding }),
      problems: findDraftProblems(
        { recipient, billingPeriod, operationDescription: draft.operationDescription, lines },
        issueDate,
      ),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  async create(issuerId: string, data: DraftData): Promise<Draft> {
    await this.checkRecipient(issuerId, data.recipientId);
    const [created] = await this.db
      .insert(drafts)
      .values({ ...columns(data), issuerId })
      .returning({ id: drafts.id });
    return this.find(issuerId, created!.id);
  }

  async update(issuerId: string, id: string, data: DraftData): Promise<Draft> {
    await this.checkRecipient(issuerId, data.recipientId);
    const updated = await this.db
      .update(drafts)
      .set({ ...columns(data), updatedAt: new Date() })
      .where(this.owned(issuerId, id))
      .returning({ id: drafts.id });
    if (updated.length === 0) throw new DraftNotFoundError();
    return this.find(issuerId, id);
  }

  async delete(issuerId: string, id: string, { db = this.db }: { db?: Queryable } = {}): Promise<void> {
    const deleted = await db.delete(drafts).where(this.owned(issuerId, id)).returning({ id: drafts.id });
    if (deleted.length === 0) throw new DraftNotFoundError();
  }

  private owned(issuerId: string, id: string): SQL {
    return and(eq(drafts.issuerId, issuerId), eq(drafts.id, id))!;
  }

  /** The recipient must be one of the issuer's: another issuer's is as good as none. */
  private async checkRecipient(issuerId: string, recipientId: string | null): Promise<void> {
    if (!recipientId) return;
    const [recipient] = await this.db
      .select({ id: recipients.id })
      .from(recipients)
      .where(and(eq(recipients.issuerId, issuerId), eq(recipients.id, recipientId)));
    if (!recipient) throw new DraftRecipientNotFoundError();
  }
}

/** What the amounts are computed from, typed back from its columns (written only from a parsed DraftData). */
function amountsOf(row: { lines: unknown; withholding: number }): { lines: DraftLine[]; withholding: WithholdingRate } {
  return { lines: row.lines as DraftLine[], withholding: row.withholding as WithholdingRate };
}

function columns(data: DraftData) {
  return {
    recipientId: data.recipientId,
    billingPeriodStart: data.billingPeriod?.start ?? null,
    billingPeriodEnd: data.billingPeriod?.end ?? null,
    operationDescription: data.operationDescription,
    withholding: data.withholding,
    lines: data.lines,
  };
}

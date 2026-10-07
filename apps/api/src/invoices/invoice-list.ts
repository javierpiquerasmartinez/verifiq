import { Inject, Injectable } from '@nestjs/common';
import {
  AWAITING_VERDICT_STATUSES,
  INCIDENT_RECORD_STATUSES,
  INVOICE_LIST_FILTERS,
  explainRecordRejection,
  invoiceNumberIn,
  isRecordUnconfirmed,
  parseDecimalInput,
  todayInSpain,
  unconfirmedBefore,
  type InvoiceIncident,
  type InvoiceList,
  type InvoiceListFilter,
  type InvoiceListItem,
  type InvoiceRecordStatus,
  type InvoiceSnapshot,
  type InvoiceStatus,
} from '@verifiq/domain';
import { and, asc, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { DATABASE, type Database } from '../database/database.module.js';
import { invoiceRecords, invoices } from '../database/schema.js';
import { escapeLike, fold, foldColumn } from '../database/search.js';
import { DraftsService } from '../drafts/drafts.js';

// Every method takes the issuer id resolved by the isolation layer (issuer-context.ts) and filters by it.

/** Where a page starts: right after the item listed at `at` (ms) with `id`, newest first. */
type Cursor = { at: number; id: string };

const cursorSchema = z.object({ at: z.number().int().nonnegative(), id: z.uuid() });

export const encodeCursor = (cursor: Cursor) => Buffer.from(JSON.stringify(cursor)).toString('base64url');

/** The cursor the list gave, or null if it is not one. */
export function decodeCursor(text: string): Cursor | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(text, 'base64url').toString()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Newest first; the id breaks ties, as uuids compare the same in Postgres and here. */
const newestFirst = (a: Cursor, b: Cursor) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
const isAfter = (item: Cursor, cursor: Cursor | null) => cursor === null || newestFirst(cursor, item) < 0;


/** What an amount typed in the search reads as, with 2 decimals ("3.366" → "3366.00"), or null. */
function searchedAmount(text: string): string | null {
  const amount = parseDecimalInput(text.replace(/[€\s]/g, '').replace(/^[-−]/, ''), 2);
  if (amount === null) return null;
  const [units, decimals = ''] = amount.split('.');
  return `${units}.${decimals.padEnd(2, '0')}`;
}

/** The amount without its sign: a search for an amount finds corrective invoices too. */
const unsigned = (amount: string) => amount.replace(/^-/, '');

/** What the list and the incidents both show of an invoice and its latest record. */
function invoiceAndRecord(
  row: { id: string; series: string; number: number; snapshot: unknown; recordStatus: string; recordCreatedAt: Date },
  now: Date,
) {
  const recordStatus = row.recordStatus as InvoiceRecordStatus;
  return {
    id: row.id,
    number: invoiceNumberIn(row.series, row.number),
    recipientName: (row.snapshot as InvoiceSnapshot).recipient.name,
    recordStatus,
    unconfirmed: isRecordUnconfirmed(recordStatus, row.recordCreatedAt, now),
  };
}

/** An item of the list, with when it is sorted by (ms). */
type Listed<T extends InvoiceListItem = InvoiceListItem> = { at: number; item: T };

const keyOf = ({ at, item }: Listed): Cursor => ({ at, id: item.id });

/**
 * The invoice list: drafts and issued invoices together, newest first (a draft by when it was last
 * edited, an invoice by its Issuance), paged with a cursor. Invoices are searched, filtered and paged
 * in the database; drafts, which are few and whose amounts only the domain computes, here.
 */
@Injectable()
export class InvoiceListService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly drafts: DraftsService,
  ) {}

  async list(
    issuerId: string,
    { q, filter, cursor, limit }: { q: string; filter: InvoiceListFilter; cursor: Cursor | null; limit: number },
  ): Promise<InvoiceList> {
    const now = new Date();
    const search = q.trim();
    const amount = search ? searchedAmount(search) : null;

    const drafts = (await this.drafts.list(issuerId))
      .map(
        (draft): Listed<Extract<InvoiceListItem, { kind: 'draft' }>> => ({
          at: Date.parse(draft.updatedAt),
          item: {
            kind: 'draft',
            id: draft.id,
            date: todayInSpain(new Date(draft.updatedAt)),
            recipientName: draft.recipientName,
            corrects: draft.corrects,
            totalAmount: draft.totalAmount,
            amountDue: draft.amountDue,
          },
        }),
      )
      .filter(
        ({ item }) =>
          !search ||
          (item.recipientName !== null && fold(item.recipientName).includes(fold(search))) ||
          (amount !== null && [item.totalAmount, item.amountDue].some((value) => unsigned(value) === amount)),
      );

    const { record, category, sortedAt } = this.latestRecords(issuerId, now);
    const matching = and(eq(invoices.issuerId, issuerId), search ? this.matches(search, amount) : undefined);
    const counted = await this.db
      .select({ category, count: sql<number>`count(*)::int` })
      .from(invoices)
      .innerJoin(record, eq(record.invoiceId, invoices.id))
      .where(matching)
      // By position: the CASE repeated would carry its own parameters, which Postgres cannot match.
      .groupBy(sql`1`);

    const counts = Object.fromEntries(INVOICE_LIST_FILTERS.map((name) => [name, 0])) as Record<InvoiceListFilter, number>;
    for (const row of counted) counts[row.category] = row.count;
    counts.drafts = drafts.length;
    counts.all = counted.reduce((sum, row) => sum + row.count, drafts.length);

    const listedInvoices: Listed[] = [];
    if (filter !== 'drafts') {
      const rows = await this.db
        .select({
          id: invoices.id,
          series: invoices.series,
          number: invoices.number,
          issueDate: invoices.issueDate,
          status: invoices.status,
          snapshot: invoices.snapshot,
          recordStatus: record.status,
          recordCreatedAt: record.createdAt,
          at: sortedAt,
        })
        .from(invoices)
        .innerJoin(record, eq(record.invoiceId, invoices.id))
        .where(
          and(
            matching,
            filter === 'all' ? undefined : eq(category, filter),
            cursor ? sql`(${sortedAt}, ${invoices.id}) < (${cursor.at}::bigint, ${cursor.id}::uuid)` : undefined,
          ),
        )
        .orderBy(desc(sortedAt), desc(invoices.id))
        .limit(limit + 1);
      for (const row of rows) {
        const { breakdown, correction } = row.snapshot as InvoiceSnapshot;
        listedInvoices.push({
          at: row.at,
          item: {
            kind: 'invoice',
            ...invoiceAndRecord(row, now),
            // Copies issued before corrective invoices existed have no correction.
            corrects: correction?.invoice.number ?? null,
            date: row.issueDate,
            totalAmount: breakdown.totalAmount,
            amountDue: breakdown.amountDue,
            status: row.status as InvoiceStatus,
          },
        });
      }
    }

    const listedDrafts =
      filter === 'all' || filter === 'drafts' ? drafts.filter((draft) => isAfter(keyOf(draft), cursor)) : [];
    const merged = [...listedDrafts, ...listedInvoices].sort((a, b) => newestFirst(keyOf(a), keyOf(b)));
    const page = merged.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(({ item }) => item),
      nextCursor: merged.length > limit && last ? encodeCursor(keyOf(last)) : null,
      counts,
    };
  }

  /** Invoices whose record needs the user, the longest waiting first. */
  async incidents(issuerId: string): Promise<InvoiceIncident[]> {
    const now = new Date();
    const { record, category } = this.latestRecords(issuerId, now);
    const rows = await this.db
      .select({
        id: invoices.id,
        series: invoices.series,
        number: invoices.number,
        snapshot: invoices.snapshot,
        recordStatus: record.status,
        recordCreatedAt: record.createdAt,
        rejectionCode: record.rejectionCode,
        rejectionMessage: record.rejectionMessage,
        aeatErrorMessage: record.aeatErrorMessage,
      })
      .from(invoices)
      .innerJoin(record, eq(record.invoiceId, invoices.id))
      .where(and(eq(invoices.issuerId, issuerId), eq(category, 'incidents')))
      .orderBy(asc(record.createdAt), asc(invoices.id));
    return rows.map((row) => ({
      ...invoiceAndRecord(row, now),
      message:
        row.recordStatus === 'blocked'
          ? explainRecordRejection({ code: row.rejectionCode ?? '', message: row.rejectionMessage ?? '' })
          : (row.aeatErrorMessage ?? null),
    }));
  }

  /**
   * Each invoice's latest record, the one filter it falls under (see INVOICE_LIST_FILTERS) and the
   * instant it is sorted by: its Issuance, in epoch milliseconds so a cursor holds it exactly.
   */
  private latestRecords(issuerId: string, now: Date) {
    const record = this.db
      .selectDistinctOn([invoiceRecords.invoiceId], {
        invoiceId: invoiceRecords.invoiceId,
        status: invoiceRecords.status,
        createdAt: invoiceRecords.createdAt,
        rejectionCode: invoiceRecords.rejectionCode,
        rejectionMessage: invoiceRecords.rejectionMessage,
        aeatErrorMessage: invoiceRecords.aeatErrorMessage,
      })
      .from(invoiceRecords)
      .where(eq(invoiceRecords.issuerId, issuerId))
      .orderBy(invoiceRecords.invoiceId, desc(invoiceRecords.createdAt))
      .as('record');
    // The same rules as INVOICE_LIST_FILTERS and isRecordUnconfirmed, in SQL so the database can filter and count.
    const awaiting = inArray(record.status, [...AWAITING_VERDICT_STATUSES]);
    const category = sql<Exclude<InvoiceListFilter, 'all' | 'drafts'>>`CASE
      WHEN ${invoices.status} = 'voided' AND ${record.status} NOT IN ('blocked', 'rejected') THEN 'voided'
      WHEN ${invoices.status} = 'rectified' THEN 'rectified'
      WHEN ${inArray(record.status, [...INCIDENT_RECORD_STATUSES])} OR (${awaiting} AND ${record.createdAt} <= ${unconfirmedBefore(now).toISOString()}::timestamptz) THEN 'incidents'
      WHEN ${awaiting} THEN 'pending'
      ELSE 'accepted'
    END`;
    const sortedAt = sql`(extract(epoch from date_trunc('milliseconds', ${invoices.createdAt})) * 1000)::bigint`.mapWith(Number);
    return { record, category, sortedAt };
  }

  /** The invoice's number, its recipient's name (as issued) or one of its amounts matches the search. */
  private matches(search: string, amount: string | null): SQL {
    const pattern = `%${escapeLike(fold(search))}%`;
    // As serialNumber pads it: lpad alone would cut numbers past 9999.
    const number = sql`${invoices.series} || lpad(${invoices.number}::text, greatest(4, length(${invoices.number}::text)), '0')`;
    const conditions = [
      sql`${foldColumn(number)} LIKE ${pattern}`,
      sql`${foldColumn(sql`${invoices.snapshot} -> 'recipient' ->> 'name'`)} LIKE ${pattern}`,
    ];
    if (amount !== null) {
      for (const field of ['totalAmount', 'amountDue']) {
        conditions.push(sql`abs((${invoices.snapshot} -> 'breakdown' ->> ${field})::numeric) = ${amount}::numeric`);
      }
    }
    return or(...conditions)!;
  }
}

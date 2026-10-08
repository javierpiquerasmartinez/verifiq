import {
  INVITATION_LIST_FILTERS,
  type InvitationList,
  type InvitationListFilter,
  type InvitationListSort,
  type InvitationStatus,
  type OperatorInvitation,
  type SortOrder,
} from '@verifiq/domain';
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Database } from '../database/database.module.js';
import { invitations, issuerMemberships, issuers } from '../database/schema.js';
import { escapeLike, fold, foldColumn } from '../database/search.js';

// The invitations as the operator sees them, with their status worked out here, in SQL, so the list can filter and count by it.

/** Accepted, revoked, or still pending until it expires. */
const statusAt = (now: Date) => sql<InvitationStatus>`CASE
  WHEN ${invitations.acceptedAt} IS NOT NULL THEN 'accepted'
  WHEN ${invitations.revokedAt} IS NOT NULL THEN 'revoked'
  WHEN ${invitations.expiresAt} <= ${now.toISOString()}::timestamptz THEN 'expired'
  ELSE 'pending'
END`;

/** The issuer each user onboarded: its first one (the MVP gives each user exactly one). */
function firstIssuers(db: Database) {
  return db
    .selectDistinctOn([issuerMemberships.userId], {
      userId: issuerMemberships.userId,
      id: issuers.id,
      name: issuers.name,
      taxId: issuers.taxId,
    })
    .from(issuerMemberships)
    .innerJoin(issuers, eq(issuers.id, issuerMemberships.issuerId))
    .orderBy(issuerMemberships.userId, issuerMemberships.createdAt)
    .as('issuer');
}

/** The invitations matching `where`, with their status and issuer. */
function selectInvitations(db: Database, now: Date) {
  const issuer = firstIssuers(db);
  const status = statusAt(now);
  const query = (where: SQL | undefined) =>
    db
      .select({
        id: invitations.id,
        email: invitations.email,
        status,
        createdAt: invitations.createdAt,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        issuerId: issuer.id,
        issuerName: issuer.name,
        issuerTaxId: issuer.taxId,
      })
      .from(invitations)
      .leftJoin(issuer, eq(issuer.userId, invitations.userId))
      .where(where)
      .$dynamic();
  return { query, status };
}

/** An invitation as the query reads it, before it is shaped for the operator. */
type Listed = Awaited<ReturnType<ReturnType<typeof selectInvitations>['query']>>[number];

function toOperatorInvitation(row: Listed): OperatorInvitation {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    issuer: row.issuerId === null ? null : { id: row.issuerId, name: row.issuerName!, taxId: row.issuerTaxId! },
  };
}

/** A user's invitation, or null when there is no such one. */
export async function findOperatorInvitation(db: Database, id: string): Promise<OperatorInvitation | null> {
  const [row] = await selectInvitations(db, new Date()).query(and(eq(invitations.id, id), eq(invitations.role, 'user')));
  return row ? toOperatorInvitation(row) : null;
}

/** In epoch milliseconds, so a cursor holds it exactly. */
const milliseconds = (column: AnyPgColumn) =>
  sql<number>`(extract(epoch from date_trunc('milliseconds', ${column})) * 1000)::bigint`.mapWith(Number);

/**
 * What each sort orders by: the key in SQL, the same key read from a listed invitation (a Date holds
 * milliseconds, as the SQL key truncates to), and what that key looks like in a cursor.
 */
const SORT_KEYS = {
  sent: {
    sql: () => milliseconds(invitations.createdAt),
    of: (row: Listed) => row.createdAt.getTime(),
    schema: z.number().int().nonnegative(),
  },
  expires: {
    sql: () => milliseconds(invitations.expiresAt),
    of: (row: Listed) => row.expiresAt.getTime(),
    schema: z.number().int().nonnegative(),
  },
  email: {
    sql: () => sql<string>`${invitations.email}`,
    of: (row: Listed) => row.email,
    schema: z.string(),
  },
} satisfies Record<
  InvitationListSort,
  { sql: () => SQL; of: (row: Listed) => number | string; schema: z.ZodType<number | string> }
>;

/** Where a page starts: right after the invitation with `id`, whose sort key was `key`. */
export type InvitationCursor = { key: number | string; id: string };

const encodeCursor = (cursor: InvitationCursor) => Buffer.from(JSON.stringify(cursor)).toString('base64url');

/** The cursor the list gave under `sort`, or null if it is not one. */
export function decodeInvitationCursor(text: string, sort: InvitationListSort): InvitationCursor | null {
  try {
    const parsed = z
      .object({ key: SORT_KEYS[sort].schema, id: z.uuid() })
      .safeParse(JSON.parse(Buffer.from(text, 'base64url').toString()));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The users' invitations (the operator's own, from the script, are left out) matching `q` by email,
 * under `status`, sorted, a page at a time; the id breaks ties in the same order.
 */
export async function listInvitations(
  db: Database,
  {
    q,
    status: filter,
    sort,
    order,
    cursor,
    limit,
  }: {
    q: string;
    status: InvitationListFilter;
    sort: InvitationListSort;
    order: SortOrder;
    cursor: InvitationCursor | null;
    limit: number;
  },
): Promise<InvitationList> {
  const { query, status } = selectInvitations(db, new Date());
  const search = q.trim();
  const ofUsers = eq(invitations.role, 'user');
  const matching = search ? sql`${foldColumn(invitations.email)} LIKE ${`%${escapeLike(fold(search))}%`}` : undefined;

  const counted = await db
    .select({ status, count: sql<number>`count(*)::int` })
    .from(invitations)
    .where(and(ofUsers, matching))
    // By position: the CASE repeated would carry its own parameters, which Postgres cannot match.
    .groupBy(sql`1`);
  const counts = Object.fromEntries(INVITATION_LIST_FILTERS.map((name) => [name, 0])) as InvitationList['counts'];
  for (const row of counted) counts[row.status] = row.count;
  counts.all = counted.reduce((sum, row) => sum + row.count, 0);

  const key = SORT_KEYS[sort].sql();
  const direction = order === 'asc' ? asc : desc;
  const after = cursor
    ? sql`(${key}, ${invitations.id}) ${sql.raw(order === 'asc' ? '>' : '<')} (${cursor.key}, ${cursor.id}::uuid)`
    : undefined;
  const rows = await query(and(ofUsers, matching, filter === 'all' ? undefined : eq(status, filter), after))
    .orderBy(direction(key), direction(invitations.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(toOperatorInvitation),
    nextCursor: rows.length > limit && last ? encodeCursor({ key: SORT_KEYS[sort].of(last), id: last.id }) : null,
    counts,
  };
}

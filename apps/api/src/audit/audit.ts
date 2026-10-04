import { asc, eq } from 'drizzle-orm';
import type { Queryable } from '../database/database.module.js';
import { auditEvents } from '../database/schema.js';

/** Every action with fiscal effect. */
export type AuditAction =
  | 'invoice-issued'
  | 'invoice-record-submitted'
  | 'invoice-record-blocked'
  | 'invoice-pdf-generated';

export type AuditEvent = Omit<typeof auditEvents.$inferSelect, 'action'> & { action: AuditAction };

export interface NewAuditEvent {
  issuerId: string;
  /** Null when the system acted. */
  actorUserId: string | null;
  action: AuditAction;
  subjectType: 'invoice';
  subjectId: string;
  /** What happened, enough to prove it without the rest of the database. */
  details: Record<string, unknown>;
}

/** Appends an event to the audit log, as part of the transaction that does what it records. Rows never change. */
export async function recordAuditEvent(db: Queryable, event: NewAuditEvent): Promise<void> {
  await db.insert(auditEvents).values(event);
}

/** The issuer's audit log, oldest first. */
export async function findAuditEvents(db: Queryable, issuerId: string): Promise<AuditEvent[]> {
  const rows = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.issuerId, issuerId))
    .orderBy(asc(auditEvents.occurredAt));
  return rows as AuditEvent[];
}

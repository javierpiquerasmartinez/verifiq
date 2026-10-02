import { createHash, randomBytes } from 'node:crypto';
import { AuthErrorCode } from '@verifiq/domain';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
import { invitations } from '../database/schema.js';

export const INVITATION_TTL_DAYS = 7;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Creates a single-use invitation for `email`. The token is returned once and only its hash is kept. */
export async function createInvitation(
  db: Database,
  { email, ttlDays = INVITATION_TTL_DAYS }: { email: string; ttlDays?: number },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await db.insert(invitations).values({
    email: email.trim().toLowerCase(),
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

export type InvitationProblem =
  | typeof AuthErrorCode.InvitationNotFound
  | typeof AuthErrorCode.InvitationExpired
  | typeof AuthErrorCode.InvitationUsed;

export type InvitationLookup =
  | { ok: true; id: string; email: string }
  | { ok: false; problem: InvitationProblem };

/** Whether the invitation behind `token` can still be accepted. */
export async function findInvitation(db: Database, token: string): Promise<InvitationLookup> {
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(token)));
  if (!invitation) return { ok: false, problem: AuthErrorCode.InvitationNotFound };
  if (invitation.acceptedAt) return { ok: false, problem: AuthErrorCode.InvitationUsed };
  if (invitation.expiresAt <= new Date()) {
    return { ok: false, problem: AuthErrorCode.InvitationExpired };
  }
  return { ok: true, id: invitation.id, email: invitation.email };
}

/**
 * Marks the invitation as used, atomically: of two concurrent acceptances only one wins.
 * Returns the reason when it can no longer be used.
 */
export async function claimInvitation(db: Database, token: string): Promise<InvitationLookup> {
  const now = new Date();
  const [claimed] = await db
    .update(invitations)
    .set({ acceptedAt: now })
    .where(
      and(
        eq(invitations.tokenHash, hashToken(token)),
        isNull(invitations.acceptedAt),
        gt(invitations.expiresAt, now),
      ),
    )
    .returning({ id: invitations.id, email: invitations.email });
  return claimed ? { ok: true, ...claimed } : findInvitation(db, token);
}

/** Undoes a claim whose account could not be created, so the link keeps working. */
export async function releaseInvitation(db: Database, id: string): Promise<void> {
  await db.update(invitations).set({ acceptedAt: null }).where(eq(invitations.id, id));
}

export async function linkInvitationToUser(db: Database, id: string, userId: string): Promise<void> {
  await db.update(invitations).set({ userId }).where(eq(invitations.id, id));
}

import { createHash, randomBytes } from 'node:crypto';
import { AuthErrorCode, type InvitationStatus, type OperatorInvitation, type UserRole } from '@verifiq/domain';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Auth } from '../auth/auth.js';
import type { Database } from '../database/database.module.js';
import { invitations } from '../database/schema.js';

export const INVITATION_TTL_DAYS = 7;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Creates a single-use invitation for `email`, for an account with `role`. The token is returned once
 * and only its hash is kept.
 */
export async function createInvitation(
  db: Database,
  { email, role = 'user', ttlDays = INVITATION_TTL_DAYS }: { email: string; role?: UserRole; ttlDays?: number },
): Promise<{ token: string; invitation: OperatorInvitation }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  const [row] = await db
    .insert(invitations)
    .values({ email: email.trim().toLowerCase(), role, tokenHash: hashToken(token), expiresAt })
    .returning();
  return { token, invitation: toOperatorInvitation(row!) };
}

/** The link of the invitation in the web app. */
export const invitationUrl = (appUrl: string, token: string) => new URL(`/invitation/${token}`, appUrl).toString();

type InvitationRow = typeof invitations.$inferSelect;

function statusOf(invitation: InvitationRow, now = new Date()): InvitationStatus {
  if (invitation.acceptedAt) return 'accepted';
  if (invitation.revokedAt) return 'revoked';
  return invitation.expiresAt <= now ? 'expired' : 'pending';
}

function toOperatorInvitation(row: InvitationRow): OperatorInvitation {
  return {
    id: row.id,
    email: row.email,
    status: statusOf(row),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

/** The invitations of users (the operator's own are left out), newest first. */
export async function listInvitations(db: Database, limit = 200): Promise<OperatorInvitation[]> {
  const rows = await db
    .select()
    .from(invitations)
    .where(eq(invitations.role, 'user'))
    .orderBy(desc(invitations.createdAt), desc(invitations.id))
    .limit(limit);
  return rows.map(toOperatorInvitation);
}

/** The invitation was used: there is an account behind it, which revoking would not remove. */
export class InvitationUsedError extends Error {}

/**
 * Withdraws a user's invitation that was not used yet, so its link stops working; revoking it again
 * changes nothing. Null when there is no such invitation.
 */
export async function revokeInvitation(db: Database, id: string): Promise<OperatorInvitation | null> {
  const [revoked] = await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, id), eq(invitations.role, 'user'), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
    .returning();
  if (revoked) return toOperatorInvitation(revoked);
  const [row] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.role, 'user')));
  if (!row) return null;
  if (row.acceptedAt) throw new InvitationUsedError();
  return toOperatorInvitation(row);
}

export type InvitationProblem =
  | typeof AuthErrorCode.InvitationNotFound
  | typeof AuthErrorCode.InvitationExpired
  | typeof AuthErrorCode.InvitationUsed
  | typeof AuthErrorCode.InvitationRevoked;

export type InvitationLookup =
  | { ok: true; id: string; email: string; role: UserRole }
  | { ok: false; problem: InvitationProblem };

/** Whether the invitation behind `token` can still be accepted. */
export async function findInvitation(db: Database, token: string): Promise<InvitationLookup> {
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, hashToken(token)));
  if (!invitation) return { ok: false, problem: AuthErrorCode.InvitationNotFound };
  if (invitation.acceptedAt) return { ok: false, problem: AuthErrorCode.InvitationUsed };
  if (invitation.revokedAt) return { ok: false, problem: AuthErrorCode.InvitationRevoked };
  if (invitation.expiresAt <= new Date()) {
    return { ok: false, problem: AuthErrorCode.InvitationExpired };
  }
  return { ok: true, id: invitation.id, email: invitation.email, role: invitation.role };
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
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, now),
      ),
    )
    .returning({ id: invitations.id, email: invitations.email, role: invitations.role });
  return claimed ? { ok: true, ...claimed } : findInvitation(db, token);
}

/** Undoes a claim whose account could not be created, so the link keeps working. */
export async function releaseInvitation(db: Database, id: string): Promise<void> {
  await db.update(invitations).set({ acceptedAt: null }).where(eq(invitations.id, id));
}

/** The email already belongs to a user with 2FA set up: an invitation cannot take it over. */
export class EmailTakenError extends Error {}

/**
 * Creates the user of an accepted invitation with its password and role. An account that never set up
 * 2FA is resumed instead (new name, password and role, earlier sessions closed): signing in with the
 * password alone is refused for it, so a new invitation is the only way back in.
 */
export async function establishAccount(
  auth: Auth,
  { email, name, password, role }: { email: string; name: string; password: string; role: UserRole },
): Promise<string> {
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);
  const existing = await ctx.internalAdapter.findUserByEmail(email);
  if (existing) {
    const { user } = existing;
    if ((user as { twoFactorEnabled?: boolean }).twoFactorEnabled) throw new EmailTakenError();
    await ctx.internalAdapter.deleteUserSessions(user.id);
    await ctx.internalAdapter.updateUser(user.id, { name, role });
    await ctx.internalAdapter.updatePassword(user.id, hash);
    return user.id;
  }
  const user = await ctx.internalAdapter.createUser(
    { email, name, emailVerified: true, role },
    { method: 'email-password' },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: hash,
  });
  return user.id;
}

export async function linkInvitationToUser(db: Database, id: string, userId: string): Promise<void> {
  await db.update(invitations).set({ userId }).where(eq(invitations.id, id));
}

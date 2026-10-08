import { createHash, randomBytes } from 'node:crypto';
import { AuthErrorCode, type OperatorInvitation, type UserRole } from '@verifiq/domain';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Auth } from '../auth/auth.js';
import { invitationEmail } from '../auth/emails.js';
import type { Database } from '../database/database.module.js';
import { invitations } from '../database/schema.js';
import type { Mailer } from '../mail/mailer.js';
import { findOperatorInvitation } from './invitation-list.js';

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
  const invitation = (await findOperatorInvitation(db, row!.id, role))!;
  return { token, invitation };
}

/** Creates the invitation and emails its link (`appUrl` is the web app's), which it returns this once. */
export async function inviteByEmail(
  db: Database,
  mailer: Mailer,
  { appUrl, email, role }: { appUrl: string; email: string; role?: UserRole },
): Promise<{ url: string; invitation: OperatorInvitation }> {
  const { token, invitation } = await createInvitation(db, { email, role });
  const url = new URL(`/invitation/${token}`, appUrl).toString();
  await mailer.send(invitationEmail(invitation.email, url, new Date(invitation.expiresAt)));
  return { url, invitation };
}

/** The invitation was used: there is an account behind it, which revoking would not remove. */
export class InvitationUsedError extends Error {}

/**
 * Revokes a user's invitation that was not used yet, so its link stops working; revoking it again
 * changes nothing. Null when there is no such invitation.
 */
export async function revokeInvitation(db: Database, id: string): Promise<OperatorInvitation | null> {
  await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, id), eq(invitations.role, 'user'), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
  const invitation = await findOperatorInvitation(db, id);
  if (invitation?.status === 'accepted') throw new InvitationUsedError();
  return invitation;
}

export type InvitationProblem =
  | typeof AuthErrorCode.InvitationNotFound
  | typeof AuthErrorCode.InvitationExpired
  | typeof AuthErrorCode.InvitationUsed
  | typeof AuthErrorCode.InvitationRevoked;

export const INVITATION_PROBLEM_MESSAGES: Record<InvitationProblem, string> = {
  [AuthErrorCode.InvitationNotFound]: 'This invitation does not exist',
  [AuthErrorCode.InvitationExpired]: 'This invitation has expired',
  [AuthErrorCode.InvitationUsed]: 'This invitation has already been used',
  [AuthErrorCode.InvitationRevoked]: 'This invitation was revoked',
};

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

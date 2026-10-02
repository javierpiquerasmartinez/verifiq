import { createHash, randomBytes } from 'node:crypto';
import { AuthErrorCode } from '@verifiq/domain';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Auth } from '../auth/auth.js';
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

/** The email already belongs to a Usuario with 2FA set up: an invitation cannot take it over. */
export class EmailTakenError extends Error {}

/**
 * Creates the Usuario of an accepted invitation with its password. An account that never set up
 * 2FA is resumed instead (new name and password, earlier sessions closed): signing in with the
 * password alone is refused for it, so a new invitation is the only way back in.
 */
export async function establishAccount(
  auth: Auth,
  { email, name, password }: { email: string; name: string; password: string },
): Promise<string> {
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);
  const existing = await ctx.internalAdapter.findUserByEmail(email);
  if (existing) {
    const { user } = existing;
    if ((user as { twoFactorEnabled?: boolean }).twoFactorEnabled) throw new EmailTakenError();
    await ctx.internalAdapter.deleteUserSessions(user.id);
    await ctx.internalAdapter.updateUser(user.id, { name });
    await ctx.internalAdapter.updatePassword(user.id, hash);
    return user.id;
  }
  const user = await ctx.internalAdapter.createUser(
    { email, name, emailVerified: true },
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

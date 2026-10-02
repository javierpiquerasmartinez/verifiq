import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/** Body of POST /invitations/:token/accept. */
export const acceptInvitationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  password: passwordSchema,
});

export type AcceptInvitation = z.infer<typeof acceptInvitationSchema>;

/** Response of GET /invitations/:token for an invitation that can still be used. */
export const invitationSchema = z.object({ email: z.email() });

export type Invitation = z.infer<typeof invitationSchema>;

/** Stable error codes returned by the access endpoints, so the web can show a clear message. */
export const AuthErrorCode = {
  InvitationNotFound: 'INVITATION_NOT_FOUND',
  InvitationExpired: 'INVITATION_EXPIRED',
  InvitationUsed: 'INVITATION_USED',
  EmailTaken: 'EMAIL_TAKEN',
  Unauthenticated: 'UNAUTHENTICATED',
  TwoFactorRequired: 'TWO_FACTOR_REQUIRED',
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

/** Response of GET /me: the signed-in Usuario. */
export const meSchema = z.object({
  id: z.string(),
  email: z.email(),
  name: z.string(),
});

export type Me = z.infer<typeof meSchema>;

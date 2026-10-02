import { AuthErrorCode, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@verifiq/domain';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';
import type { Database } from '../database/database.module.js';
import * as schema from '../database/schema.js';
import type { Mailer } from '../mail/mailer.js';
import { loginNotificationEmail, passwordResetEmail } from './emails.js';

export const AUTH = Symbol('AUTH');

/** Sessions die after this long without activity. */
export const INACTIVITY_TIMEOUT_SECONDS = 60 * 60;
// The maximum duration (7 days from sign-in) is enforced by a trigger on the sessions table.

export interface AuthOptions {
  /** Signs cookies and encrypts TOTP secrets. */
  secret: string;
  /** Public URL of the API. */
  apiUrl: string;
  /** Public URL of the web app, for the links sent by email. */
  appUrl: string;
  /** Origins allowed to call the auth endpoints from a browser. */
  trustedOrigins: string[];
  /** CIDRs of the proxies in front of the API, to resolve the client IP. */
  trustedProxies: string[];
}

/** Paths a signed-in Usuario can use before setting up 2FA: everything else is refused. */
const ALLOWED_BEFORE_TWO_FACTOR = new Set([
  '/get-session',
  '/sign-out',
  '/sign-in/email',
  '/two-factor/enable',
  '/two-factor/verify-totp',
  '/request-password-reset',
  '/reset-password',
]);

/** Sign-ins that finish with a session: password alone (2FA not yet set up) or the second factor. */
const SIGN_IN_PATHS = new Set([
  '/sign-in/email',
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
]);

export function createAuth(db: Database, mailer: Mailer, options: AuthOptions) {
  return betterAuth({
    appName: 'Verifiq',
    secret: options.secret,
    baseURL: options.apiUrl,
    basePath: '/auth',
    trustedOrigins: options.trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        twoFactor: schema.twoFactors,
        rateLimit: schema.rateLimits,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // Usuarios only arrive by invitation (see invitations/).
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, token }) => {
        const url = new URL('/restablecer', options.appUrl);
        url.searchParams.set('token', token);
        await mailer.send(passwordResetEmail(user.email, url.toString()));
      },
    },
    session: {
      expiresIn: INACTIVITY_TIMEOUT_SECONDS,
      // Activity pushes the expiry forward at most every 5 minutes.
      updateAge: 5 * 60,
    },
    user: {
      changeEmail: { enabled: false },
      deleteUser: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/two-factor/verify-totp': { window: 60, max: 5 },
        '/two-factor/verify-backup-code': { window: 60, max: 5 },
        '/request-password-reset': { window: 15 * 60, max: 3 },
        '/reset-password': { window: 15 * 60, max: 5 },
      },
    },
    advanced: {
      ipAddress: { trustedProxies: options.trustedProxies },
    },
    // 2FA is mandatory: it cannot be switched off.
    disabledPaths: ['/two-factor/disable', '/sign-up/email'],
    plugins: [twoFactor({ issuer: 'Verifiq' })],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // A trusted device would skip the second factor on later sign-ins.
        if (ctx.path.startsWith('/two-factor/verify') && ctx.body?.trustDevice) {
          throw new APIError('BAD_REQUEST', { message: 'Trusted devices are not supported' });
        }
        if (ALLOWED_BEFORE_TWO_FACTOR.has(ctx.path)) return;
        const session = await getSessionFromCtx(ctx);
        if (session && !session.user.twoFactorEnabled) {
          throw new APIError('FORBIDDEN', {
            code: AuthErrorCode.TwoFactorRequired,
            message: 'Two-factor authentication must be set up first',
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        // Only browser sign-ins: server-side calls (accepting an invitation) are not new logins.
        if (!ctx.request || !SIGN_IN_PATHS.has(ctx.path)) return;
        const created = ctx.context.newSession;
        if (!created) return;
        if (ctx.path === '/sign-in/email') {
          // With 2FA the password step's session is discarded: the sign-in completes on verify.
          if (created.user.twoFactorEnabled) return;
        } else {
          // verify-totp also confirms the 2FA set-up of an already signed-in Usuario; a sign-in
          // carries the challenge cookie issued after the password step.
          const challengeCookie = ctx.context.createAuthCookie('two_factor').name;
          if (!ctx.getCookie(challengeCookie)) return;
        }
        try {
          await mailer.send(
            loginNotificationEmail(created.user.email, {
              at: created.session.createdAt,
              ipAddress: created.session.ipAddress || undefined,
              userAgent: created.session.userAgent || undefined,
            }),
          );
        } catch (error) {
          // A failing email provider must not block the sign-in.
          ctx.context.logger.error('Failed to send the new sign-in email', error);
        }
      }),
    },
    telemetry: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;

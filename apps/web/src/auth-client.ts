import { AuthErrorCode } from '@verifiq/domain';
import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import { apiUrl } from './api';

/** Better Auth endpoints of the API (/auth/*). */
export const authClient = createAuthClient({
  baseURL: new URL(`${apiUrl}/auth`, window.location.origin).toString(),
  fetchOptions: { credentials: 'include' },
  plugins: [twoFactorClient()],
});

export type SessionUser = NonNullable<
  Awaited<ReturnType<typeof authClient.getSession>>['data']
>['user'];

/** The signed-in user, or null. Never served from cache: it drives the route guards. */
export async function currentUser(): Promise<SessionUser | null> {
  const { data } = await authClient.getSession({ query: { disableCookieCache: true } });
  return data?.user ?? null;
}

/** The second-factor challenge is gone: the user must start again from the password. */
export function isChallengeExpired(error: { code?: string }): boolean {
  return (
    error.code === 'INVALID_TWO_FACTOR_COOKIE' ||
    error.code === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE'
  );
}

/** Spanish message for an error returned by Better Auth. */
export function authErrorMessage(error: { status: number; code?: string }): string {
  if (error.status === 429) return 'Demasiados intentos. Espera un minuto y vuelve a probar.';
  if (isChallengeExpired(error)) return 'La verificación ha caducado. Vuelve a introducir tu contraseña.';
  switch (error.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'El email o la contraseña no son correctos.';
    case AuthErrorCode.TwoFactorSetupIncomplete:
      return 'Tu cuenta no terminó de configurarse: falta la verificación en dos pasos. Pide una nueva invitación para completarla.';
    case 'INVALID_CODE':
    case 'INVALID_BACKUP_CODE':
      return 'El código no es correcto. Compruébalo y vuelve a probar.';
    case 'ACCOUNT_TEMPORARILY_LOCKED':
      return 'Demasiados códigos incorrectos. Tu cuenta está bloqueada 15 minutos.';
    case 'INVALID_PASSWORD':
      return 'La contraseña no es correcta.';
    case 'INVALID_TOKEN':
      return 'El enlace no es válido o ha caducado. Pide uno nuevo.';
    case 'PASSWORD_TOO_SHORT':
      return 'La contraseña es demasiado corta.';
    default:
      return 'Algo ha fallado. Vuelve a intentarlo.';
  }
}

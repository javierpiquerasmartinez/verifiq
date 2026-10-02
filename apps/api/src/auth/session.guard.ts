import {
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthErrorCode } from '@verifiq/domain';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
import { AUTH, TWO_FACTOR_REQUIRED, type Auth } from './auth.js';

const IS_PUBLIC = Symbol('IS_PUBLIC');

/** Opens an endpoint to anyone: by default every endpoint needs a session with 2FA set up. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export type AuthSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;

type AuthenticatedRequest = Request & { auth?: AuthSession };

/** The session of the request, resolved by SessionGuard. */
export const CurrentSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthSession => {
    const session = ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!session) throw new Error('CurrentSession used on a public endpoint');
    return session;
  },
);

/** Global guard: a user without 2FA set up reaches nothing but its set-up (served by Better Auth). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const { headers, response: session } = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
      returnHeaders: true,
    });
    // Activity refreshes the session: pass the renewed cookie on.
    const cookies = headers.getSetCookie();
    if (cookies.length > 0) http.getResponse<Response>().append('Set-Cookie', cookies);

    if (!session) {
      throw new UnauthorizedException({
        code: AuthErrorCode.Unauthenticated,
        message: 'Sign in to continue',
      });
    }
    if (!session.user.twoFactorEnabled) {
      throw new ForbiddenException(TWO_FACTOR_REQUIRED);
    }
    request.auth = session;
    return true;
  }
}

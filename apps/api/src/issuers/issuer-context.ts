import {
  ForbiddenException,
  Inject,
  Injectable,
  createParamDecorator,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { IssuerErrorCode } from '@verifiq/domain';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { AuthSession } from '../auth/session.guard.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { issuers, issuerMemberships } from '../database/schema.js';

/**
 * Isolation layer (spec, issuer isolation model): the issuer a request acts for comes only from its
 * session, never from the request itself. Business code receives it through `@CurrentIssuer()`
 * and filters every query by it; no endpoint takes an issuer id.
 */
export interface IssuerContext {
  id: string;
  onboardingCompleted: boolean;
}

type IssuerRequest = Request & { auth?: AuthSession; issuer?: IssuerContext | null };

/** Runs after the guards: resolves the issuer of the signed-in user through its membership. */
@Injectable()
export class IssuerContextInterceptor implements NestInterceptor {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<IssuerRequest>();
    if (request.auth) request.issuer = await this.resolve(request.auth.user.id);
    return next.handle();
  }

  private async resolve(userId: string): Promise<IssuerContext | null> {
    // The MVP creates exactly one membership per user.
    const [row] = await this.db
      .select({ id: issuers.id, completedAt: issuers.onboardingCompletedAt })
      .from(issuerMemberships)
      .innerJoin(issuers, eq(issuers.id, issuerMemberships.issuerId))
      .where(eq(issuerMemberships.userId, userId))
      .limit(1);
    return row ? { id: row.id, onboardingCompleted: row.completedAt !== null } : null;
  }
}

function issuerOf(ctx: ExecutionContext): IssuerContext | null {
  const request = ctx.switchToHttp().getRequest<IssuerRequest>();
  if (request.issuer === undefined) throw new Error('Issuer context used on a public endpoint');
  return request.issuer;
}

/** Id of the issuer of the session, at any point of onboarding (null before step 1 is saved). */
export const OnboardingIssuer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => issuerOf(ctx)?.id ?? null,
);

/** Id of the issuer of the session. Business endpoints are reachable only once onboarding is complete. */
export const CurrentIssuer = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const issuer = issuerOf(ctx);
  if (!issuer?.onboardingCompleted) {
    throw new ForbiddenException({
      code: IssuerErrorCode.OnboardingIncomplete,
      message: 'Finish the issuer onboarding first',
    });
  }
  return issuer.id;
});

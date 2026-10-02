import {
  ForbiddenException,
  Inject,
  Injectable,
  createParamDecorator,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { EmisorErrorCode } from '@verifiq/domain';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { AuthSession } from '../auth/session.guard.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { emisores, emisorMemberships } from '../database/schema.js';

/**
 * Isolation layer (spec, Modelo de tenancy): the Emisor a request acts for comes only from its
 * session, never from the request itself. Business code receives it through `@CurrentEmisor()`
 * and filters every query by it; no endpoint takes an Emisor id.
 */
export interface EmisorContext {
  id: string;
  onboardingCompleted: boolean;
}

type TenantRequest = Request & { auth?: AuthSession; emisor?: EmisorContext | null };

/** Runs after the guards: resolves the Emisor of the signed-in Usuario through its membership. */
@Injectable()
export class EmisorContextInterceptor implements NestInterceptor {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (request.auth) request.emisor = await this.resolve(request.auth.user.id);
    return next.handle();
  }

  private async resolve(userId: string): Promise<EmisorContext | null> {
    // The MVP creates exactly one membership per Usuario.
    const [row] = await this.db
      .select({ id: emisores.id, completedAt: emisores.onboardingCompletedAt })
      .from(emisorMemberships)
      .innerJoin(emisores, eq(emisores.id, emisorMemberships.emisorId))
      .where(eq(emisorMemberships.userId, userId))
      .limit(1);
    return row ? { id: row.id, onboardingCompleted: row.completedAt !== null } : null;
  }
}

function emisorOf(ctx: ExecutionContext): EmisorContext | null {
  const request = ctx.switchToHttp().getRequest<TenantRequest>();
  if (request.emisor === undefined) throw new Error('Emisor context used on a public endpoint');
  return request.emisor;
}

/** Id of the Emisor of the session, at any point of the alta (null before step 1 is saved). */
export const OnboardingEmisor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => emisorOf(ctx)?.id ?? null,
);

/** Id of the Emisor of the session. Business endpoints are reachable only once the alta is complete. */
export const CurrentEmisor = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const emisor = emisorOf(ctx);
  if (!emisor?.onboardingCompleted) {
    throw new ForbiddenException({
      code: EmisorErrorCode.OnboardingIncomplete,
      message: 'Finish the alta del Emisor first',
    });
  }
  return emisor.id;
});

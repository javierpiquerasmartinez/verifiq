import type { NestExpressApplication } from '@nestjs/platform-express';
import { LOGO_CONTENT_TYPES, LOGO_MAX_BYTES } from '@verifiq/domain';
import { toNodeHandler } from 'better-auth/node';
import { AUTH, type Auth } from './auth/auth.js';

export interface HttpOptions {
  /** Exact origins, or patterns where `*` stands for one DNS-label fragment (e.g. Vercel previews). */
  webOrigins: string[];
}

/**
 * HTTP setup shared by main.ts and the tests. The app must be created with `bodyParser: false`:
 * Better Auth reads the raw body of /auth/*, so the JSON parser is registered after it.
 */
export function configureHttp(app: NestExpressApplication, { webOrigins }: HttpOptions): void {
  app.enableCors({ origin: webOrigins.map(toOriginMatcher), credentials: true });
  const authHandler = toNodeHandler(app.get<Auth>(AUTH));
  app.use((request: { url: string }, response: Parameters<typeof authHandler>[1], next: () => void) =>
    request.url.startsWith('/auth/') ? void authHandler(request as never, response) : next(),
  );
  app.useBodyParser('json');
  // Logo uploads (PUT /emisor/logo) send the image as the raw body.
  app.useBodyParser('raw', { type: [...LOGO_CONTENT_TYPES], limit: LOGO_MAX_BYTES });
}

function toOriginMatcher(origin: string): string | RegExp {
  if (!origin.includes('*')) return origin;
  const pattern = origin
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[a-z0-9-]+');
  return new RegExp(`^${pattern}$`);
}

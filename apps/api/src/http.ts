import type { INestApplication } from '@nestjs/common';

export interface HttpOptions {
  /** Exact origins, or patterns where `*` stands for one DNS-label fragment (e.g. Vercel previews). */
  webOrigins: string[];
}

/** HTTP setup shared by main.ts and the tests. */
export function configureHttp(app: INestApplication, { webOrigins }: HttpOptions): void {
  app.enableCors({ origin: webOrigins.map(toOriginMatcher) });
}

function toOriginMatcher(origin: string): string | RegExp {
  if (!origin.includes('*')) return origin;
  const pattern = origin
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[a-z0-9-]+');
  return new RegExp(`^${pattern}$`);
}

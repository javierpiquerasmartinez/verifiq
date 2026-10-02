import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureHttp } from '../src/http.js';

export const TEST_VERSION = '9.9.9-test';

/** Boots the full Nest app against the per-run test database. */
export async function createTestApp(
  { webOrigins = ['http://localhost:5173'] }: { webOrigins?: string[] } = {},
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot({ databaseUrl: inject('databaseUrl'), version: TEST_VERSION })],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureHttp(app, { webOrigins });
  await app.init();
  return app;
}

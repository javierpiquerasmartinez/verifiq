import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureHttp } from '../src/http.js';
import type { EmailMessage, Mailer } from '../src/mail/mailer.js';

export const TEST_VERSION = '9.9.9-test';
export const WEB_ORIGIN = 'http://localhost:5173';

/** Collects the emails the app sends. */
export class FakeMailer implements Mailer {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  to(address: string): EmailMessage[] {
    return this.sent.filter((message) => message.to === address);
  }
}

/** Boots the full Nest app against the per-run test database. */
export async function createTestApp({
  webOrigins = [WEB_ORIGIN],
  mailer = new FakeMailer(),
}: { webOrigins?: string[]; mailer?: Mailer } = {}): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      AppModule.forRoot({
        databaseUrl: inject('databaseUrl'),
        version: TEST_VERSION,
        auth: {
          secret: 'test-secret-test-secret-test-secret-0123456789',
          apiUrl: 'http://localhost:3000',
          appUrl: WEB_ORIGIN,
          trustedOrigins: webOrigins,
          trustedProxies: [],
        },
        mailer,
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureHttp(app, { webOrigins });
  await app.init();
  return app;
}

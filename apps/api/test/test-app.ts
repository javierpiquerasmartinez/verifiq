import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { inject } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureHttp } from '../src/http.js';
import type { EmailMessage, Mailer } from '../src/mail/mailer.js';
import type { ObjectStorage, StoredObject } from '../src/storage/object-storage.js';
import type { VerifactuConnector } from '../src/verifactu/connector.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';

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

/** Keeps stored files in memory. */
export class InMemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, StoredObject>();

  async put(key: string, object: StoredObject): Promise<void> {
    this.objects.set(key, object);
  }

  async get(key: string): Promise<StoredObject | null> {
    return this.objects.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

/** Boots the full Nest app against the per-run test database. */
export async function createTestApp({
  webOrigins = [WEB_ORIGIN],
  mailer = new FakeMailer(),
  storage = new InMemoryObjectStorage(),
  verifactu = new FakeVerifactuConnector(),
  representationRequired = true,
}: {
  webOrigins?: string[];
  mailer?: Mailer;
  storage?: ObjectStorage;
  verifactu?: VerifactuConnector;
  representationRequired?: boolean;
} = {}): Promise<INestApplication> {
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
        storage,
        verifactu: () => verifactu,
        representationRequired,
        // Its own queue: test files share the database, and each drives its worker by hand.
        submission: { queueName: `submission-${randomUUID()}`, work: false },
      }),
    ],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureHttp(app, { webOrigins });
  await app.init();
  return app;
}

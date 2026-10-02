import type { INestApplication } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, it, vi } from 'vitest';
import { activeUsuario } from './access.js';
import { createTestApp } from './test-app.js';

const MINUTE = 60 * 1000;

describe('Session expiry', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Moves the clock forward; only Date is faked so I/O keeps working. */
  function travel(ms: number) {
    vi.setSystemTime(Date.now() + ms);
  }

  it('expires after an hour without activity', async () => {
    const { agent } = await activeUsuario(app);
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });

    travel(59 * MINUTE);
    await agent.get('/me').expect(200);
    travel(61 * MINUTE);
    await agent.get('/me').expect(401);
  });

  it('activity keeps it alive, but never beyond 7 days', async () => {
    const { agent } = await activeUsuario(app);
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });

    const sevenDays = 7 * 24 * 60 * MINUTE;
    for (let elapsed = 0; elapsed < sevenDays - 30 * MINUTE; elapsed += 30 * MINUTE) {
      travel(30 * MINUTE);
      await agent.get('/me').expect(200);
    }
    travel(30 * MINUTE);
    await agent.get('/me').expect(401);
  });
});

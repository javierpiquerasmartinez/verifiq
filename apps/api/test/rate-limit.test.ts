import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeUsuario, browser, PASSWORD } from './access.js';
import { createTestApp } from './test-app.js';

describe('Rate limiting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks repeated sign-in attempts from the same IP', async () => {
    const { email } = await activeUsuario(app);
    const attacker = browser(app);
    const attempt = () =>
      attacker.post('/auth/sign-in/email').send({ email, password: 'guess-guess-guess' });

    for (let i = 0; i < 5; i++) await attempt().expect(401);
    const blocked = await attempt().expect(429);

    expect(blocked.headers['x-retry-after']).toBeDefined();
    // Even the right password is refused while blocked.
    await attacker.post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(429);
  });

  it('blocks repeated second-factor guesses', async () => {
    const { email } = await activeUsuario(app);
    const attacker = browser(app);
    await attacker.post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(200);

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await attacker.post('/auth/two-factor/verify-totp').send({ code: '000000' });
      statuses.push(response.status);
    }

    expect(statuses).toContain(429);
  });

  it('blocks repeated password recovery requests', async () => {
    const { email } = await activeUsuario(app);
    const client = browser(app);
    const request = () => client.post('/auth/request-password-reset').send({ email });

    for (let i = 0; i < 3; i++) await request().expect(200);
    await request().expect(429);
  });

  it('counts each IP separately', async () => {
    const { email } = await activeUsuario(app);
    const attacker = browser(app);
    for (let i = 0; i < 6; i++) {
      await attacker.post('/auth/sign-in/email').send({ email, password: 'guess-guess-guess' });
    }

    await browser(app).post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(200);
  });
});

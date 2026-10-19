import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeUser, browser, PASSWORD } from './access.js';
import { totpCode } from './totp.js';
import { createTestApp, FakeMailer } from './test-app.js';

describe('Rate limiting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks repeated sign-in attempts from the same IP', async () => {
    const { email } = await activeUser(app);
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
    const { email } = await activeUser(app);
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
    const { email } = await activeUser(app);
    const client = browser(app);
    const request = () => client.post('/auth/request-password-reset').send({ email });

    for (let i = 0; i < 3; i++) await request().expect(200);
    await request().expect(429);
  });

  it('counts each IP separately', async () => {
    const { email } = await activeUser(app);
    const attacker = browser(app);
    for (let i = 0; i < 6; i++) {
      await attacker.post('/auth/sign-in/email').send({ email, password: 'guess-guess-guess' });
    }

    await browser(app).post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(200);
  });

  describe('behind a host that names the client in its own header (Render: CF-Connecting-IP)', () => {
    let hosted: INestApplication;
    const mailer = new FakeMailer();

    beforeAll(async () => {
      hosted = await createTestApp({ clientIpHeader: 'cf-connecting-ip', mailer });
    });

    afterAll(async () => {
      await hosted.close();
    });

    const from = (ip: string) => browser(hosted).set('CF-Connecting-IP', ip);

    it('counts each client separately', async () => {
      const { email } = await activeUser(hosted);
      const attacker = from('203.0.113.7');
      for (let i = 0; i < 6; i++) {
        await attacker.post('/auth/sign-in/email').send({ email, password: 'guess-guess-guess' });
      }

      await from('198.51.100.20').post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(200);
    });

    it('shows the client in the new sign-in email', async () => {
      const { email, secret } = await activeUser(hosted);
      const agent = from('198.51.100.30');
      await agent.post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(200);
      await agent.post('/auth/two-factor/verify-totp').send({ code: totpCode(secret) }).expect(200);

      const notices = mailer.to(email).filter((m) => m.subject === 'Nuevo inicio de sesión en Verifiq');
      expect(notices.at(-1)!.text).toContain('Dirección IP: 198.51.100.30');
    });

    it('ignores the X-Forwarded-For a client forges', async () => {
      const { email } = await activeUser(hosted);
      const attacker = from('203.0.113.8');
      for (let i = 0; i < 5; i++) {
        await attacker
          .post('/auth/sign-in/email')
          .set('X-Forwarded-For', `192.0.2.${i}`)
          .send({ email, password: 'guess-guess-guess' });
      }

      await attacker.post('/auth/sign-in/email').set('X-Forwarded-For', '192.0.2.99').send({ email, password: PASSWORD }).expect(429);
    });
  });
});

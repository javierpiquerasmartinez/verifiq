import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activeUsuario,
  browser,
  invitedUsuario,
  PASSWORD,
  setUpTwoFactor,
  signIn,
} from './access.js';
import { createTestApp } from './test-app.js';
import { totpCode } from './totp.js';

describe('Mandatory 2FA', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('before setting it up', () => {
    it('the app refuses everything', async () => {
      const { agent } = await invitedUsuario(app);

      const response = await agent.get('/me').expect(403);

      expect(response.body.code).toBe('TWO_FACTOR_REQUIRED');
    });

    it('account endpoints are refused too', async () => {
      const { agent } = await invitedUsuario(app);

      const response = await agent.get('/auth/list-sessions').expect(403);

      expect(response.body.code).toBe('TWO_FACTOR_REQUIRED');
    });

    it('the password alone does not open a session: only the invitation does', async () => {
      const { email } = await invitedUsuario(app);
      const agent = browser(app);

      const response = await agent
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })
        .expect(403);

      expect(response.body.code).toBe('TWO_FACTOR_SETUP_INCOMPLETE');
      await agent.get('/me').expect(401);
      const session = await agent.get('/auth/get-session').expect(200);
      expect(session.body).toBeNull();
      await agent.post('/auth/two-factor/enable').send({ password: PASSWORD }).expect(401);
    });

    it('a wrong password does not reveal that the set-up is pending', async () => {
      const { email } = await invitedUsuario(app);

      const response = await browser(app)
        .post('/auth/sign-in/email')
        .send({ email, password: 'not-the-password' })
        .expect(401);

      expect(response.body.code).toBe('INVALID_EMAIL_OR_PASSWORD');
    });
  });

  it('setting it up opens the app and shows recovery codes once', async () => {
    const { agent, email } = await invitedUsuario(app);

    const { backupCodes } = await setUpTwoFactor(agent);

    expect(backupCodes).toHaveLength(10);
    const me = await agent.get('/me').expect(200);
    expect(me.body).toMatchObject({ email, name: 'Lucía Ferrer' });
    const again = await agent.post('/auth/two-factor/enable').send({ password: PASSWORD });
    expect(again.status).toBe(400);
    expect(again.body.backupCodes).toBeUndefined();
  });

  it('a wrong code does not complete the set-up', async () => {
    const { agent } = await invitedUsuario(app);
    await agent.post('/auth/two-factor/enable').send({ password: PASSWORD }).expect(200);

    await agent.post('/auth/two-factor/verify-totp').send({ code: '000000' }).expect(401);

    await agent.get('/me').expect(403);
  });

  it('cannot be switched off', async () => {
    const { agent } = await activeUsuario(app);

    await agent.post('/auth/two-factor/disable').send({ password: PASSWORD }).expect(404);
  });

  describe('signing in', () => {
    it('the password alone gives no session', async () => {
      const { email } = await activeUsuario(app);
      const agent = browser(app);

      const response = await agent
        .post('/auth/sign-in/email')
        .send({ email, password: PASSWORD })
        .expect(200);

      expect(response.body).toMatchObject({ twoFactorRedirect: true });
      await agent.get('/me').expect(401);
    });

    it('works with the TOTP code', async () => {
      const { email, secret } = await activeUsuario(app);

      const agent = await signIn(app, email, secret);

      await agent.get('/me').expect(200);
    });

    it('rejects a wrong TOTP code', async () => {
      const { email, secret } = await activeUsuario(app);
      const agent = browser(app);
      await agent.post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(200);

      const wrong = String((Number(totpCode(secret)) + 1) % 1_000_000).padStart(6, '0');
      await agent.post('/auth/two-factor/verify-totp').send({ code: wrong }).expect(401);

      await agent.get('/me').expect(401);
    });

    it('rejects a wrong password', async () => {
      const { email } = await activeUsuario(app);

      const response = await browser(app)
        .post('/auth/sign-in/email')
        .send({ email, password: 'not-the-password' })
        .expect(401);

      expect(response.body.twoFactorRedirect).toBeUndefined();
    });

    it('works with a recovery code, once', async () => {
      const { email, backupCodes } = await activeUsuario(app);
      const code = backupCodes[0]!;

      const agent = browser(app);
      await agent.post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(200);
      await agent.post('/auth/two-factor/verify-backup-code').send({ code }).expect(200);
      await agent.get('/me').expect(200);

      const reuse = browser(app);
      await reuse.post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(200);
      await reuse.post('/auth/two-factor/verify-backup-code').send({ code }).expect(401);
      await reuse.get('/me').expect(401);
    });

    it('never trusts the device to skip the code next time', async () => {
      const { email, secret } = await activeUsuario(app);
      const agent = browser(app);
      await agent.post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(200);

      await agent
        .post('/auth/two-factor/verify-totp')
        .send({ code: totpCode(secret), trustDevice: true })
        .expect(400);
    });
  });

  it('signing out ends the session', async () => {
    const { agent } = await activeUsuario(app);

    await agent.post('/auth/sign-out').send({}).expect(200);

    await agent.get('/me').expect(401);
  });
});

import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeUser, browser, PASSWORD } from './access.js';
import { createTestApp, FakeMailer, WEB_ORIGIN } from './test-app.js';
import { totpCode } from './totp.js';

const NEW_PASSWORD = 'a-brand-new-password';

describe('Password recovery', () => {
  let app: INestApplication;
  const mailer = new FakeMailer();

  beforeAll(async () => {
    app = await createTestApp({ mailer });
  });

  afterAll(async () => {
    await app.close();
  });

  /** The token of the link in the last recovery email sent to `email`. */
  function tokenFromEmail(email: string): string {
    const message = mailer.to(email).findLast((m) => m.subject.includes('Restablece'));
    const link = message?.text.match(/https?:\/\/\S+/)?.[0];
    if (!link) throw new Error(`No recovery email for ${email}`);
    expect(link.startsWith(`${WEB_ORIGIN}/reset-password?token=`)).toBe(true);
    return new URL(link).searchParams.get('token')!;
  }

  it('emails a link that sets a new password, ends every session and keeps 2FA', async () => {
    const { agent: oldSession, email, secret } = await activeUser(app);

    await browser(app).post('/auth/request-password-reset').send({ email }).expect(200);
    await browser(app)
      .post('/auth/reset-password')
      .send({ token: tokenFromEmail(email), newPassword: NEW_PASSWORD })
      .expect(200);

    await oldSession.get('/me').expect(401);
    await browser(app).post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(401);
    const agent = browser(app);
    const signedIn = await agent
      .post('/auth/sign-in/email')
      .send({ email, password: NEW_PASSWORD })
      .expect(200);
    expect(signedIn.body.twoFactorRedirect).toBe(true);
    await agent.post('/auth/two-factor/verify-totp').send({ code: totpCode(secret) }).expect(200);
    await agent.get('/me').expect(200);
  });

  it('the link works only once', async () => {
    const { email } = await activeUser(app);
    await browser(app).post('/auth/request-password-reset').send({ email }).expect(200);
    const token = tokenFromEmail(email);
    await browser(app).post('/auth/reset-password').send({ token, newPassword: NEW_PASSWORD }).expect(200);

    await browser(app)
      .post('/auth/reset-password')
      .send({ token, newPassword: 'yet-another-password' })
      .expect(400);
  });

  it('does not reveal whether an account exists', async () => {
    const email = 'nadie@example.com';

    await browser(app).post('/auth/request-password-reset').send({ email }).expect(200);

    expect(mailer.to(email)).toHaveLength(0);
  });
});

describe('New sign-in email', () => {
  let app: INestApplication;
  const mailer = new FakeMailer();

  beforeAll(async () => {
    app = await createTestApp({ mailer });
  });

  afterAll(async () => {
    await app.close();
  });

  const loginEmails = (email: string) =>
    mailer.to(email).filter((m) => m.subject === 'Nuevo inicio de sesión en Verifiq');

  it('is sent when a sign-in completes, with the browser and IP', async () => {
    const { email, secret } = await activeUser(app);
    expect(loginEmails(email)).toHaveLength(0);

    const agent = browser(app);
    await agent.post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(200);
    expect(loginEmails(email)).toHaveLength(0);
    await agent.post('/auth/two-factor/verify-totp').send({ code: totpCode(secret) }).expect(200);

    const [notice] = loginEmails(email);
    expect(loginEmails(email)).toHaveLength(1);
    expect(notice!.text).toContain('vitest-browser');
    expect(notice!.text).toMatch(/Dirección IP: 10\./);
  });

  it('is not sent for a failed sign-in', async () => {
    const { email } = await activeUser(app);
    const agent = browser(app);
    await agent.post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(200);

    await agent.post('/auth/two-factor/verify-totp').send({ code: '000000' }).expect(401);

    expect(loginEmails(email)).toHaveLength(0);
  });
});

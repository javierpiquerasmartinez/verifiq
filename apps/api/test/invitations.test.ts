import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { browser, invite, PASSWORD } from './access.js';
import { createTestApp } from './test-app.js';

describe('Invitations', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const accept = (token: string, body = { name: 'Lucía Ferrer', password: PASSWORD }) =>
    browser(app).post(`/invitations/${token}/accept`).send(body);

  it('shows the invited email for a valid invitation', async () => {
    const { token, email } = await invite(app);

    const response = await browser(app).get(`/invitations/${token}`).expect(200);

    expect(response.body).toEqual({ email });
  });

  it('creates the Usuario, signs it in and leaves 2FA pending', async () => {
    const { token, email } = await invite(app);
    const agent = browser(app);

    const response = await agent
      .post(`/invitations/${token}/accept`)
      .send({ name: 'Lucía Ferrer', password: PASSWORD })
      .expect(200);

    expect(response.body).toEqual({ email });
    const session = await agent.get('/auth/get-session').expect(200);
    expect(session.body.user).toMatchObject({ email, name: 'Lucía Ferrer', twoFactorEnabled: false });
  });

  it('cannot be used twice', async () => {
    const { token } = await invite(app);
    await accept(token).expect(200);

    const again = await accept(token).expect(410);
    expect(again.body.code).toBe('INVITATION_USED');
    const shown = await browser(app).get(`/invitations/${token}`).expect(410);
    expect(shown.body.code).toBe('INVITATION_USED');
  });

  it('only one of two simultaneous acceptances wins', async () => {
    const { token } = await invite(app);

    const statuses = (await Promise.all([accept(token), accept(token)])).map((r) => r.status);

    expect(statuses.sort()).toEqual([200, 410]);
  });

  it('expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const { token } = await invite(app);
    vi.useRealTimers();

    const shown = await browser(app).get(`/invitations/${token}`).expect(410);
    expect(shown.body.code).toBe('INVITATION_EXPIRED');
    const accepted = await accept(token).expect(410);
    expect(accepted.body.code).toBe('INVITATION_EXPIRED');
  });

  it('rejects an unknown token', async () => {
    const shown = await browser(app).get('/invitations/not-a-real-token').expect(404);
    expect(shown.body.code).toBe('INVITATION_NOT_FOUND');
    await accept('not-a-real-token').expect(404);
  });

  it('rejects a short password and keeps the invitation usable', async () => {
    const { token } = await invite(app);

    await accept(token, { name: 'Lucía Ferrer', password: 'short' }).expect(400);

    await accept(token).expect(200);
  });

  it('there is no public sign-up', async () => {
    await browser(app)
      .post('/auth/sign-up/email')
      .send({ email: 'intruso@example.com', password: PASSWORD, name: 'Intruso' })
      .expect(404);
  });
});

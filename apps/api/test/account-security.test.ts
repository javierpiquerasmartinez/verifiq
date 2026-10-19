import type { INestApplication } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { activeUser, browser, PASSWORD, signIn, type Agent } from './access.js';
import { createTestApp } from './test-app.js';

const MINUTE = 60 * 1000;
const NEW_PASSWORD = 'staple-battery-horse-correct';

/** The settings' security section: password, recovery codes and sessions. */
describe('Account security', () => {
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

  /** Password step of a sign-in, on a fresh browser. */
  async function passwordStep(email: string, password = PASSWORD) {
    const agent = browser(app);
    const response = await agent.post('/auth/sign-in/email').send({ email, password });
    return { agent, status: response.status };
  }

  async function sessionsOf(agent: Agent) {
    const { body } = await agent.get('/auth/list-sessions').expect(200);
    return body as { token: string; userAgent: string | null; ipAddress: string | null }[];
  }

  describe('changing the password', () => {
    it('needs the current password', async () => {
      const { agent } = await activeUser(app);

      await agent
        .post('/auth/change-password')
        .send({ currentPassword: 'wrong-password-123', newPassword: NEW_PASSWORD, revokeOtherSessions: true })
        .expect(400);
    });

    it('signs out every other session and the new password signs in', async () => {
      const { agent, email, secret } = await activeUser(app);
      const other = await signIn(app, email, secret);

      await agent
        .post('/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, revokeOtherSessions: true })
        .expect(200);

      await agent.get('/me').expect(200);
      await other.get('/me').expect(401);
      expect((await passwordStep(email)).status).toBe(401);
      expect((await passwordStep(email, NEW_PASSWORD)).status).toBe(200);
    });

    it('is refused if it would keep the other sessions open', async () => {
      const { agent, email } = await activeUser(app);

      await agent
        .post('/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, revokeOtherSessions: false })
        .expect(400);
      await agent.post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }).expect(400);
      expect((await passwordStep(email)).status).toBe(200);
    });
  });

  describe('regenerating the recovery codes', () => {
    it('needs the password', async () => {
      const { agent } = await activeUser(app);

      await agent.post('/auth/two-factor/generate-backup-codes').send({ password: 'wrong-password-123' }).expect(400);
    });

    it('replaces the previous codes', async () => {
      const { agent, email, backupCodes } = await activeUser(app);

      const { body } = await agent.post('/auth/two-factor/generate-backup-codes').send({ password: PASSWORD }).expect(200);

      expect(body.backupCodes).toHaveLength(10);
      expect(body.backupCodes).not.toContain(backupCodes[0]);
      const withOld = (await passwordStep(email)).agent;
      await withOld.post('/auth/two-factor/verify-backup-code').send({ code: backupCodes[0] }).expect(401);
      const withNew = (await passwordStep(email)).agent;
      await withNew.post('/auth/two-factor/verify-backup-code').send({ code: body.backupCodes[0] }).expect(200);
    });
  });

  describe('sessions', () => {
    it('lists the active sessions, with their device', async () => {
      const { agent, email, secret } = await activeUser(app);
      await signIn(app, email, secret);

      const sessions = await sessionsOf(agent);

      expect(sessions).toHaveLength(2);
      expect(sessions.every((session) => session.userAgent === 'vitest-browser' && session.ipAddress)).toBe(true);
    });

    it('lists them however long ago the user signed in', async () => {
      const { agent } = await activeUser(app);
      vi.useFakeTimers({ toFake: ['Date'], now: Date.now() });

      // Kept alive by activity for two days: older than Better Auth's default "fresh" session.
      for (let elapsed = 0; elapsed < 2 * 24 * 60 * MINUTE; elapsed += 50 * MINUTE) {
        vi.setSystemTime(Date.now() + 50 * MINUTE);
        await agent.get('/me').expect(200);
      }

      expect(await sessionsOf(agent)).toHaveLength(1);
    });

    it('revokes another session', async () => {
      const { agent, email, secret } = await activeUser(app);
      const other = await signIn(app, email, secret);
      const { body: current } = await agent.get('/auth/get-session').expect(200);
      const target = (await sessionsOf(agent)).find((session) => session.token !== current.session.token)!;

      await agent.post('/auth/revoke-session').send({ token: target.token }).expect(200);

      await other.get('/me').expect(401);
      await agent.get('/me').expect(200);
      expect(await sessionsOf(agent)).toHaveLength(1);
    });

    it("never another user's", async () => {
      const lucia = await activeUser(app);
      const pau = await activeUser(app);
      const [pauSession] = await sessionsOf(pau.agent);

      await lucia.agent.post('/auth/revoke-session').send({ token: pauSession!.token });

      await pau.agent.get('/me').expect(200);
    });
  });
});

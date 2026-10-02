import type { INestApplication } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import request from 'supertest';
import { expect } from 'vitest';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { createInvitation } from '../src/invitations/invitations.js';
import { WEB_ORIGIN } from './test-app.js';
import { secretFromUri, totpCode } from './totp.js';

export const PASSWORD = 'correct-horse-battery';

export type Agent = ReturnType<typeof request.agent>;

/** A browser: keeps cookies, sends the web app's Origin and comes from its own IP (rate limits are per IP). */
export function browser(app: INestApplication): Agent {
  const ip = `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
  return request
    .agent(app.getHttpServer())
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', ip)
    .set('User-Agent', 'vitest-browser');
}

export const uniqueEmail = () => `user-${randomUUID()}@example.com`;

/** What the operator script does: returns the token of the link. */
export async function invite(app: INestApplication, email = uniqueEmail()) {
  const { token } = await createInvitation(app.get<Database>(DATABASE), { email });
  return { token, email };
}

/** An invited user who has set a password: signed in, 2FA not set up yet. */
export async function invitedUser(app: INestApplication) {
  const { token, email } = await invite(app);
  const agent = browser(app);
  await agent
    .post(`/invitations/${token}/accept`)
    .send({ name: 'Lucía Ferrer', password: PASSWORD })
    .expect(200);
  return { agent, email };
}

/** Sets up TOTP for the signed-in user of `agent`, as the set-up screen does. */
export async function setUpTwoFactor(agent: Agent) {
  const enabled = await agent.post('/auth/two-factor/enable').send({ password: PASSWORD }).expect(200);
  const secret = secretFromUri(enabled.body.totpURI);
  await agent.post('/auth/two-factor/verify-totp').send({ code: totpCode(secret) }).expect(200);
  return { secret, backupCodes: enabled.body.backupCodes as string[] };
}

/** A user with 2FA set up, signed in on `agent`. */
export async function activeUser(app: INestApplication) {
  const { agent, email } = await invitedUser(app);
  const { secret, backupCodes } = await setUpTwoFactor(agent);
  return { agent, email, secret, backupCodes };
}

/** Full sign-in on a fresh browser: password, then the TOTP code. */
export async function signIn(app: INestApplication, email: string, secret: string) {
  const agent = browser(app);
  const first = await agent.post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(200);
  expect(first.body.twoFactorRedirect).toBe(true);
  await agent.post('/auth/two-factor/verify-totp').send({ code: totpCode(secret) }).expect(200);
  return agent;
}

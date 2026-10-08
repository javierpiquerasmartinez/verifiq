import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeUser } from './access.js';
import { fiscalData, onboardedUser } from './issuer.js';
import { createTestApp } from './test-app.js';

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

describe('Issuer', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('isolation between issuers', () => {
    it('each user only reads its own issuer', async () => {
      const lucia = await onboardedUser(app);
      const pau = await onboardedUser(app);

      const forLucia = await lucia.agent.get('/issuer').expect(200);
      const forPau = await pau.agent.get('/issuer').expect(200);

      expect(forLucia.body.taxId).toBe(lucia.taxId);
      expect(forPau.body.taxId).toBe(pau.taxId);
    });

    it("a user's changes never reach another issuer", async () => {
      const lucia = await onboardedUser(app);
      const pau = await onboardedUser(app);

      await pau.agent
        .put('/issuer/fiscal-data')
        .send({ ...fiscalData(pau.taxId), name: 'Pau Ribes' })
        .expect(200);
      await pau.agent.put('/issuer/logo').set('Content-Type', 'image/png').send(PNG).expect(200);

      const forLucia = await lucia.agent.get('/onboarding').expect(200);
      expect(forLucia.body).toMatchObject({
        fiscalData: { name: 'Lucía Ferrer Albiol', taxId: lucia.taxId },
        hasLogo: false,
      });
      await lucia.agent.get('/issuer/logo').expect(404);
    });

    it('a user cannot take over the issuer of another by its tax ID', async () => {
      const lucia = await onboardedUser(app);
      const intruder = await activeUser(app);

      await intruder.agent.put('/onboarding/fiscal-data').send(fiscalData(lucia.taxId)).expect(409);

      const forIntruder = await intruder.agent.get('/onboarding').expect(200);
      expect(forIntruder.body.fiscalData).toBeNull();
      await intruder.agent.get('/issuer').expect(403);
    });
  });

  describe('logo', () => {
    async function withFiscalData() {
      const { agent } = await activeUser(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);
      return agent;
    }

    it('is stored and served back as uploaded', async () => {
      const agent = await withFiscalData();

      await agent.put('/issuer/logo').set('Content-Type', 'image/png').send(PNG).expect(200);

      const logo = await agent.get('/issuer/logo').expect(200);
      expect(logo.headers['content-type']).toBe('image/png');
      expect(Buffer.compare(logo.body as Buffer, PNG)).toBe(0);
      const state = await agent.get('/onboarding').expect(200);
      expect(state.body.hasLogo).toBe(true);
    });

    it('can be replaced and removed', async () => {
      const agent = await withFiscalData();
      await agent.put('/issuer/logo').set('Content-Type', 'image/png').send(PNG).expect(200);

      await agent.put('/issuer/logo').set('Content-Type', 'image/jpeg').send(JPEG).expect(200);
      const replaced = await agent.get('/issuer/logo').expect(200);
      expect(replaced.headers['content-type']).toBe('image/jpeg');

      await agent.delete('/issuer/logo').expect(200);
      await agent.get('/issuer/logo').expect(404);
      const state = await agent.get('/onboarding').expect(200);
      expect(state.body.hasLogo).toBe(false);
    });

    it('must really be a PNG or JPEG image', async () => {
      const agent = await withFiscalData();

      const response = await agent
        .put('/issuer/logo')
        .set('Content-Type', 'image/png')
        .send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))
        .expect(415);

      expect(response.body.code).toBe('LOGO_INVALID');
    });

    it('rejects a file over 1 MB', async () => {
      const agent = await withFiscalData();
      const huge = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);

      await agent.put('/issuer/logo').set('Content-Type', 'image/png').send(huge).expect(413);
    });

    it('needs the fiscal data first', async () => {
      const { agent } = await activeUser(app);

      const response = await agent.put('/issuer/logo').set('Content-Type', 'image/png').send(PNG).expect(409);

      expect(response.body.code).toBe('ONBOARDING_STEP_PENDING');
    });
  });
});

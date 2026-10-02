import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeUsuario } from './access.js';
import { fiscalData, onboardedUsuario } from './emisor.js';
import { createTestApp } from './test-app.js';

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

describe('Emisor', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('isolation between Emisores', () => {
    it('each Usuario only reads its own Emisor', async () => {
      const lucia = await onboardedUsuario(app);
      const pau = await onboardedUsuario(app);

      const forLucia = await lucia.agent.get('/emisor').expect(200);
      const forPau = await pau.agent.get('/emisor').expect(200);

      expect(forLucia.body.nif).toBe(lucia.nif);
      expect(forPau.body.nif).toBe(pau.nif);
    });

    it("a Usuario's changes never reach another Emisor", async () => {
      const lucia = await onboardedUsuario(app);
      const pau = await onboardedUsuario(app);

      await pau.agent
        .put('/onboarding/fiscal-data')
        .send({ ...fiscalData(pau.nif), name: 'Pau Ribes' })
        .expect(200);
      await pau.agent.put('/emisor/logo').set('Content-Type', 'image/png').send(PNG).expect(200);

      const forLucia = await lucia.agent.get('/onboarding').expect(200);
      expect(forLucia.body).toMatchObject({
        fiscalData: { name: 'Lucía Ferrer Albiol', nif: lucia.nif },
        hasLogo: false,
      });
      await lucia.agent.get('/emisor/logo').expect(404);
    });

    it('a Usuario cannot take over the Emisor of another by its NIF', async () => {
      const lucia = await onboardedUsuario(app);
      const intruder = await activeUsuario(app);

      await intruder.agent.put('/onboarding/fiscal-data').send(fiscalData(lucia.nif)).expect(409);

      const forIntruder = await intruder.agent.get('/onboarding').expect(200);
      expect(forIntruder.body.fiscalData).toBeNull();
      await intruder.agent.get('/emisor').expect(403);
    });
  });

  describe('logo', () => {
    async function withFiscalData() {
      const { agent } = await activeUsuario(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);
      return agent;
    }

    it('is stored and served back as uploaded', async () => {
      const agent = await withFiscalData();

      await agent.put('/emisor/logo').set('Content-Type', 'image/png').send(PNG).expect(200);

      const logo = await agent.get('/emisor/logo').expect(200);
      expect(logo.headers['content-type']).toBe('image/png');
      expect(Buffer.compare(logo.body as Buffer, PNG)).toBe(0);
      const state = await agent.get('/onboarding').expect(200);
      expect(state.body.hasLogo).toBe(true);
    });

    it('can be replaced and removed', async () => {
      const agent = await withFiscalData();
      await agent.put('/emisor/logo').set('Content-Type', 'image/png').send(PNG).expect(200);

      await agent.put('/emisor/logo').set('Content-Type', 'image/jpeg').send(JPEG).expect(200);
      const replaced = await agent.get('/emisor/logo').expect(200);
      expect(replaced.headers['content-type']).toBe('image/jpeg');

      await agent.delete('/emisor/logo').expect(200);
      await agent.get('/emisor/logo').expect(404);
      const state = await agent.get('/onboarding').expect(200);
      expect(state.body.hasLogo).toBe(false);
    });

    it('must really be a PNG or JPEG image', async () => {
      const agent = await withFiscalData();

      const response = await agent
        .put('/emisor/logo')
        .set('Content-Type', 'image/png')
        .send(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))
        .expect(415);

      expect(response.body.code).toBe('LOGO_INVALID');
    });

    it('rejects a file over 1 MB', async () => {
      const agent = await withFiscalData();
      const huge = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);

      await agent.put('/emisor/logo').set('Content-Type', 'image/png').send(huge).expect(413);
    });

    it('needs the fiscal data first', async () => {
      const { agent } = await activeUsuario(app);

      const response = await agent.put('/emisor/logo').set('Content-Type', 'image/png').send(PNG).expect(409);

      expect(response.body.code).toBe('ONBOARDING_STEP_PENDING');
    });
  });
});

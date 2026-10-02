import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeUsuario, signIn } from './access.js';
import {
  CURRENT_TERMS,
  DENTIST_DEFAULTS,
  fiscalData,
  onboardedUsuario,
} from './emisor.js';
import { createTestApp } from './test-app.js';

describe('Alta del Emisor', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts at the fiscal data for a new Usuario', async () => {
    const { agent } = await activeUsuario(app);

    const response = await agent.get('/onboarding').expect(200);

    expect(response.body).toEqual({
      step: 'fiscal-data',
      fiscalData: null,
      hasLogo: false,
      defaults: null,
      series: null,
      terms: null,
    });
  });

  describe('step 1: fiscal data', () => {
    it('creates the Emisor and moves on to the defaults', async () => {
      const { agent } = await activeUsuario(app);
      const data = fiscalData();

      const response = await agent
        .put('/onboarding/fiscal-data')
        .send({ ...data, nif: data.nif.toLowerCase(), email: 'lucia@example.com', iban: '' })
        .expect(200);

      expect(response.body).toMatchObject({
        step: 'defaults',
        fiscalData: { ...data, email: 'lucia@example.com', phone: null, iban: null },
      });
    });

    it('is resumed where it was left from a new sign-in', async () => {
      const { agent, email, secret } = await activeUsuario(app);
      const data = fiscalData();
      await agent.put('/onboarding/fiscal-data').send(data).expect(200);
      await agent.post('/auth/sign-out').expect(200);

      const again = await signIn(app, email, secret);
      const response = await again.get('/onboarding').expect(200);

      expect(response.body).toMatchObject({ step: 'defaults', fiscalData: data });
    });

    it('can be corrected before finishing the alta', async () => {
      const { agent } = await activeUsuario(app);
      const data = fiscalData();
      await agent.put('/onboarding/fiscal-data').send(data).expect(200);

      const response = await agent
        .put('/onboarding/fiscal-data')
        .send({ ...data, name: 'Lucía Ferrer i Albiol' })
        .expect(200);

      expect(response.body.fiscalData.name).toBe('Lucía Ferrer i Albiol');
    });

    it('rejects an invalid NIF', async () => {
      const { agent } = await activeUsuario(app);

      const response = await agent
        .put('/onboarding/fiscal-data')
        .send({ ...fiscalData(), nif: '12345678A' })
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(response.body.issues).toEqual([expect.objectContaining({ path: ['nif'] })]);
      const state = await agent.get('/onboarding').expect(200);
      expect(state.body.step).toBe('fiscal-data');
    });

    it('rejects a NIF that already belongs to another Emisor', async () => {
      const first = await activeUsuario(app);
      const second = await activeUsuario(app);
      const data = fiscalData();
      await first.agent.put('/onboarding/fiscal-data').send(data).expect(200);

      const response = await second.agent.put('/onboarding/fiscal-data').send(data).expect(409);

      expect(response.body.code).toBe('NIF_TAKEN');
    });
  });

  describe('step 2: defaults', () => {
    it('saves Exenta with its Supuesto de exención and moves on to the Serie', async () => {
      const { agent } = await activeUsuario(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);

      const response = await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(200);

      expect(response.body).toMatchObject({ step: 'serie', defaults: DENTIST_DEFAULTS });
    });

    it('can switch to a taxed IVA rate', async () => {
      const { agent } = await activeUsuario(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);
      await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(200);
      const taxed = { retencionIrpf: 7, iva: { kind: 'taxed', rate: 21 } };

      const response = await agent.put('/onboarding/defaults').send(taxed).expect(200);

      expect(response.body.defaults).toEqual(taxed);
    });

    it('needs the fiscal data first', async () => {
      const { agent } = await activeUsuario(app);

      const response = await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(409);

      expect(response.body.code).toBe('ONBOARDING_STEP_PENDING');
    });

    it('rejects a Retención de IRPF outside 15, 7 and none', async () => {
      const { agent } = await activeUsuario(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);

      await agent
        .put('/onboarding/defaults')
        .send({ ...DENTIST_DEFAULTS, retencionIrpf: 19 })
        .expect(400);
    });
  });

  describe('step 3: Serie', () => {
    async function atSerieStep() {
      const { agent } = await activeUsuario(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);
      await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(200);
      return agent;
    }

    it('confirms the prefixes of both Series and moves on to the terms', async () => {
      const agent = await atSerieStep();

      const response = await agent
        .post('/onboarding/serie')
        .send({ prefix: 'vq', rectificativaPrefix: 'vqr' })
        .expect(200);

      expect(response.body).toMatchObject({
        step: 'terms',
        series: { prefix: 'VQ', rectificativaPrefix: 'VQR' },
      });
    });

    it('cannot change once confirmed', async () => {
      const agent = await atSerieStep();
      await agent.post('/onboarding/serie').send({ prefix: 'F', rectificativaPrefix: 'R' }).expect(200);

      const response = await agent
        .post('/onboarding/serie')
        .send({ prefix: 'G', rectificativaPrefix: 'S' })
        .expect(409);

      expect(response.body.code).toBe('SERIE_ALREADY_CONFIRMED');
      const state = await agent.get('/onboarding').expect(200);
      expect(state.body.series).toEqual({ prefix: 'F', rectificativaPrefix: 'R' });
    });

    it('rejects the same prefix for ordinary invoices and rectificativas', async () => {
      const agent = await atSerieStep();

      await agent.post('/onboarding/serie').send({ prefix: 'F', rectificativaPrefix: 'F' }).expect(400);
    });

    it('needs the defaults first', async () => {
      const { agent } = await activeUsuario(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);

      const response = await agent
        .post('/onboarding/serie')
        .send({ prefix: 'F', rectificativaPrefix: 'R' })
        .expect(409);

      expect(response.body.code).toBe('ONBOARDING_STEP_PENDING');
    });
  });

  describe('step 4: terms', () => {
    async function atTermsStep() {
      const { agent } = await activeUsuario(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);
      await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(200);
      await agent.post('/onboarding/serie').send({ prefix: 'F', rectificativaPrefix: 'R' }).expect(200);
      return agent;
    }

    it('records the accepted versions with their date and completes the alta', async () => {
      const agent = await atTermsStep();
      const before = Date.now();

      const response = await agent.post('/onboarding/terms').send(CURRENT_TERMS).expect(200);

      expect(response.body).toMatchObject({ step: 'completed', terms: CURRENT_TERMS });
      const acceptedAt = Date.parse(response.body.terms.acceptedAt);
      expect(acceptedAt).toBeGreaterThanOrEqual(before - 1000);
      expect(acceptedAt).toBeLessThanOrEqual(Date.now() + 1000);
    });

    it('refuses versions that are not the current ones', async () => {
      const agent = await atTermsStep();

      const response = await agent
        .post('/onboarding/terms')
        .send({ ...CURRENT_TERMS, contratoEncargoVersion: '2020-01-01' })
        .expect(409);

      expect(response.body.code).toBe('LEGAL_VERSION_OUTDATED');
      const state = await agent.get('/onboarding').expect(200);
      expect(state.body).toMatchObject({ step: 'terms', terms: null });
    });

    it('needs the Serie first', async () => {
      const { agent } = await activeUsuario(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);
      await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(200);

      const response = await agent.post('/onboarding/terms').send(CURRENT_TERMS).expect(409);

      expect(response.body.code).toBe('ONBOARDING_STEP_PENDING');
    });
  });

  describe('the active Emisor', () => {
    it('is not reachable until the alta is complete', async () => {
      const { agent } = await activeUsuario(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);

      const response = await agent.get('/emisor').expect(403);

      expect(response.body.code).toBe('ONBOARDING_INCOMPLETE');
    });

    it('shows its name and NIF once the alta is complete', async () => {
      const { agent, nif } = await onboardedUsuario(app);

      const response = await agent.get('/emisor').expect(200);

      expect(response.body).toEqual({ name: 'Lucía Ferrer Albiol', nif });
    });
  });
});

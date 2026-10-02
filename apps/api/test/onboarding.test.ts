import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeUser, signIn } from './access.js';
import {
  CURRENT_TERMS,
  DENTIST_DEFAULTS,
  fiscalData,
  onboardedUser,
} from './issuer.js';
import { createTestApp } from './test-app.js';

describe('Issuer onboarding', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('starts at the fiscal data for a new user', async () => {
    const { agent } = await activeUser(app);

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
    it('creates the issuer and moves on to the defaults', async () => {
      const { agent } = await activeUser(app);
      const data = fiscalData();

      const response = await agent
        .put('/onboarding/fiscal-data')
        .send({ ...data, taxId: data.taxId.toLowerCase(), email: 'lucia@example.com', iban: '' })
        .expect(200);

      expect(response.body).toMatchObject({
        step: 'defaults',
        fiscalData: { ...data, email: 'lucia@example.com', phone: null, iban: null },
      });
    });

    it('is resumed where it was left from a new sign-in', async () => {
      const { agent, email, secret } = await activeUser(app);
      const data = fiscalData();
      await agent.put('/onboarding/fiscal-data').send(data).expect(200);
      await agent.post('/auth/sign-out').expect(200);

      const again = await signIn(app, email, secret);
      const response = await again.get('/onboarding').expect(200);

      expect(response.body).toMatchObject({ step: 'defaults', fiscalData: data });
    });

    it('can be corrected before finishing onboarding', async () => {
      const { agent } = await activeUser(app);
      const data = fiscalData();
      await agent.put('/onboarding/fiscal-data').send(data).expect(200);

      const response = await agent
        .put('/onboarding/fiscal-data')
        .send({ ...data, name: 'Lucía Ferrer i Albiol' })
        .expect(200);

      expect(response.body.fiscalData.name).toBe('Lucía Ferrer i Albiol');
    });

    it('rejects an invalid tax ID', async () => {
      const { agent } = await activeUser(app);

      const response = await agent
        .put('/onboarding/fiscal-data')
        .send({ ...fiscalData(), taxId: '12345678A' })
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(response.body.issues).toEqual([expect.objectContaining({ path: ['taxId'] })]);
      const state = await agent.get('/onboarding').expect(200);
      expect(state.body.step).toBe('fiscal-data');
    });

    it('rejects a tax ID that already belongs to another issuer', async () => {
      const first = await activeUser(app);
      const second = await activeUser(app);
      const data = fiscalData();
      await first.agent.put('/onboarding/fiscal-data').send(data).expect(200);

      const response = await second.agent.put('/onboarding/fiscal-data').send(data).expect(409);

      expect(response.body.code).toBe('TAX_ID_TAKEN');
    });
  });

  describe('step 2: defaults', () => {
    it('saves exempt with its exemption ground and moves on to the series', async () => {
      const { agent } = await activeUser(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);

      const response = await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(200);

      expect(response.body).toMatchObject({ step: 'series', defaults: DENTIST_DEFAULTS });
    });

    it('can switch to a taxed VAT rate', async () => {
      const { agent } = await activeUser(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);
      await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(200);
      const taxed = { withholding: 7, vat: { kind: 'taxed', rate: 21 } };

      const response = await agent.put('/onboarding/defaults').send(taxed).expect(200);

      expect(response.body.defaults).toEqual(taxed);
    });

    it('needs the fiscal data first', async () => {
      const { agent } = await activeUser(app);

      const response = await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(409);

      expect(response.body.code).toBe('ONBOARDING_STEP_PENDING');
    });

    it('rejects a withholding outside 15, 7 and none', async () => {
      const { agent } = await activeUser(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);

      await agent
        .put('/onboarding/defaults')
        .send({ ...DENTIST_DEFAULTS, withholding: 19 })
        .expect(400);
    });
  });

  describe('step 3: series', () => {
    async function atSeriesStep() {
      const { agent } = await activeUser(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);
      await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(200);
      return agent;
    }

    it('confirms the prefixes of both Series and moves on to the terms', async () => {
      const agent = await atSeriesStep();

      const response = await agent
        .post('/onboarding/series')
        .send({ prefix: 'vq', correctivePrefix: 'vqr' })
        .expect(200);

      expect(response.body).toMatchObject({
        step: 'terms',
        series: { prefix: 'VQ', correctivePrefix: 'VQR' },
      });
    });

    it('cannot change once confirmed', async () => {
      const agent = await atSeriesStep();
      await agent.post('/onboarding/series').send({ prefix: 'F', correctivePrefix: 'R' }).expect(200);

      const response = await agent
        .post('/onboarding/series')
        .send({ prefix: 'G', correctivePrefix: 'S' })
        .expect(409);

      expect(response.body.code).toBe('SERIES_ALREADY_CONFIRMED');
      const state = await agent.get('/onboarding').expect(200);
      expect(state.body.series).toEqual({ prefix: 'F', correctivePrefix: 'R' });
    });

    it('rejects the same prefix for ordinary invoices and corrective invoices', async () => {
      const agent = await atSeriesStep();

      await agent.post('/onboarding/series').send({ prefix: 'F', correctivePrefix: 'F' }).expect(400);
    });

    it('needs the defaults first', async () => {
      const { agent } = await activeUser(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);

      const response = await agent
        .post('/onboarding/series')
        .send({ prefix: 'F', correctivePrefix: 'R' })
        .expect(409);

      expect(response.body.code).toBe('ONBOARDING_STEP_PENDING');
    });
  });

  describe('step 4: terms', () => {
    async function atTermsStep() {
      const { agent } = await activeUser(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);
      await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(200);
      await agent.post('/onboarding/series').send({ prefix: 'F', correctivePrefix: 'R' }).expect(200);
      return agent;
    }

    it('records the accepted versions with their date and completes onboarding', async () => {
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
        .send({ ...CURRENT_TERMS, dataProcessingAgreementVersion: '2020-01-01' })
        .expect(409);

      expect(response.body.code).toBe('LEGAL_VERSION_OUTDATED');
      const state = await agent.get('/onboarding').expect(200);
      expect(state.body).toMatchObject({ step: 'terms', terms: null });
    });

    it('needs the series first', async () => {
      const { agent } = await activeUser(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);
      await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(200);

      const response = await agent.post('/onboarding/terms').send(CURRENT_TERMS).expect(409);

      expect(response.body.code).toBe('ONBOARDING_STEP_PENDING');
    });
  });

  describe('the active issuer', () => {
    it('is not reachable until onboarding is complete', async () => {
      const { agent } = await activeUser(app);
      await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);

      const response = await agent.get('/issuer').expect(403);

      expect(response.body.code).toBe('ONBOARDING_INCOMPLETE');
    });

    it('shows its name and tax ID once onboarding is complete', async () => {
      const { agent, taxId } = await onboardedUser(app);

      const response = await agent.get('/issuer').expect(200);

      expect(response.body).toEqual({ name: 'Lucía Ferrer Albiol', taxId });
    });
  });
});

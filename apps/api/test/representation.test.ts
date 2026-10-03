import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import { activeUser } from './access.js';
import { completeOnboarding, onboardedUser } from './issuer.js';
import { createTestApp, FakeMailer } from './test-app.js';

describe('Representation', () => {
  let app: INestApplication;
  const connector = new FakeVerifactuConnector();
  const mailer = new FakeMailer();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector, mailer });
  });

  afterAll(async () => {
    await app.close();
  });

  const keyCreations = (taxId: string) =>
    connector.calls.filter(
      (call) => call.operation === 'createIssuerKey' && (call.input as { taxId: string }).taxId === taxId,
    );

  const signings = (taxId: string) =>
    connector.calls.filter((call) => call.operation === 'startRepresentationSigning' && call.issuerId === issuerIdOf(taxId));

  const issuerIdOf = (taxId: string) => keyCreations(taxId)[0]!.issuerId;

  const signer = {
    firstName: 'Lucía',
    lastNames: 'Ferrer Albiol',
    street: 'Carrer de Colón',
    streetNumber: '12',
    municipality: 'València',
  };

  it('creates the issuer key at the connector once onboarding is complete', async () => {
    const { agent, taxId } = await onboardedUser(app);

    const response = await agent.get('/issuer/representation').expect(200);

    expect(response.body).toEqual({
      state: 'not-started',
      error: null,
      signingUrl: null,
      stale: false,
      canIssue: false,
    });
    expect(keyCreations(taxId)).toHaveLength(1);
  });

  it('creates the issuer key later if the connector did not answer when onboarding completed', async () => {
    const { agent } = await activeUser(app);
    connector.failNext({ kind: 'server-error' }, 'createIssuerKey');
    const { taxId } = await completeOnboarding(agent);

    const response = await agent.get('/issuer/representation').expect(200);
    await agent.get('/issuer/representation').expect(200);

    expect(response.body).toMatchObject({ state: 'not-started', stale: false });
    expect(keyCreations(taxId)).toHaveLength(2);
  });

  it('shows the last known state while the connector does not answer', async () => {
    const { agent } = await activeUser(app);
    connector.failNext({ kind: 'timeout' }, 'createIssuerKey');
    connector.failNext({ kind: 'server-error' }, 'createIssuerKey');
    await completeOnboarding(agent);

    const response = await agent.get('/issuer/representation').expect(200);

    expect(response.body).toMatchObject({ state: 'not-started', stale: true, canIssue: false });
  });

  it('shows an error while the connector refuses the issuer', async () => {
    const { agent } = await activeUser(app);
    const refusal = { kind: 'rejected', code: 'nif-not-registered', message: 'NIF no censado' } as const;
    connector.failNext(refusal, 'createIssuerKey');
    connector.failNext(refusal, 'createIssuerKey');
    await completeOnboarding(agent);

    const response = await agent.get('/issuer/representation').expect(200);

    expect(response.body).toMatchObject({ state: 'error', error: 'issuer-not-accepted', canIssue: false });
  });

  describe('signing', () => {
    it('starts the remote signing for the signed-in user', async () => {
      const { agent, email, taxId } = await onboardedUser(app);

      const response = await agent.post('/issuer/representation/signing').send(signer).expect(200);

      expect(response.body).toEqual({
        state: 'pending',
        error: null,
        signingUrl: expect.stringMatching(/^https:\/\//),
        stale: false,
        canIssue: false,
      });
      expect(signings(taxId).map((call) => call.input)).toEqual([{ ...signer, email }]);
    });

    it('enables issuing once the signer completes the signing', async () => {
      const { agent, taxId } = await onboardedUser(app);
      await agent.post('/issuer/representation/signing').send(signer).expect(200);
      const before = await agent.get('/issuer').expect(200);

      connector.signRepresentation(issuerIdOf(taxId));
      const response = await agent.get('/issuer/representation').expect(200);
      const after = await agent.get('/issuer').expect(200);

      expect(before.body.canIssue).toBe(false);
      expect(response.body).toMatchObject({ state: 'signed', signingUrl: null, canIssue: true });
      expect(after.body.canIssue).toBe(true);
    });

    it('does not start a second signing while one is pending', async () => {
      const { agent, taxId } = await onboardedUser(app);
      await agent.post('/issuer/representation/signing').send(signer).expect(200);

      const response = await agent.post('/issuer/representation/signing').send(signer).expect(409);

      expect(response.body.code).toBe('REPRESENTATION_IN_PLACE');
      expect(signings(taxId)).toHaveLength(1);
    });

    it('does not start a signing once signed', async () => {
      const { agent, taxId } = await onboardedUser(app);
      await agent.post('/issuer/representation/signing').send(signer).expect(200);
      connector.signRepresentation(issuerIdOf(taxId));

      const response = await agent.post('/issuer/representation/signing').send(signer).expect(409);

      expect(response.body.code).toBe('REPRESENTATION_IN_PLACE');
    });

    it.each(['rejected', 'expired', 'cancelled'] as const)(
      'shows the error when the signing ends %s, and can start again',
      async (outcome) => {
        const { agent, taxId } = await onboardedUser(app);
        await agent.post('/issuer/representation/signing').send(signer).expect(200);
        connector.signRepresentation(issuerIdOf(taxId), outcome);

        const failed = await agent.get('/issuer/representation').expect(200);
        const again = await agent.post('/issuer/representation/signing').send(signer).expect(200);

        expect(failed.body).toMatchObject({ state: 'error', error: outcome, signingUrl: null, canIssue: false });
        expect(again.body).toMatchObject({ state: 'pending', error: null });
        expect(signings(taxId)).toHaveLength(2);
      },
    );

    it('can be retried when the connector does not answer', async () => {
      const { agent } = await onboardedUser(app);
      connector.failNext({ kind: 'server-error' }, 'startRepresentationSigning');

      const unavailable = await agent.post('/issuer/representation/signing').send(signer).expect(503);
      const retried = await agent.post('/issuer/representation/signing').send(signer).expect(200);

      expect(unavailable.body.code).toBe('CONNECTOR_UNAVAILABLE');
      expect(retried.body.state).toBe('pending');
    });

    it('reports a refusal of the connector', async () => {
      const { agent } = await onboardedUser(app);
      connector.failNext({ kind: 'rejected', code: 'email', message: 'Email no válido' }, 'startRepresentationSigning');

      const response = await agent.post('/issuer/representation/signing').send(signer).expect(409);

      expect(response.body).toMatchObject({ code: 'CONNECTOR_REJECTED', message: 'Email no válido' });
      const state = await agent.get('/issuer/representation').expect(200);
      expect(state.body.state).toBe('not-started');
    });

    it('rejects an incomplete signer', async () => {
      const { agent, taxId } = await onboardedUser(app);

      const response = await agent
        .post('/issuer/representation/signing')
        .send({ ...signer, streetNumber: ' ' })
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_FAILED');
      expect(response.body.issues).toEqual([expect.objectContaining({ path: ['streetNumber'] })]);
      expect(signings(taxId)).toHaveLength(0);
    });
  });

  describe('resending the link', () => {
    it('emails the link of the pending signing again', async () => {
      const { agent, email } = await onboardedUser(app);
      const started = await agent.post('/issuer/representation/signing').send(signer).expect(200);

      await agent.post('/issuer/representation/resend').expect(200);

      const [sent] = mailer.to(email);
      expect(sent!.text).toContain(started.body.signingUrl);
    });

    it('needs a pending signing', async () => {
      const { agent, email } = await onboardedUser(app);

      const response = await agent.post('/issuer/representation/resend').expect(409);

      expect(response.body.code).toBe('REPRESENTATION_NOT_PENDING');
      expect(mailer.to(email)).toHaveLength(0);
    });
  });

  it('is not reachable before onboarding is complete', async () => {
    const { agent } = await activeUser(app);

    const response = await agent.get('/issuer/representation').expect(403);

    expect(response.body.code).toBe('ONBOARDING_INCOMPLETE');
  });
});

describe('Representation in an environment that needs none', () => {
  let app: INestApplication;
  const connector = new FakeVerifactuConnector();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector, representationRequired: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('lets the issuer issue without signing, with its key created', async () => {
    const { agent, taxId } = await onboardedUser(app);

    const representation = await agent.get('/issuer/representation').expect(200);
    const issuer = await agent.get('/issuer').expect(200);

    expect(representation.body).toEqual({
      state: 'not-required',
      error: null,
      signingUrl: null,
      stale: false,
      canIssue: true,
    });
    expect(issuer.body.canIssue).toBe(true);
    expect(connector.calls).toContainEqual(expect.objectContaining({ operation: 'createIssuerKey', input: expect.objectContaining({ taxId }) }));
  });

  it('never starts a signing', async () => {
    const { agent } = await onboardedUser(app);

    const response = await agent.post('/issuer/representation/signing').send({
      firstName: 'Lucía',
      lastNames: 'Ferrer Albiol',
      street: 'Carrer de Colón',
      streetNumber: '12',
      municipality: 'València',
    }).expect(409);

    expect(response.body.code).toBe('REPRESENTATION_NOT_REQUIRED');
    expect(connector.calls.filter((call) => call.operation === 'startRepresentationSigning')).toHaveLength(0);
  });
});

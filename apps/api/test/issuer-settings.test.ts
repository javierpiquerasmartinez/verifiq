import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import { activeUser } from './access.js';
import { DENTIST_DEFAULTS, fiscalData, onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp } from './test-app.js';

const clinic = (taxId = uniqueTaxId()) => ({
  name: 'Clínica Dental Ruzafa SL',
  taxId,
  address: 'Carrer de Sueca 21',
  postalCode: '46006',
  municipality: 'València',
  province: 'Valencia',
});

const exempt = { kind: 'exempt', ground: 'dentistry' } as const;

describe('Issuer settings', () => {
  let app: INestApplication;
  const connector = new FakeVerifactuConnector();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector });
  });

  afterAll(async () => {
    await app.close();
  });

  const newData = (taxId: string) => ({
    ...fiscalData(taxId),
    name: 'Lucía Ferrer Albiol SLP',
    address: 'Gran Via del Marqués del Túria 40',
    postalCode: '46005',
    email: 'lucia@example.com',
    phone: '+34 600 000 000',
    iban: 'ES91 2100 0418 4502 0005 1332',
  });

  it('edits the fiscal data: the header shows it at once', async () => {
    const { agent, taxId } = await onboardedUser(app);

    const response = await agent.put('/issuer/fiscal-data').send(newData(taxId)).expect(200);

    expect(response.body.fiscalData).toEqual({
      ...newData(taxId),
      iban: 'ES9121000418450200051332',
    });
    const header = await agent.get('/issuer').expect(200);
    expect(header.body).toMatchObject({ name: 'Lucía Ferrer Albiol SLP', taxId });
  });

  it('keeps the tax ID: the connector key and the Representation are bound to it', async () => {
    const { agent, taxId } = await onboardedUser(app);

    const response = await agent.put('/issuer/fiscal-data').send(newData(uniqueTaxId())).expect(200);

    expect(response.body.fiscalData.taxId).toBe(taxId);
    expect((await agent.get('/issuer').expect(200)).body.taxId).toBe(taxId);
  });

  it('edits the defaults; the series stays as confirmed', async () => {
    const { agent } = await onboardedUser(app);

    const response = await agent
      .put('/issuer/defaults')
      .send({ withholding: 7, vat: { kind: 'taxed', rate: 21 } })
      .expect(200);

    expect(response.body).toMatchObject({
      defaults: { withholding: 7, vat: { kind: 'taxed', rate: 21 } },
      series: { prefix: 'F', correctivePrefix: 'R' },
    });
    const onboarding = await agent.get('/onboarding').expect(200);
    expect(onboarding.body.defaults).toEqual({ withholding: 7, vat: { kind: 'taxed', rate: 21 } });
  });

  it('refuses invalid data', async () => {
    const { agent, taxId } = await onboardedUser(app);

    const fiscal = await agent
      .put('/issuer/fiscal-data')
      .send({ ...fiscalData(taxId), postalCode: '99999' })
      .expect(400);
    expect(fiscal.body.code).toBe('VALIDATION_FAILED');
    await agent.put('/issuer/defaults').send({ withholding: 19, vat: exempt }).expect(400);
  });

  it('is reachable only once onboarding is complete', async () => {
    const { agent } = await activeUser(app);
    await agent.put('/onboarding/fiscal-data').send(fiscalData()).expect(200);

    const response = await agent.put('/issuer/defaults').send(DENTIST_DEFAULTS).expect(403);
    expect(response.body.code).toBe('ONBOARDING_INCOMPLETE');
  });

  it('once onboarding is complete, its steps no longer change the issuer', async () => {
    const { agent, taxId } = await onboardedUser(app);

    const fiscal = await agent.put('/onboarding/fiscal-data').send(fiscalData(uniqueTaxId())).expect(409);
    expect(fiscal.body.code).toBe('ONBOARDING_COMPLETED');
    const defaults = await agent
      .put('/onboarding/defaults')
      .send({ withholding: 0, vat: { kind: 'taxed', rate: 21 } })
      .expect(409);
    expect(defaults.body.code).toBe('ONBOARDING_COMPLETED');

    const onboarding = await agent.get('/onboarding').expect(200);
    expect(onboarding.body).toMatchObject({ fiscalData: { taxId }, defaults: DENTIST_DEFAULTS });
  });

  it('changing the issuer data never alters issued invoices', async () => {
    const { agent, taxId } = await onboardedUser(app);
    await agent.get('/issuer/representation').expect(200);
    const { issuerId } = connector.calls.find(
      (call) => call.operation === 'createIssuerKey' && (call.input as { taxId: string }).taxId === taxId,
    )!;
    connector.signRepresentation(issuerId);
    await agent.get('/issuer/representation').expect(200);
    const recipient = clinic();
    connector.census.set(recipient.taxId, recipient.name);
    const { body: created } = await agent.post('/recipients').send(recipient).expect(201);
    const { body: draft } = await agent
      .post('/drafts')
      .send({
        recipientId: created.id,
        billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
        operationDescription: 'Servicios odontológicos agosto 2026',
        lines: [{ concept: 'Odontología conservadora', quantity: '1', unitPrice: '2340', vat: exempt }],
        withholding: 15,
      })
      .expect(201);
    const { body: invoice } = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);

    await agent.put('/issuer/fiscal-data').send(newData(taxId)).expect(200);
    await agent.put('/issuer/defaults').send({ withholding: 7, vat: { kind: 'taxed', rate: 21 } }).expect(200);

    const { body: issued } = await agent.get(`/invoices/${invoice.id}`).expect(200);
    expect(issued.issuer).toEqual({ ...fiscalData(taxId), email: null, phone: null, iban: null });
    expect(issued.withholding).toBe(15);
  });
});

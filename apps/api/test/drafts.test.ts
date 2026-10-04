import type { INestApplication } from '@nestjs/common';
import { todayInSpain } from '@verifiq/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import type { Agent } from './access.js';
import { onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp } from './test-app.js';

const exempt = { kind: 'exempt', ground: 'dentistry' } as const;
const mention =
  'Operación exenta de IVA en virtud del artículo 20.Uno.5º de la Ley 37/1992, del Impuesto sobre el Valor Añadido.';

const line = (concept: string, unitPrice: string, vat: object = exempt, extra: object = {}) => ({
  concept,
  quantity: '1',
  unitPrice,
  vat,
  ...extra,
});

/** A monthly invoice to a clinic, as the dentist prepares it. */
const monthlyDraft = (recipientId: string | null) => ({
  recipientId,
  billingPeriod: { start: '2026-09-01', end: '2026-09-30' },
  operationDescription: 'Servicios odontológicos septiembre 2026',
  lines: [line('Odontología conservadora', '2340'), line('Endodoncias', '1650'), line('Cirugía e implantología', '1150')],
  withholding: 15,
});

describe('Drafts', () => {
  let app: INestApplication;
  const connector = new FakeVerifactuConnector();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector });
  });

  afterAll(async () => {
    await app.close();
  });

  /** A recipient the census knows. */
  async function createRecipient(agent: Agent) {
    const data = {
      name: 'Clínica Dental Ruzafa SL',
      taxId: uniqueTaxId(),
      address: 'Carrer de Sueca 21',
      postalCode: '46006',
      municipality: 'València',
      province: 'Valencia',
    };
    connector.census.set(data.taxId, data.name);
    return (await agent.post('/recipients').send(data).expect(201)).body as { id: string; taxId: string };
  }

  it('creates a draft without number and reads it back with its amounts computed', async () => {
    const { agent } = await onboardedUser(app);
    const recipient = await createRecipient(agent);

    const created = await agent.post('/drafts').send(monthlyDraft(recipient.id)).expect(201);

    expect(created.body).toEqual({
      id: expect.any(String),
      recipient: {
        id: recipient.id,
        name: 'Clínica Dental Ruzafa SL',
        taxId: recipient.taxId,
        address: 'Carrer de Sueca 21',
        postalCode: '46006',
        municipality: 'València',
        province: 'Valencia',
        censusStatus: 'identified',
        archived: false,
      },
      billingPeriod: { start: '2026-09-01', end: '2026-09-30' },
      operationDate: '2026-09-30',
      operationDescription: 'Servicios odontológicos septiembre 2026',
      lines: monthlyDraft(null).lines,
      withholding: 15,
      issueDate: todayInSpain(),
      breakdown: {
        lines: [{ base: '2340.00' }, { base: '1650.00' }, { base: '1150.00' }],
        taxed: [],
        exempt: [{ ground: 'dentistry', base: '5140.00', mention }],
        taxBase: '5140.00',
        totalAmount: '5140.00',
        withholding: { rate: 15, amount: '771.00' },
        amountDue: '4369.00',
      },
      problems: [],
      updatedAt: expect.any(String),
    });
    expect(created.body).not.toHaveProperty('number');
    await agent.get(`/drafts/${created.body.id}`).expect(200, created.body);
  });

  it('saves a half-done draft, listing what it lacks to be issued', async () => {
    const { agent } = await onboardedUser(app);

    const response = await agent
      .post('/drafts')
      .send({ recipientId: null, billingPeriod: null, operationDescription: '', lines: [line('', '0')], withholding: 15 })
      .expect(201);

    expect(response.body).toMatchObject({
      recipient: null,
      billingPeriod: null,
      operationDate: null,
      breakdown: { taxBase: '0.00', totalAmount: '0.00', amountDue: '0.00' },
      problems: [
        { code: 'recipient-missing' },
        { code: 'operation-description-missing' },
        { code: 'line-concept-missing', line: 0 },
      ],
    });
  });

  it('edits a draft, replacing it whole and recomputing its amounts', async () => {
    const { agent } = await onboardedUser(app);
    const recipient = await createRecipient(agent);
    const { body: draft } = await agent.post('/drafts').send(monthlyDraft(null)).expect(201);

    const edited = {
      ...monthlyDraft(recipient.id),
      billingPeriod: { start: '2026-08-01', end: '2026-08-15' },
      operationDescription: 'Servicios odontológicos del 01/08/2026 al 15/08/2026',
      lines: [line('Endodoncias', '1000', exempt, { discountPercent: '10' }), line('Material', '50', { kind: 'taxed', rate: 21 })],
      withholding: 7,
    };
    const response = await agent.put(`/drafts/${draft.id}`).send(edited).expect(200);

    expect(response.body).toMatchObject({
      id: draft.id,
      recipient: { id: recipient.id },
      billingPeriod: edited.billingPeriod,
      operationDate: '2026-08-15',
      lines: edited.lines,
      withholding: 7,
      breakdown: { taxBase: '950.00', totalAmount: '960.50', withholding: { rate: 7, amount: '66.50' }, amountDue: '894.00' },
      problems: [],
    });
    await agent.get(`/drafts/${draft.id}`).expect(200, response.body);
  });

  it('deletes a draft: no number is ever burned', async () => {
    const { agent } = await onboardedUser(app);
    const { body: draft } = await agent.post('/drafts').send(monthlyDraft(null)).expect(201);

    await agent.delete(`/drafts/${draft.id}`).expect(204);

    await agent.get(`/drafts/${draft.id}`).expect(404);
    expect((await agent.get('/drafts').expect(200)).body).toEqual([]);
  });

  it('lists the drafts, the most recently edited first', async () => {
    const { agent } = await onboardedUser(app);
    const recipient = await createRecipient(agent);
    const { body: older } = await agent.post('/drafts').send(monthlyDraft(recipient.id)).expect(201);
    const { body: newer } = await agent.post('/drafts').send(monthlyDraft(null)).expect(201);
    await agent.put(`/drafts/${older.id}`).send(monthlyDraft(recipient.id)).expect(200);

    const response = await agent.get('/drafts').expect(200);

    expect(response.body).toEqual([
      {
        id: older.id,
        recipientName: 'Clínica Dental Ruzafa SL',
        operationDescription: 'Servicios odontológicos septiembre 2026',
        amountDue: '4369.00',
        updatedAt: expect.any(String),
      },
      expect.objectContaining({ id: newer.id, recipientName: null }),
    ]);
  });

  it("never shows, edits or deletes another issuer's drafts", async () => {
    const owner = await onboardedUser(app);
    const other = await onboardedUser(app);
    const { body: draft } = await owner.agent.post('/drafts').send(monthlyDraft(null)).expect(201);

    await other.agent.get(`/drafts/${draft.id}`).expect(404);
    await other.agent.put(`/drafts/${draft.id}`).send(monthlyDraft(null)).expect(404);
    await other.agent.delete(`/drafts/${draft.id}`).expect(404);
    expect((await other.agent.get('/drafts').expect(200)).body).toEqual([]);
    await owner.agent.get(`/drafts/${draft.id}`).expect(200);
  });

  it("refuses another issuer's recipient", async () => {
    const owner = await onboardedUser(app);
    const other = await onboardedUser(app);
    const recipient = await createRecipient(owner.agent);

    const response = await other.agent.post('/drafts').send(monthlyDraft(recipient.id)).expect(422);

    expect(response.body).toMatchObject({ code: 'DRAFT_RECIPIENT_NOT_FOUND' });
  });

  it.each([
    ['a period that ends before it starts', { billingPeriod: { start: '2026-09-30', end: '2026-09-01' } }],
    ['an impossible date', { billingPeriod: { start: '2026-02-01', end: '2026-02-30' } }],
    ['a VAT rate that does not exist', { lines: [line('Material', '50', { kind: 'taxed', rate: 12 })] }],
    ['an exempt line without its exemption ground', { lines: [line('Endodoncias', '50', { kind: 'exempt' })] }],
    ['an exemption ground outside the catalogue', { lines: [line('Endodoncias', '50', { kind: 'exempt', ground: 'medicina' })] }],
    ['a negative price', { lines: [line('Endodoncias', '-50')] }],
    ['a negative quantity', { lines: [{ ...line('Endodoncias', '50'), quantity: '-1' }] }],
    ['a price with more than 4 decimals', { lines: [line('Endodoncias', '50.12345')] }],
    ['a price as a number instead of a decimal string', { lines: [line('Endodoncias', 50 as unknown as string)] }],
    ['a discount over 100 %', { lines: [line('Endodoncias', '50', exempt, { discountPercent: '101' })] }],
    ['a withholding that does not exist', { withholding: 19 }],
    ['a description longer than the AEAT takes', { operationDescription: 'x'.repeat(501) }],
  ])('refuses %s', async (_case, change) => {
    const { agent } = await onboardedUser(app);

    const response = await agent
      .post('/drafts')
      .send({ ...monthlyDraft(null), ...change })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((await agent.get('/drafts').expect(200)).body).toEqual([]);
  });

  it('computes the amounts itself, ignoring any the web sends', async () => {
    const { agent } = await onboardedUser(app);

    const response = await agent
      .post('/drafts')
      .send({ ...monthlyDraft(null), breakdown: { amountDue: '1.00' }, amountDue: '1.00' })
      .expect(201);

    expect(response.body.breakdown.amountDue).toBe('4369.00');
  });

  it('computes mixed VAT the same way as the amounts domain: bases by rate, tax on each rate base, half-up', async () => {
    const { agent } = await onboardedUser(app);
    const taxed = (rate: number) => ({ kind: 'taxed', rate });

    const response = await agent
      .post('/drafts')
      .send({
        ...monthlyDraft(null),
        lines: [
          line('Revisiones', '33.3333', exempt, { quantity: '3' }),
          line('Férula', '10.05', taxed(21)),
          line('Férula', '10.05', taxed(21)),
          line('Libro', '19.99', taxed(4), { discountPercent: '12.5' }),
          line('Kit de higiene', '7.45', taxed(10), { quantity: '2.5' }),
          line('Muestra', '3', taxed(0)),
        ],
        withholding: 7,
      })
      .expect(201);

    expect(response.body.breakdown).toEqual({
      lines: [{ base: '100.00' }, { base: '10.05' }, { base: '10.05' }, { base: '17.49' }, { base: '18.63' }, { base: '3.00' }],
      taxed: [
        { rate: 21, base: '20.10', taxAmount: '4.22' },
        { rate: 10, base: '18.63', taxAmount: '1.86' },
        { rate: 4, base: '17.49', taxAmount: '0.70' },
        { rate: 0, base: '3.00', taxAmount: '0.00' },
      ],
      exempt: [{ ground: 'dentistry', base: '100.00', mention }],
      taxBase: '159.22',
      totalAmount: '166.00',
      withholding: { rate: 7, amount: '11.15' },
      amountDue: '154.85',
    });
  });

  it('keeps the drafts of a deleted recipient, without recipient', async () => {
    const { agent } = await onboardedUser(app);
    const recipient = await createRecipient(agent);
    const { body: draft } = await agent.post('/drafts').send(monthlyDraft(recipient.id)).expect(201);

    await agent.delete(`/recipients/${recipient.id}`).expect(204);

    const response = await agent.get(`/drafts/${draft.id}`).expect(200);
    expect(response.body).toMatchObject({ recipient: null, problems: [{ code: 'recipient-missing' }] });
  });

  it('flags a recipient whose tax ID the census could not confirm', async () => {
    const { agent } = await onboardedUser(app);
    connector.failNext({ kind: 'timeout', processed: false }, 'validateTaxId');
    const recipient = await createRecipient(agent);

    const response = await agent.post('/drafts').send(monthlyDraft(recipient.id)).expect(201);

    expect(response.body).toMatchObject({
      recipient: { censusStatus: 'unchecked' },
      problems: [{ code: 'recipient-unchecked' }],
    });
  });

  it('flags a recipient archived after the draft picked it', async () => {
    const { agent } = await onboardedUser(app);
    const recipient = await createRecipient(agent);
    const { body: draft } = await agent.post('/drafts').send(monthlyDraft(recipient.id)).expect(201);

    await agent.post(`/recipients/${recipient.id}/archive`).expect(200);

    const response = await agent.get(`/drafts/${draft.id}`).expect(200);
    expect(response.body).toMatchObject({ recipient: { archived: true }, problems: [{ code: 'recipient-archived' }] });
  });

  it('saves a billing period that has not ended yet, flagging it: the AEAT refuses a future operation date', async () => {
    const { agent } = await onboardedUser(app);
    const recipient = await createRecipient(agent);

    const response = await agent
      .post('/drafts')
      .send({ ...monthlyDraft(recipient.id), billingPeriod: { start: '2026-09-01', end: '2099-12-31' } })
      .expect(201);

    expect(response.body).toMatchObject({ operationDate: '2099-12-31', problems: [{ code: 'operation-date-in-future' }] });
  });

  it('can be prepared before the Representation is signed', async () => {
    const { agent } = await onboardedUser(app);
    expect((await agent.get('/issuer').expect(200)).body.canIssue).toBe(false);

    await agent.post('/drafts').send(monthlyDraft(null)).expect(201);
  });
});

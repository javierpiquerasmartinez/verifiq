import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { invoices, recipients } from '../src/database/schema.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import { activeUser, type Agent } from './access.js';
import { onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp } from './test-app.js';

const clinic = (taxId = uniqueTaxId()) => ({
  name: 'Clínica Dental Ruzafa SL',
  taxId,
  address: 'Carrer de Sueca 21',
  postalCode: '46006',
  municipality: 'València',
  province: 'Valencia',
});

describe('Recipients', () => {
  let app: INestApplication;
  let db: Database;
  const connector = new FakeVerifactuConnector();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector });
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  /** A recipient the census knows under its name. */
  const censused = (data = clinic()) => {
    connector.census.set(data.taxId, data.name);
    return data;
  };

  const create = async (agent: Agent, data = censused()) =>
    (await agent.post('/recipients').send(data).expect(201)).body as { id: string; taxId: string };

  const censusChecks = (taxId: string) =>
    connector.calls.filter(
      (call) => call.operation === 'validateTaxId' && (call.input as { taxId: string }).taxId === taxId,
    );

  /** Issuance arrives with issue 10: until then, an invoice row is enough to tie a recipient to it. */
  async function issueInvoiceTo(recipientId: string) {
    const [recipient] = await db.select().from(recipients).where(eq(recipients.id, recipientId));
    await db.insert(invoices).values({ issuerId: recipient!.issuerId, recipientId });
  }

  it('creates a recipient whose tax ID the census has under its name', async () => {
    const { agent } = await onboardedUser(app);
    const data = censused(clinic('B12345674'));

    const response = await agent.post('/recipients').send({ ...data, taxId: 'b 1234 5674' }).expect(201);

    expect(response.body).toEqual({
      ...data,
      taxId: 'B12345674',
      id: expect.any(String),
      censusStatus: 'identified',
      archived: false,
      hasInvoices: false,
    });
    await agent.get(`/recipients/${response.body.id}`).expect(200, response.body);
  });

  it('refuses a tax ID the census does not have, saving nothing', async () => {
    const { agent } = await onboardedUser(app);

    const response = await agent.post('/recipients').send(clinic()).expect(422);

    expect(response.body).toMatchObject({ code: 'TAX_ID_NOT_IN_CENSUS' });
    expect((await agent.get('/recipients').expect(200)).body).toEqual([]);
  });

  it('refuses a tax ID the census has under another name', async () => {
    const { agent } = await onboardedUser(app);
    const data = clinic();
    connector.census.set(data.taxId, 'Ruzafa Odontología SL');

    const response = await agent.post('/recipients').send(data).expect(422);

    expect(response.body).toMatchObject({ code: 'CENSUS_NAME_MISMATCH' });
  });

  it.each(['deregistered', 'revoked'] as const)('refuses a tax ID the census has %s', async (state) => {
    const { agent } = await onboardedUser(app);
    const data = censused();
    connector.inactiveTaxIds.set(data.taxId, state);

    const response = await agent.post('/recipients').send(data).expect(422);

    expect(response.body).toMatchObject({ code: 'TAX_ID_INACTIVE' });
  });

  it('refuses the tax ID when the connector refuses the census query, instead of leaving it unchecked', async () => {
    const { agent } = await onboardedUser(app);
    connector.failNext({ kind: 'rejected', code: 'vf-nif-formato', message: 'NIF mal formado' }, 'validateTaxId');

    const response = await agent.post('/recipients').send(censused()).expect(422);

    expect(response.body).toMatchObject({ code: 'CENSUS_REJECTED' });
    expect((await agent.get('/recipients').expect(200)).body).toEqual([]);
  });

  it('refuses an invalid tax ID without asking the census', async () => {
    const { agent } = await onboardedUser(app);

    const response = await agent.post('/recipients').send(clinic('B12345675')).expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(censusChecks('B12345675')).toHaveLength(0);
  });

  it('refuses foreign tax IDs: only Spanish ones are accepted', async () => {
    const { agent } = await onboardedUser(app);

    await agent.post('/recipients').send(clinic('FR40303265045')).expect(400);
  });

  it('saves the recipient unchecked while the census does not answer, and checks it on the next save', async () => {
    const { agent } = await onboardedUser(app);
    const data = censused();
    connector.failNext({ kind: 'timeout', processed: false }, 'validateTaxId');

    const created = await agent.post('/recipients').send(data).expect(201);
    const updated = await agent.put(`/recipients/${created.body.id}`).send(data).expect(200);

    expect(created.body.censusStatus).toBe('unchecked');
    expect(updated.body.censusStatus).toBe('identified');
  });

  it('edits a recipient, asking the census again only when its tax ID or name change', async () => {
    const { agent } = await onboardedUser(app);
    const data = censused();
    const { id } = await create(agent, data);

    await agent.put(`/recipients/${id}`).send({ ...data, address: 'Carrer de Cuba 3' }).expect(200);
    expect(censusChecks(data.taxId)).toHaveLength(1);

    const renamed = censused({ ...data, name: 'Clínica Dental Ruzafa SLP' });
    const response = await agent.put(`/recipients/${id}`).send({ ...renamed, address: 'Carrer de Cuba 3' }).expect(200);

    expect(censusChecks(data.taxId)).toHaveLength(2);
    expect(response.body).toMatchObject({ name: 'Clínica Dental Ruzafa SLP', address: 'Carrer de Cuba 3' });
  });

  it('keeps the saved data when an edit fails the census check', async () => {
    const { agent } = await onboardedUser(app);
    const data = censused();
    const { id } = await create(agent, data);

    await agent.put(`/recipients/${id}`).send({ ...data, taxId: uniqueTaxId() }).expect(422);

    expect((await agent.get(`/recipients/${id}`).expect(200)).body.taxId).toBe(data.taxId);
  });

  it('searches by name (ignoring accents and case), tax ID or municipality', async () => {
    const { agent } = await onboardedUser(app);
    const ruzafa = await create(agent);
    const benimaclet = await create(
      agent,
      censused({ ...clinic(), name: 'Centro Odontológico Benimaclet SL', municipality: 'Alboraia' }),
    );

    const names = async (q: string) =>
      ((await agent.get('/recipients').query({ q }).expect(200)).body as { id: string }[]).map((r) => r.id);

    expect(await names('CLINICA')).toEqual([ruzafa.id]);
    expect(await names('odontologico')).toEqual([benimaclet.id]);
    expect(await names(benimaclet.taxId.slice(0, 6))).toEqual([benimaclet.id]);
    expect(await names('alboraia')).toEqual([benimaclet.id]);
    expect(await names('%')).toEqual([]);
    expect(await names('')).toEqual([benimaclet.id, ruzafa.id]);
  });

  it('deletes a recipient that was never invoiced', async () => {
    const { agent } = await onboardedUser(app);
    const { id } = await create(agent);

    await agent.delete(`/recipients/${id}`).expect(204);

    await agent.get(`/recipients/${id}`).expect(404);
  });

  it('only archives a recipient with issued invoices: it leaves the list but can be restored', async () => {
    const { agent } = await onboardedUser(app);
    const { id } = await create(agent);
    await issueInvoiceTo(id);

    const refused = await agent.delete(`/recipients/${id}`).expect(409);
    expect(refused.body).toMatchObject({ code: 'RECIPIENT_HAS_INVOICES' });

    const archived = await agent.post(`/recipients/${id}/archive`).expect(200);
    expect(archived.body).toMatchObject({ archived: true, hasInvoices: true });
    expect((await agent.get('/recipients').expect(200)).body).toEqual([]);
    expect((await agent.get('/recipients').query({ status: 'archived' }).expect(200)).body).toEqual([archived.body]);

    const restored = await agent.post(`/recipients/${id}/restore`).expect(200);
    expect(restored.body).toMatchObject({ archived: false });
    expect((await agent.get('/recipients').expect(200)).body).toEqual([restored.body]);
  });

  it("never shows nor touches another issuer's recipients", async () => {
    const owner = await onboardedUser(app);
    const other = await onboardedUser(app);
    const data = censused();
    const { id } = await create(owner.agent, data);

    expect((await other.agent.get('/recipients').expect(200)).body).toEqual([]);
    await other.agent.get(`/recipients/${id}`).expect(404);
    await other.agent.put(`/recipients/${id}`).send(data).expect(404);
    await other.agent.post(`/recipients/${id}/archive`).expect(404);
    await other.agent.delete(`/recipients/${id}`).expect(404);

    expect((await owner.agent.get(`/recipients/${id}`).expect(200)).body).toMatchObject({ archived: false });
  });

  it('answers 404 to an id that is not one', async () => {
    const { agent } = await onboardedUser(app);

    const response = await agent.get('/recipients/not-a-uuid').expect(404);

    expect(response.body).toMatchObject({ code: 'RECIPIENT_NOT_FOUND' });
  });

  it('needs the issuer onboarding complete', async () => {
    const { agent } = await activeUser(app);

    await agent.get('/recipients').expect(403);
  });
});

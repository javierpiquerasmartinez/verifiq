import type { INestApplication } from '@nestjs/common';
import { draftLineFromCatalogItem, type CatalogItem } from '@verifiq/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { activeUser } from './access.js';
import { onboardedUser } from './issuer.js';
import { createTestApp } from './test-app.js';

const exempt = { kind: 'exempt', ground: 'dentistry' } as const;

const cleaning = () => ({ name: 'Limpieza dental', defaultUnitPrice: '45.5', defaultVat: exempt });

describe('Catalog items', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a catalog item and reads it back', async () => {
    const { agent } = await onboardedUser(app);

    const response = await agent
      .post('/catalog-items')
      .send({ ...cleaning(), name: '  Limpieza dental ' })
      .expect(201);

    expect(response.body).toEqual({ ...cleaning(), id: expect.any(String) });
    await agent.get(`/catalog-items/${response.body.id}`).expect(200, response.body);
  });

  it('takes a VAT rate instead of an exemption ground', async () => {
    const { agent } = await onboardedUser(app);
    const material = { name: 'Material de laboratorio', defaultUnitPrice: '12.3456', defaultVat: { kind: 'taxed', rate: 21 } };

    const response = await agent.post('/catalog-items').send(material).expect(201);

    expect(response.body).toEqual({ ...material, id: expect.any(String) });
  });

  it('lists the catalog items sorted by name', async () => {
    const { agent } = await onboardedUser(app);
    for (const name of ['Endodoncia', 'Cirugía e implantología', 'Odontología conservadora']) {
      await agent.post('/catalog-items').send({ ...cleaning(), name }).expect(201);
    }

    const response = await agent.get('/catalog-items').expect(200);

    expect(response.body.map((item: CatalogItem) => item.name)).toEqual([
      'Cirugía e implantología',
      'Endodoncia',
      'Odontología conservadora',
    ]);
  });

  it('edits a catalog item, replacing it whole', async () => {
    const { agent } = await onboardedUser(app);
    const { body: item } = await agent.post('/catalog-items').send(cleaning()).expect(201);
    const edited = { name: 'Limpieza con ultrasonidos', defaultUnitPrice: '60', defaultVat: { kind: 'taxed', rate: 10 } };

    const response = await agent.put(`/catalog-items/${item.id}`).send(edited).expect(200);

    expect(response.body).toEqual({ ...edited, id: item.id });
    await agent.get(`/catalog-items/${item.id}`).expect(200, response.body);
  });

  it('deletes a catalog item', async () => {
    const { agent } = await onboardedUser(app);
    const { body: item } = await agent.post('/catalog-items').send(cleaning()).expect(201);

    await agent.delete(`/catalog-items/${item.id}`).expect(204);

    await agent.get(`/catalog-items/${item.id}`).expect(404);
    expect((await agent.get('/catalog-items').expect(200)).body).toEqual([]);
  });

  it.each([
    ['a blank name', { name: ' ' }],
    ['a negative price', { defaultUnitPrice: '-45' }],
    ['a price that is not a decimal', { defaultUnitPrice: '45,5' }],
    ['an exempt VAT without exemption ground', { defaultVat: { kind: 'exempt' } }],
    ['an exemption ground outside the catalogue', { defaultVat: { kind: 'exempt', ground: 'medicine' } }],
  ])('refuses %s', async (_, change) => {
    const { agent } = await onboardedUser(app);

    const response = await agent.post('/catalog-items').send({ ...cleaning(), ...change }).expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('copies its values into a draft line, so editing or deleting it never changes the draft', async () => {
    const { agent } = await onboardedUser(app);
    const { body: item } = await agent.post('/catalog-items').send(cleaning()).expect(201);
    const { body: draft } = await agent
      .post('/drafts')
      .send({
        recipientId: null,
        billingPeriod: null,
        operationDescription: 'Servicios odontológicos septiembre 2026',
        lines: [draftLineFromCatalogItem(item)],
        withholding: 15,
      })
      .expect(201);
    expect(draft.lines).toEqual([{ concept: 'Limpieza dental', quantity: '1', unitPrice: '45.5', vat: exempt }]);

    await agent
      .put(`/catalog-items/${item.id}`)
      .send({ name: 'Limpieza con ultrasonidos', defaultUnitPrice: '60', defaultVat: { kind: 'taxed', rate: 21 } })
      .expect(200);
    await agent.get(`/drafts/${draft.id}`).expect(200, draft);

    await agent.delete(`/catalog-items/${item.id}`).expect(204);
    await agent.get(`/drafts/${draft.id}`).expect(200, draft);
  });

  it("never shows, edits or deletes another issuer's catalog items", async () => {
    const owner = await onboardedUser(app);
    const other = await onboardedUser(app);
    const { body: item } = await owner.agent.post('/catalog-items').send(cleaning()).expect(201);

    await other.agent.get(`/catalog-items/${item.id}`).expect(404);
    await other.agent.put(`/catalog-items/${item.id}`).send(cleaning()).expect(404);
    await other.agent.delete(`/catalog-items/${item.id}`).expect(404);
    expect((await other.agent.get('/catalog-items').expect(200)).body).toEqual([]);
    await owner.agent.get(`/catalog-items/${item.id}`).expect(200, item);
  });

  it('answers 404 for an id that is not a uuid', async () => {
    const { agent } = await onboardedUser(app);

    const response = await agent.get('/catalog-items/not-a-uuid').expect(404);

    expect(response.body).toMatchObject({ code: 'CATALOG_ITEM_NOT_FOUND' });
  });

  it('can be prepared before the Representation is signed', async () => {
    const { agent } = await onboardedUser(app);
    expect((await agent.get('/issuer').expect(200)).body.canIssue).toBe(false);

    await agent.post('/catalog-items').send(cleaning()).expect(201);
  });

  it('needs the issuer onboarding complete', async () => {
    const { agent } = await activeUser(app);

    await agent.get('/catalog-items').expect(403);
  });
});

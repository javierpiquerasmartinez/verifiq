import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { SubmissionWorker } from '../src/invoices/submission-worker.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import { activeOperator, activeUser, browser, PASSWORD, uniqueEmail, type Agent } from './access.js';
import { completeOnboarding, fiscalData, onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp, FakeMailer, WEB_ORIGIN } from './test-app.js';

const HOUR = 3_600_000;

/** The token at the end of an invitation's link. */
const tokenOf = (url: string) => new URL(url).pathname.replace('/invitation/', '');

describe('Operator panel', () => {
  let app: INestApplication;
  let db: Database;
  let worker: SubmissionWorker;
  let operator: Agent;
  const connector = new FakeVerifactuConnector();
  const mailer = new FakeMailer();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector, mailer });
    db = app.get<Database>(DATABASE);
    worker = app.get(SubmissionWorker);
    ({ agent: operator } = await activeOperator(app));
  });

  afterAll(async () => {
    await app.close();
  });

  const issuerIdOf = async (taxId: string) =>
    (await db.$client.query<{ id: string }>('SELECT id FROM issuers WHERE tax_id = $1', [taxId])).rows[0]!.id;

  /** An onboarded user whose Representation is signed: it can issue. */
  async function issuingUser() {
    const user = await onboardedUser(app);
    await user.agent.get('/issuer/representation').expect(200);
    const issuerId = await issuerIdOf(user.taxId);
    connector.signRepresentation(issuerId);
    await user.agent.get('/issuer/representation').expect(200);
    return { ...user, issuerId };
  }

  const recipient = () => ({
    name: `Clínica Dental Ruzafa ${uniqueTaxId()} SL`,
    taxId: uniqueTaxId(),
    address: 'Carrer de Sueca 21',
    postalCode: '46006',
    municipality: 'València',
    province: 'Valencia',
  });

  /** Issues an invoice to a new recipient and sends its record: it waits for the AEAT's verdict. */
  async function submittedInvoice(agent: Agent, { concept = 'Odontología conservadora', description = 'Servicios odontológicos agosto 2026' } = {}) {
    const data = recipient();
    connector.census.set(data.taxId, data.name);
    const { body: created } = await agent.post('/recipients').send(data).expect(201);
    const { body: draft } = await agent
      .post('/drafts')
      .send({
        recipientId: created.id,
        billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
        operationDescription: description,
        lines: [{ concept, quantity: '1', unitPrice: '2340', vat: { kind: 'exempt', ground: 'dentistry' } }],
        withholding: 15,
      })
      .expect(201);
    const { body: invoice } = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);
    await worker.runPending();
    const { rows } = await db.$client.query<{ id: string; connector_record_id: string }>(
      'SELECT id, connector_record_id FROM invoice_records WHERE invoice_id = $1',
      [invoice.id],
    );
    const record = rows[0]!;
    return { recipient: data, invoice, recordId: record.id, connectorRecordId: record.connector_record_id };
  }

  async function settle(connectorRecordId: string, status: 'accepted' | 'rejected', aeatError?: { code: string; message: string }) {
    connector.settle(connectorRecordId, status, { aeatError });
    const delivery = connector.resultsDelivery([connectorRecordId]);
    await request(app.getHttpServer()).post('/webhooks/verifactu').set(delivery.headers).send(delivery.body).expect(204);
  }

  /** Moves the Issuance of the record back in time, past the 24 h without verdict. */
  async function age(recordId: string, hours: number) {
    await db.$client.query(`UPDATE invoice_records SET created_at = now() - make_interval(hours => $2) WHERE id = $1`, [recordId, hours]);
  }

  const alertsOf = async (issuerId: string) =>
    ((await operator.get('/operator/alerts').expect(200)).body as { issuer: { id: string } }[]).filter(
      (alert) => alert.issuer.id === issuerId,
    );

  describe('the operator role', () => {
    it('is told apart from a user', async () => {
      const user = await activeUser(app);

      expect((await operator.get('/me').expect(200)).body.role).toBe('operator');
      expect((await user.agent.get('/me').expect(200)).body.role).toBe('user');
    });

    it('keeps the operator out of the business endpoints', async () => {
      for (const path of ['/onboarding', '/issuer', '/invoices', '/recipients', '/drafts', '/catalog-items']) {
        const response = await operator.get(path).expect(403);
        expect(response.body.code, path).toBe('ROLE_NOT_ALLOWED');
      }
      const created = await operator.put('/onboarding/fiscal-data').send(fiscalData()).expect(403);
      expect(created.body.code).toBe('ROLE_NOT_ALLOWED');
    });

    it('keeps users out of the panel', async () => {
      const { agent } = await onboardedUser(app);

      for (const path of ['/operator/issuers', '/operator/alerts', '/operator/invitations']) {
        const response = await agent.get(path).expect(403);
        expect(response.body.code, path).toBe('ROLE_NOT_ALLOWED');
      }
      await agent.post('/operator/invitations').send({ email: uniqueEmail() }).expect(403);
    });

    it('needs a session', async () => {
      await browser(app).get('/operator/issuers').expect(401);
    });
  });

  describe('invitations', () => {
    it('invites a user by email, with a link that works once', async () => {
      const email = uniqueEmail();

      const { body: created } = await operator.post('/operator/invitations').send({ email }).expect(201);

      expect(created).toMatchObject({ id: expect.any(String), email, status: 'pending', expiresAt: expect.any(String) });
      const url = new URL(created.url);
      expect(url.origin).toBe(WEB_ORIGIN);
      expect(mailer.to(email).at(-1)?.text).toContain(created.url);
      const token = tokenOf(created.url);
      const agent = browser(app);
      await agent.post(`/invitations/${token}/accept`).send({ name: 'Lucía Ferrer', password: PASSWORD }).expect(200);
      // Invitations from the panel are for users.
      expect((await agent.get('/auth/get-session').expect(200)).body.user.role).toBe('user');
    });

    it('lists invitations, newest first, with their status', async () => {
      const pending = uniqueEmail();
      const accepted = uniqueEmail();
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() - 8 * 24 * HOUR);
      const { body: expired } = await operator.post('/operator/invitations').send({ email: uniqueEmail() }).expect(201);
      vi.useRealTimers();
      const { body: used } = await operator.post('/operator/invitations').send({ email: accepted }).expect(201);
      await browser(app)
        .post(`/invitations/${tokenOf(used.url)}/accept`)
        .send({ name: 'Lucía Ferrer', password: PASSWORD })
        .expect(200);
      const { body: open } = await operator.post('/operator/invitations').send({ email: pending }).expect(201);

      const { body: list } = await operator.get('/operator/invitations').expect(200);

      const ids = list.map((invitation: { id: string }) => invitation.id);
      expect(ids.indexOf(open.id)).toBeLessThan(ids.indexOf(used.id));
      expect(ids.indexOf(used.id)).toBeLessThan(ids.indexOf(expired.id));
      const statusOf = (id: string) => list.find((invitation: { id: string }) => invitation.id === id)?.status;
      expect([statusOf(open.id), statusOf(used.id), statusOf(expired.id)]).toEqual(['pending', 'accepted', 'expired']);
      // The link is shown only when it is created.
      expect(list.find((invitation: { id: string }) => invitation.id === open.id)).not.toHaveProperty('url');
    });

    it('revokes a pending invitation: its link stops working', async () => {
      const { body: created } = await operator.post('/operator/invitations').send({ email: uniqueEmail() }).expect(201);
      const token = tokenOf(created.url);

      const { body: revoked } = await operator.post(`/operator/invitations/${created.id}/revoke`).expect(200);

      expect(revoked).toMatchObject({ id: created.id, status: 'revoked' });
      const shown = await browser(app).get(`/invitations/${token}`).expect(410);
      expect(shown.body.code).toBe('INVITATION_REVOKED');
      const accepted = await browser(app)
        .post(`/invitations/${token}/accept`)
        .send({ name: 'Lucía Ferrer', password: PASSWORD })
        .expect(410);
      expect(accepted.body.code).toBe('INVITATION_REVOKED');
    });

    it('cannot revoke an accepted invitation', async () => {
      const { body: created } = await operator.post('/operator/invitations').send({ email: uniqueEmail() }).expect(201);
      await browser(app)
        .post(`/invitations/${tokenOf(created.url)}/accept`)
        .send({ name: 'Lucía Ferrer', password: PASSWORD })
        .expect(200);

      const response = await operator.post(`/operator/invitations/${created.id}/revoke`).expect(409);

      expect(response.body.code).toBe('INVITATION_USED');
    });

    it('rejects an invalid email and an unknown invitation', async () => {
      await operator.post('/operator/invitations').send({ email: 'not-an-email' }).expect(400);
      await operator.post('/operator/invitations/8a3f8f0e-4a4b-4c5d-9e6f-0a1b2c3d4e5f/revoke').expect(404);
      await operator.post('/operator/invitations/not-a-uuid/revoke').expect(404);
    });
  });

  describe('issuers', () => {
    it('lists each issuer with its Representation, invoices and open incidents', async () => {
      const { agent, taxId, issuerId } = await issuingUser();
      const rejected = await submittedInvoice(agent);
      await settle(rejected.connectorRecordId, 'rejected', { code: '1100', message: 'NIF no identificado' });
      const accepted = await submittedInvoice(agent);
      await settle(accepted.connectorRecordId, 'accepted');

      const { body } = await operator.get('/operator/issuers').expect(200);

      expect(body.find((issuer: { id: string }) => issuer.id === issuerId)).toEqual({
        id: issuerId,
        name: fiscalData().name,
        taxId,
        onboardingCompleted: true,
        representation: { state: 'signed', error: null },
        invoiceCount: 2,
        openIncidents: 1,
      });
    });

    it('lists an issuer still onboarding', async () => {
      const { agent } = await activeUser(app);
      const taxId = uniqueTaxId();
      await agent.put('/onboarding/fiscal-data').send(fiscalData(taxId)).expect(200);

      const { body } = await operator.get('/operator/issuers').expect(200);

      expect(body.find((issuer: { taxId: string }) => issuer.taxId === taxId)).toMatchObject({
        onboardingCompleted: false,
        representation: { state: 'not-started', error: null },
        invoiceCount: 0,
        openIncidents: 0,
      });
    });

    it('shows a failed Representation with its reason', async () => {
      const { agent } = await activeUser(app);
      const { taxId } = await completeOnboarding(agent);
      await agent.get('/issuer/representation').expect(200);
      await db.$client.query(`UPDATE issuers SET representation_state = 'expired' WHERE tax_id = $1`, [taxId]);

      const { body } = await operator.get('/operator/issuers').expect(200);

      expect(body.find((issuer: { taxId: string }) => issuer.taxId === taxId).representation).toEqual({
        state: 'error',
        error: 'expired',
      });
    });
  });

  describe('alerts', () => {
    it('alerts of a record the AEAT rejected', async () => {
      const { agent, issuerId, taxId } = await issuingUser();
      const { invoice, recordId, connectorRecordId } = await submittedInvoice(agent);
      await settle(connectorRecordId, 'rejected', { code: '1100', message: 'NIF no identificado' });

      expect(await alertsOf(issuerId)).toEqual([
        {
          invoiceRecordId: recordId,
          kind: 'rejected',
          issuer: { id: issuerId, name: fiscalData().name, taxId },
          invoiceNumber: invoice.number,
          since: expect.any(String),
          aeatErrorCode: '1100',
        },
      ]);
    });

    it('alerts of a record unconfirmed 24 h after its Issuance', async () => {
      const { agent, issuerId } = await issuingUser();
      const stuck = await submittedInvoice(agent);
      const recent = await submittedInvoice(agent);
      await age(stuck.recordId, 25);
      await age(recent.recordId, 23);

      const alerts = await alertsOf(issuerId);

      expect(alerts).toEqual([
        expect.objectContaining({ invoiceRecordId: stuck.recordId, kind: 'unconfirmed', aeatErrorCode: null }),
      ]);
    });

    it('does not alert of an accepted record', async () => {
      const { agent, issuerId } = await issuingUser();
      const { recordId, connectorRecordId } = await submittedInvoice(agent);
      await age(recordId, 48);
      await settle(connectorRecordId, 'accepted');

      expect(await alertsOf(issuerId)).toEqual([]);
    });
  });

  it('no operator endpoint returns invoices, their lines or recipients', async () => {
    const { agent } = await issuingUser();
    const concept = 'Endodoncia molar 36 paciente R. G.';
    const description = 'Tratamientos de la consulta de Russafa';
    const rejected = await submittedInvoice(agent, { concept, description });
    await settle(rejected.connectorRecordId, 'rejected', {
      code: '1100',
      message: `El NIF ${rejected.recipient.taxId} de ${rejected.recipient.name} no está identificado`,
    });
    const stuck = await submittedInvoice(agent, { concept, description });
    await age(stuck.recordId, 30);

    const responses = await Promise.all(
      ['/operator/issuers', '/operator/alerts', '/operator/invitations'].map((path) => operator.get(path).expect(200)),
    );

    for (const { text } of responses) {
      for (const secret of [
        rejected.recipient.name,
        rejected.recipient.taxId,
        stuck.recipient.name,
        stuck.recipient.taxId,
        concept,
        description,
        rejected.invoice.id,
        stuck.invoice.id,
        // The amounts, as they travel.
        '2340.00',
        '1989.00',
      ]) {
        expect(text).not.toContain(secret);
      }
    }
  });
});

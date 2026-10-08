import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { SubmissionWorker } from '../src/invoices/submission-worker.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import { activeOperator, activeUser, browser, invite, PASSWORD, uniqueEmail, type Agent } from './access.js';
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

  /**
   * Issues an invoice to a new recipient and sends its record: it waits for the AEAT's verdict, or is
   * blocked if the connector `refuses` it.
   */
  async function submittedInvoice(
    agent: Agent,
    {
      concept = 'Odontología conservadora',
      description = 'Servicios odontológicos agosto 2026',
      refuses,
    }: { concept?: string; description?: string; refuses?: { code: string; message: string } } = {},
  ) {
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
    if (refuses) connector.failNext({ kind: 'rejected', ...refuses }, 'submitRecord');
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
    /** Starts every email of a test, so a search for it lists only that test's invitations. */
    const uniqueTag = () => `t${randomUUID().slice(0, 8)}`;

    const invitation = async (email = uniqueEmail()) =>
      (await operator.post('/operator/invitations').send({ email }).expect(201)).body as { id: string; url: string };

    /** An invitation sent `offset` ms from now (negative: in the past). */
    async function invitedAt(email: string, offset: number) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + offset);
      try {
        return await invitation(email);
      } finally {
        vi.useRealTimers();
      }
    }

    const accept = (invited: { url: string }) =>
      browser(app).post(`/invitations/${tokenOf(invited.url)}/accept`).send({ name: 'Lucía Ferrer', password: PASSWORD }).expect(200);

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

    it('lists invitations of every status, newest first', async () => {
      const tag = uniqueTag();
      const expired = await invitedAt(`${tag}-expired@example.com`, -8 * 24 * HOUR);
      const used = await invitation(`${tag}-accepted@example.com`);
      await accept(used);
      const revoked = await invitation(`${tag}-revoked@example.com`);
      await operator.post(`/operator/invitations/${revoked.id}/revoke`).expect(200);
      const open = await invitation(`${tag}-pending@example.com`);

      const { body: list } = await operator.get('/operator/invitations').query({ q: tag }).expect(200);

      expect(list.items.map((item: { id: string; status: string }) => [item.id, item.status])).toEqual([
        [open.id, 'pending'],
        [revoked.id, 'revoked'],
        [used.id, 'accepted'],
        [expired.id, 'expired'],
      ]);
      expect(list.nextCursor).toBeNull();
      // The link is shown only when it is created.
      expect(list.items[0]).not.toHaveProperty('url');
    });

    it('searches by email without case or accents, and filters by status with the counts of each', async () => {
      const tag = uniqueTag();
      await invitedAt(`${tag}-old@example.com`, -8 * 24 * HOUR);
      const jose = await invitation(`${tag}-jose@example.com`);
      const marta = await invitation(`${tag}-marta@example.com`);
      await operator.post(`/operator/invitations/${marta.id}/revoke`).expect(200);

      const { body: found } = await operator.get('/operator/invitations').query({ q: `${tag.toUpperCase()}-JOSÉ` }).expect(200);
      const { body: pending } = await operator.get('/operator/invitations').query({ q: tag, status: 'pending' }).expect(200);

      expect(found.items.map((item: { id: string }) => item.id)).toEqual([jose.id]);
      expect(found.counts).toEqual({ all: 1, pending: 1, accepted: 0, expired: 0, revoked: 0 });
      expect(pending.items.map((item: { id: string }) => item.id)).toEqual([jose.id]);
      // The counts are of the search, whatever the filter.
      expect(pending.counts).toEqual({ all: 3, pending: 1, accepted: 0, expired: 1, revoked: 1 });
    });

    it('sorts by when it was sent, when it expires or its email, and pages through all of them', async () => {
      const tag = uniqueTag();
      // Sent (ms from a base, a fraction below a millisecond), and expiring (hours from now).
      const plan = { a: [3.4, 1], b: [1, 3], c: [3.1, 2], d: [2, 4], e: [0, 5] } as const;
      const ids: Record<string, string> = {};
      for (const [name, [sent, expires]] of Object.entries(plan)) {
        const { id } = await invitation(`${tag}-${name}@example.com`);
        ids[name] = id;
        await db.$client.query(
          `UPDATE invitations SET created_at = '2026-10-01T09:00:00Z'::timestamptz + make_interval(secs => $2 / 1000.0),
             expires_at = now() + make_interval(hours => $3) WHERE id = $1`,
          [id, sent, expires],
        );
      }
      const nameOf = new Map(Object.entries(ids).map(([name, id]) => [id, name]));

      async function pages(query: Record<string, string>) {
        const names: string[] = [];
        let cursor: string | null = null;
        do {
          const { body }: { body: { items: { id: string }[]; nextCursor: string | null } } = await operator
            .get('/operator/invitations')
            .query({ ...query, q: tag, limit: '2', ...(cursor ? { cursor } : {}) })
            .expect(200);
          names.push(...body.items.map((item) => nameOf.get(item.id)!));
          cursor = body.nextCursor;
        } while (cursor);
        return names;
      }

      // a and c were sent in the same millisecond: either goes first, but always the same way.
      const newest = await pages({});
      expect(newest.slice(0, 2).sort()).toEqual(['a', 'c']);
      expect(newest.slice(2)).toEqual(['d', 'b', 'e']);
      expect(await pages({ sort: 'sent', order: 'asc' })).toEqual(['e', 'b', 'd', ...newest.slice(0, 2).reverse()]);
      expect(await pages({ sort: 'expires', order: 'asc' })).toEqual(['a', 'c', 'b', 'd', 'e']);
      expect(await pages({ sort: 'expires', order: 'desc' })).toEqual(['e', 'd', 'b', 'c', 'a']);
      expect(await pages({ sort: 'email', order: 'asc' })).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(await pages({ sort: 'email', order: 'desc', status: 'pending' })).toEqual(['e', 'd', 'c', 'b', 'a']);
    });

    it('rejects a query it does not understand', async () => {
      for (const query of [{ status: 'gone' }, { sort: 'name' }, { order: 'up' }, { limit: '0' }, { cursor: 'not-a-cursor' }]) {
        const response = await operator.get('/operator/invitations').query(query).expect(400);
        expect(response.body.code, JSON.stringify(query)).toBe('VALIDATION_FAILED');
      }
    });

    it('leaves the operator invitations out', async () => {
      const email = `${uniqueTag()}-operator@example.com`;
      await invite(app, email, 'operator');

      const { body: list } = await operator.get('/operator/invitations').query({ q: email }).expect(200);

      expect(list.items).toEqual([]);
      expect(list.counts.all).toBe(0);
    });

    it('shows when an invitation was accepted or revoked, and the issuer its user onboarded', async () => {
      const onboarded = await onboardedUser(app);
      const tag = uniqueTag();
      const unfinished = await invitation(`${tag}-unfinished@example.com`);
      await accept(unfinished);
      const revoked = await invitation(`${tag}-revoked@example.com`);
      await operator.post(`/operator/invitations/${revoked.id}/revoke`).expect(200);

      const { body: mine } = await operator.get('/operator/invitations').query({ q: onboarded.email }).expect(200);
      const { body: list } = await operator.get('/operator/invitations').query({ q: tag }).expect(200);

      expect(mine.items).toEqual([
        expect.objectContaining({
          status: 'accepted',
          acceptedAt: expect.any(String),
          revokedAt: null,
          issuer: { id: await issuerIdOf(onboarded.taxId), name: fiscalData().name, taxId: onboarded.taxId },
        }),
      ]);
      const byId = new Map(list.items.map((item: { id: string }) => [item.id, item]));
      // Its user has not onboarded an issuer yet.
      expect(byId.get(unfinished.id)).toMatchObject({ status: 'accepted', acceptedAt: expect.any(String), issuer: null });
      expect(byId.get(revoked.id)).toMatchObject({ status: 'revoked', acceptedAt: null, revokedAt: expect.any(String), issuer: null });
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
        onboardingCompletedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
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
        onboardingCompletedAt: null,
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
          errorCode: '1100',
        },
      ]);
    });

    it('alerts of a record the connector blocked, with its code', async () => {
      const { agent, issuerId } = await issuingUser();
      const { invoice, recordId } = await submittedInvoice(agent, {
        refuses: { code: 'recipient-not-in-census', message: 'El NIF/NOMBRE no está registrado' },
      });

      expect(await alertsOf(issuerId)).toEqual([
        expect.objectContaining({
          invoiceRecordId: recordId,
          kind: 'blocked',
          invoiceNumber: invoice.number,
          since: expect.any(String),
          errorCode: 'recipient-not-in-census',
        }),
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
        expect.objectContaining({ invoiceRecordId: stuck.recordId, kind: 'unconfirmed', errorCode: null }),
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
    const { agent, email } = await issuingUser();
    const concept = 'Endodoncia molar 36 paciente R. G.';
    const description = 'Tratamientos de la consulta de Russafa';
    const rejected = await submittedInvoice(agent, { concept, description });
    await settle(rejected.connectorRecordId, 'rejected', {
      code: '1100',
      message: `El NIF ${rejected.recipient.taxId} de ${rejected.recipient.name} no está identificado`,
    });
    const stuck = await submittedInvoice(agent, { concept, description });
    await age(stuck.recordId, 30);
    const blocked = await submittedInvoice(agent, {
      concept,
      description,
      refuses: { code: 'recipient-not-in-census', message: `El NIF/NOMBRE (${concept}) no está registrado` },
    });

    const responses = await Promise.all(
      [
        '/operator/issuers',
        '/operator/alerts',
        '/operator/invitations',
        // The user's own invitation, which names its issuer.
        `/operator/invitations?q=${encodeURIComponent(email)}`,
      ].map((path) => operator.get(path).expect(200)),
    );
    expect(responses.at(-1)!.body.items).toEqual([expect.objectContaining({ email, issuer: expect.any(Object) })]);

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
        blocked.recipient.name,
        blocked.recipient.taxId,
        blocked.invoice.id,
        // The amounts, as they travel.
        '2340.00',
        '1989.00',
      ]) {
        expect(text).not.toContain(secret);
      }
    }
  });
});

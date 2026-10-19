import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { SUBMISSION_ATTEMPTS } from '../src/invoices/submission-queue.js';
import { SubmissionWorker } from '../src/invoices/submission-worker.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import { signWebhookBody } from '../src/verifactu/webhook-signature.js';
import type { Agent } from './access.js';
import { onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp, FakeMailer } from './test-app.js';

const OPERATOR_EMAIL = 'operator@verifiq.test';

const draftTo = (recipientId: string) => ({
  recipientId,
  billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
  operationDescription: 'Servicios odontológicos agosto 2026',
  lines: [{ concept: 'Odontología conservadora', quantity: '1', unitPrice: '2340', vat: { kind: 'exempt', ground: 'dentistry' } }],
  withholding: 15,
});

/** Each test raises its own kind of alert: the operator gets at most one email an hour of each. The archive's are in its own tests. */
describe('Operator alerts', () => {
  let app: INestApplication;
  let db: Database;
  let worker: SubmissionWorker;
  const connector = new FakeVerifactuConnector();
  const mailer = new FakeMailer();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector, mailer, operatorEmail: OPERATOR_EMAIL });
    db = app.get<Database>(DATABASE);
    worker = app.get(SubmissionWorker);
  });

  afterAll(async () => {
    await app.close();
  });

  const alerts = () => mailer.to(OPERATOR_EMAIL);
  const deliver = (delivery: { headers: Record<string, string>; body: string }) =>
    request(app.getHttpServer()).post('/webhooks/verifactu').set(delivery.headers).send(delivery.body);

  const issuerIdOf = (taxId: string) =>
    connector.calls.find((call) => call.operation === 'createIssuerKey' && (call.input as { taxId: string }).taxId === taxId)!
      .issuerId;

  async function issuingUser() {
    const user = await onboardedUser(app);
    await user.agent.get('/issuer/representation').expect(200);
    const issuerId = issuerIdOf(user.taxId);
    connector.signRepresentation(issuerId);
    await user.agent.get('/issuer/representation').expect(200);
    return { ...user, issuerId };
  }

  /** Issues an invoice; its record waits to be sent. */
  async function pendingRecord(agent: Agent) {
    const recipient = { name: 'Clínica Dental Ruzafa SL', taxId: uniqueTaxId(), address: 'Carrer de Sueca 21', postalCode: '46006', municipality: 'València', province: 'Valencia' };
    connector.census.set(recipient.taxId, recipient.name);
    const { body: created } = await agent.post('/recipients').send(recipient).expect(201);
    const { body: draft } = await agent.post('/drafts').send(draftTo(created.id)).expect(201);
    const { body: invoice } = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);
    const { rows } = await db.$client.query<{ id: string }>('SELECT id FROM invoice_records WHERE invoice_id = $1', [invoice.id]);
    return rows[0]!.id;
  }

  describe('a record that keeps failing to be sent', () => {
    it('alerts the operator at its fifth failed attempt, not before, and when it is given up', async () => {
      const { agent } = await issuingUser();
      const recordId = await pendingRecord(agent);
      const sent = () => alerts().filter((email) => email.text.includes(recordId));

      for (let attempt = 1; attempt <= 4; attempt++) {
        connector.failNext({ kind: 'server-error' }, 'submitRecord');
        await expect(worker.attempt(recordId, attempt)).rejects.toThrow();
      }
      expect(sent()).toEqual([]);

      connector.failNext({ kind: 'server-error' }, 'submitRecord');
      await expect(worker.attempt(recordId, 5)).rejects.toThrow();
      expect(sent()).toEqual([expect.objectContaining({ subject: expect.stringContaining('no consigue enviarse') })]);
      expect(sent()[0]!.text).toContain('Error interno del servidor.');

      connector.failNext({ kind: 'server-error' }, 'submitRecord');
      await expect(worker.attempt(recordId, SUBMISSION_ATTEMPTS)).rejects.toThrow();
      expect(sent()).toHaveLength(2);
      expect(sent()[1]!.subject).toContain('dejado de reintentarse');
    });
  });

  describe('results webhook', () => {
    it('alerts of deliveries with a bad signature, once an hour', async () => {
      const body = JSON.stringify([]);
      const forged = { headers: { 'content-type': 'application/json', 'x-webhook-id': 'forged', 'x-webhook-signature': 'f'.repeat(64) }, body };

      await deliver(forged).expect(401);
      await deliver(forged).expect(401);

      expect(alerts().filter((email) => email.subject.includes('firma'))).toHaveLength(1);
    });

    it('alerts of a delivery it could not process, and answers 500 so the connector retries it', async () => {
      const body = 'not json';
      const delivery = {
        headers: { 'content-type': 'text/plain', 'x-webhook-id': 'broken', 'x-webhook-signature': signWebhookBody(connector.webhookSecret, body) },
        body,
      };

      await deliver(delivery).expect(500);

      expect(alerts().filter((email) => email.subject.includes('no se pudo procesar'))).toEqual([
        expect.objectContaining({ text: expect.stringContaining('broken') }),
      ]);
    });
  });
});

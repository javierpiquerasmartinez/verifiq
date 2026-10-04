import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findAuditEvents } from '../src/audit/audit.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { RecordStatusPoller } from '../src/invoices/record-status-poller.js';
import { SubmissionWorker } from '../src/invoices/submission-worker.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import type { Agent } from './access.js';
import { onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp, FakeMailer } from './test-app.js';

const OPERATOR_EMAIL = 'operator@verifiq.test';
const MINUTE = 60_000;

const draftTo = (recipientId: string) => ({
  recipientId,
  billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
  operationDescription: 'Servicios odontológicos agosto 2026',
  lines: [{ concept: 'Odontología conservadora', quantity: '1', unitPrice: '2340', vat: { kind: 'exempt', ground: 'dentistry' } }],
  withholding: 15,
});

describe('AEAT confirmation', () => {
  let app: INestApplication;
  let db: Database;
  let worker: SubmissionWorker;
  let poller: RecordStatusPoller;
  const connector = new FakeVerifactuConnector();
  const mailer = new FakeMailer();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector, mailer, operatorEmail: OPERATOR_EMAIL });
    db = app.get<Database>(DATABASE);
    worker = app.get(SubmissionWorker);
    poller = app.get(RecordStatusPoller);
  });

  afterAll(async () => {
    await app.close();
  });

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

  /** Issues an invoice and sends its record: it waits for the AEAT's verdict. */
  async function submittedInvoice(agent: Agent) {
    const recipient = { name: 'Clínica Dental Ruzafa SL', taxId: uniqueTaxId(), address: 'Carrer de Sueca 21', postalCode: '46006', municipality: 'València', province: 'Valencia' };
    connector.census.set(recipient.taxId, recipient.name);
    const { body: created } = await agent.post('/recipients').send(recipient).expect(201);
    const { body: draft } = await agent.post('/drafts').send(draftTo(created.id)).expect(201);
    const { body: invoice } = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);
    await worker.runPending();
    const { rows } = await db.$client.query<{ id: string; connector_record_id: string }>(
      'SELECT id, connector_record_id FROM invoice_records WHERE invoice_id = $1',
      [invoice.id],
    );
    return { invoiceId: invoice.id as string, connectorRecordId: rows[0]!.connector_record_id, recordId: rows[0]!.id };
  }

  const deliver = (delivery: { headers: Record<string, string>; body: string }) =>
    request(app.getHttpServer()).post('/webhooks/verifactu').set(delivery.headers).send(delivery.body);

  const recordOf = async (agent: Agent, invoiceId: string) =>
    (await agent.get(`/invoices/${invoiceId}`).expect(200)).body.record;

  describe('webhook', () => {
    it('marks the record accepted, with when and the AEAT registration code', async () => {
      const { agent } = await issuingUser();
      const { invoiceId, connectorRecordId } = await submittedInvoice(agent);
      connector.settle(connectorRecordId, 'accepted', { registrationCode: 'A-YYRC9W7S2JX4QBQ' });

      await deliver(connector.resultsDelivery([connectorRecordId])).expect(204);

      expect(await recordOf(agent, invoiceId)).toMatchObject({
        status: 'accepted',
        confirmedAt: expect.any(String),
        registrationCode: 'A-YYRC9W7S2JX4QBQ',
        aeatError: null,
        unconfirmed: false,
      });
    });

    it('marks the record accepted with errors, keeping the AEAT message', async () => {
      const { agent } = await issuingUser();
      const { invoiceId, connectorRecordId } = await submittedInvoice(agent);
      const aeatError = { code: '2000', message: 'El cálculo de la huella no es correcto.' };
      connector.settle(connectorRecordId, 'accepted-with-errors', { aeatError });

      await deliver(connector.resultsDelivery([connectorRecordId])).expect(204);

      expect(await recordOf(agent, invoiceId)).toMatchObject({
        status: 'accepted-with-errors',
        confirmedAt: expect.any(String),
        aeatError,
      });
    });

    it('marks the record rejected, keeping the AEAT reason', async () => {
      const { agent } = await issuingUser();
      const { invoiceId, connectorRecordId } = await submittedInvoice(agent);
      const aeatError = { code: '1100', message: 'El NIF del destinatario no está identificado.' };
      connector.settle(connectorRecordId, 'rejected', { aeatError });

      await deliver(connector.resultsDelivery([connectorRecordId])).expect(204);

      expect(await recordOf(agent, invoiceId)).toMatchObject({
        status: 'rejected',
        confirmedAt: expect.any(String),
        registrationCode: null,
        aeatError,
      });
    });

    it('settles every record a delivery carries', async () => {
      const { agent } = await issuingUser();
      const first = await submittedInvoice(agent);
      const second = await submittedInvoice(agent);
      connector.settle(first.connectorRecordId, 'accepted');
      connector.settle(second.connectorRecordId, 'rejected', { aeatError: { code: '1100', message: 'NIF no identificado.' } });

      await deliver(connector.resultsDelivery([first.connectorRecordId, second.connectorRecordId])).expect(204);

      expect((await recordOf(agent, first.invoiceId)).status).toBe('accepted');
      expect((await recordOf(agent, second.invoiceId)).status).toBe('rejected');
    });

    it('leaves a record still pending at the AEAT as it was', async () => {
      const { agent } = await issuingUser();
      const { invoiceId, connectorRecordId } = await submittedInvoice(agent);

      await deliver(connector.resultsDelivery([connectorRecordId])).expect(204);

      expect(await recordOf(agent, invoiceId)).toMatchObject({ status: 'submitted', confirmedAt: null });
    });

    it('refuses a delivery whose signature is not valid, changing nothing', async () => {
      const { agent } = await issuingUser();
      const { invoiceId, connectorRecordId } = await submittedInvoice(agent);
      connector.settle(connectorRecordId, 'accepted');
      const delivery = connector.resultsDelivery([connectorRecordId]);

      await deliver({ ...delivery, headers: { ...delivery.headers, 'x-webhook-signature': 'f'.repeat(64) } }).expect(401);
      await deliver(connector.resultsDelivery([connectorRecordId], { secret: 'another-secret' })).expect(401);
      await deliver({ ...delivery, headers: { ...delivery.headers, 'x-webhook-signature': '' } }).expect(401);
      // The signature covers the body exactly as it arrived.
      await deliver({ ...delivery, body: `${delivery.body} ` }).expect(401);

      expect((await recordOf(agent, invoiceId)).status).toBe('submitted');
    });

    it('ignores a delivery it already received (same webhook id)', async () => {
      const { agent, issuerId } = await issuingUser();
      const first = await submittedInvoice(agent);
      const second = await submittedInvoice(agent);
      connector.settle(first.connectorRecordId, 'accepted');
      const delivery = connector.resultsDelivery([first.connectorRecordId]);
      await deliver(delivery).expect(204);

      // A retry of the same delivery, even one that now carried another record, is answered and ignored.
      await deliver(delivery).expect(204);
      connector.settle(second.connectorRecordId, 'accepted');
      await deliver(connector.resultsDelivery([second.connectorRecordId], { webhookId: delivery.headers['x-webhook-id'] })).expect(204);

      expect((await recordOf(agent, second.invoiceId)).status).toBe('submitted');
      const accepted = (await findAuditEvents(db, issuerId)).filter((event) => event.action === 'invoice-record-accepted');
      expect(accepted).toHaveLength(1);
    });

    it('records the verdict in the audit log, as the system', async () => {
      const { agent, issuerId } = await issuingUser();
      const { invoiceId, connectorRecordId, recordId } = await submittedInvoice(agent);
      connector.settle(connectorRecordId, 'rejected', { aeatError: { code: '1100', message: 'NIF no identificado.' } });

      await deliver(connector.resultsDelivery([connectorRecordId])).expect(204);

      const events = await findAuditEvents(db, issuerId);
      expect(events.at(-1)).toMatchObject({
        action: 'invoice-record-rejected',
        actorUserId: null,
        subjectId: invoiceId,
        details: { invoiceRecordId: recordId, source: 'webhook', aeatError: { code: '1100', message: 'NIF no identificado.' } },
      });
    });
  });

  describe('polling', () => {
    it('asks the connector for records sent more than 10 minutes ago and settles them', async () => {
      const { agent } = await issuingUser();
      const { invoiceId, connectorRecordId } = await submittedInvoice(agent);
      connector.settle(connectorRecordId, 'accepted');

      // Too recent: the webhook usually arrives first.
      await poller.pollOnce(new Date(Date.now() + 5 * MINUTE));
      expect((await recordOf(agent, invoiceId)).status).toBe('submitted');

      await poller.pollOnce(new Date(Date.now() + 11 * MINUTE));

      expect(await recordOf(agent, invoiceId)).toMatchObject({ status: 'accepted', confirmedAt: expect.any(String) });
    });

    it('leaves records still pending at the AEAT, and those the connector cannot answer for now', async () => {
      const { agent } = await issuingUser();
      const pending = await submittedInvoice(agent);
      const unreachable = await submittedInvoice(agent);
      connector.settle(unreachable.connectorRecordId, 'accepted');
      connector.failNext({ kind: 'server-error' }, 'recordStatus');

      await poller.pollOnce(new Date(Date.now() + 11 * MINUTE));

      expect((await recordOf(agent, pending.invoiceId)).status).toBe('submitted');
      // Its turn was the one that failed, unless the pending one went first: either way, the next poll settles it.
      await poller.pollOnce(new Date(Date.now() + 11 * MINUTE));
      expect((await recordOf(agent, unreachable.invoiceId)).status).toBe('accepted');
    });

    it('does not ask again about records already settled', async () => {
      const { agent, issuerId } = await issuingUser();
      const { connectorRecordId } = await submittedInvoice(agent);
      connector.settle(connectorRecordId, 'accepted');
      await deliver(connector.resultsDelivery([connectorRecordId])).expect(204);
      const asked = () => connector.calls.filter((call) => call.operation === 'recordStatus' && call.issuerId === issuerId);

      await poller.pollOnce(new Date(Date.now() + 11 * MINUTE));

      expect(asked()).toEqual([]);
    });
  });

  describe('records unconfirmed for more than 24 h', () => {
    async function ageRecord(recordId: string, hours: number) {
      await db.$client.query(`UPDATE invoice_records SET created_at = now() - make_interval(hours => $2) WHERE id = $1`, [recordId, hours]);
    }

    it('warn the user on the invoice', async () => {
      const { agent } = await issuingUser();
      const { invoiceId, recordId } = await submittedInvoice(agent);
      expect((await recordOf(agent, invoiceId)).unconfirmed).toBe(false);

      await ageRecord(recordId, 25);

      expect(await recordOf(agent, invoiceId)).toMatchObject({ status: 'submitted', unconfirmed: true });
    });

    it('alert the operator by email, once', async () => {
      const { agent } = await issuingUser();
      const { recordId } = await submittedInvoice(agent);
      const { rows } = await db.$client.query<{ number: string }>(
        `SELECT i.series || lpad(i.number::text, 4, '0') AS number FROM invoices i JOIN invoice_records r ON r.invoice_id = i.id WHERE r.id = $1`,
        [recordId],
      );
      await ageRecord(recordId, 25);
      const alerts = () => mailer.to(OPERATOR_EMAIL).filter((email) => email.text.includes(recordId));

      await poller.pollOnce(new Date());
      await poller.pollOnce(new Date());

      expect(alerts()).toHaveLength(1);
      expect(alerts()[0]!.text).toContain(rows[0]!.number);
    });

    it('stop warning once the AEAT answers', async () => {
      const { agent } = await issuingUser();
      const { invoiceId, connectorRecordId, recordId } = await submittedInvoice(agent);
      await ageRecord(recordId, 25);
      connector.settle(connectorRecordId, 'accepted');

      await deliver(connector.resultsDelivery([connectorRecordId])).expect(204);

      expect(await recordOf(agent, invoiceId)).toMatchObject({ status: 'accepted', unconfirmed: false });
    });
  });

  describe('history', () => {
    it('lists the invoice events with date, time and actor', async () => {
      const { agent } = await issuingUser();
      const { invoiceId, connectorRecordId } = await submittedInvoice(agent);
      connector.settle(connectorRecordId, 'accepted');
      await deliver(connector.resultsDelivery([connectorRecordId])).expect(204);

      const { body } = await agent.get(`/invoices/${invoiceId}`).expect(200);

      expect(body.history).toEqual([
        { event: 'issued', occurredAt: expect.any(String), actor: 'Lucía Ferrer' },
        { event: 'submitted', occurredAt: expect.any(String), actor: null },
        { event: 'pdf-generated', occurredAt: expect.any(String), actor: null },
        { event: 'accepted', occurredAt: expect.any(String), actor: null },
      ]);
      const times = body.history.map((entry: { occurredAt: string }) => Date.parse(entry.occurredAt));
      expect(times).toEqual([...times].sort((a, b) => a - b));
    });
  });
});

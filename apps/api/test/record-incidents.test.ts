import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findAuditEvents } from '../src/audit/audit.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { SubmissionWorker } from '../src/invoices/submission-worker.js';
import { FakeVerifactuConnector, type FakeVerdict } from '../src/verifactu/fake-connector.js';
import type { Agent } from './access.js';
import { onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp, InMemoryObjectStorage } from './test-app.js';

/** Fails the next stored file, as an unavailable object storage would. */
class FlakyObjectStorage extends InMemoryObjectStorage {
  failNextPut = false;

  override async put(...args: Parameters<InMemoryObjectStorage['put']>): Promise<void> {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new Error('Object storage unavailable');
    }
    await super.put(...args);
  }
}

const clinic = (taxId = uniqueTaxId()) => ({
  name: 'Clínica Dental Ruzafa SL',
  taxId,
  address: 'Carrer de Sueca 21',
  postalCode: '46006',
  municipality: 'València',
  province: 'Valencia',
});

const draftTo = (recipientId: string) => ({
  recipientId,
  billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
  operationDescription: 'Servicios odontológicos agosto 2026',
  lines: [{ concept: 'Odontología conservadora', quantity: '1', unitPrice: '2340', vat: { kind: 'exempt', ground: 'dentistry' } }],
  withholding: 15,
});

describe('Record incidents', () => {
  let app: INestApplication;
  let worker: SubmissionWorker;
  let db: Database;
  const connector = new FakeVerifactuConnector();
  const storage = new FlakyObjectStorage();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector, storage });
    worker = app.get(SubmissionWorker);
    db = app.get<Database>(DATABASE);
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
    connector.signRepresentation(issuerIdOf(user.taxId));
    await user.agent.get('/issuer/representation').expect(200);
    return user;
  }

  /** Issues an invoice to a new clinic in the census. Its record waits in the outbox. */
  async function issuedInvoice(agent: Agent) {
    const recipient = clinic();
    connector.census.set(recipient.taxId, recipient.name);
    const { body: created } = await agent.post('/recipients').send(recipient).expect(201);
    const { body: draft } = await agent.post('/drafts').send(draftTo(created.id)).expect(201);
    const { body: invoice } = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);
    return { invoice, recipient: created as ReturnType<typeof clinic> & { id: string } };
  }

  const deliver = (delivery: { headers: Record<string, string>; body: string }) =>
    request(app.getHttpServer()).post('/webhooks/verifactu').set(delivery.headers).send(delivery.body).expect(204);

  /** The connector's id of the invoice's latest record, once queued. */
  async function connectorRecordIdOf(invoiceId: string): Promise<string> {
    const { rows } = await db.$client.query<{ connector_record_id: string }>(
      'SELECT connector_record_id FROM invoice_records WHERE invoice_id = $1 ORDER BY created_at DESC LIMIT 1',
      [invoiceId],
    );
    return rows[0]!.connector_record_id;
  }

  /** The AEAT gives the invoice's latest record its verdict, through the webhook. */
  async function settle(invoiceId: string, verdict: FakeVerdict, aeatError?: { code: string; message: string }) {
    const connectorRecordId = await connectorRecordIdOf(invoiceId);
    connector.settle(connectorRecordId, verdict, { aeatError });
    await deliver(connector.resultsDelivery([connectorRecordId]));
  }

  const invoiceOf = async (agent: Agent, id: string) => (await agent.get(`/invoices/${id}`).expect(200)).body;

  describe('blocked', () => {
    it('explains the refusal in plain language, on the invoice and among the incidents', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      connector.failNext({ kind: 'rejected', code: 'recipient-not-in-census', message: 'El NIF/NOMBRE (B1/X) no está registrado' }, 'submitRecord');
      await worker.runPending();

      const explanation =
        'Hacienda no reconoce el NIF o el nombre del cliente. Corrígelos en su ficha: el nombre debe coincidir con el que figura en Hacienda.';
      expect((await invoiceOf(agent, invoice.id)).record).toMatchObject({
        status: 'blocked',
        rejection: { code: 'recipient-not-in-census', message: 'El NIF/NOMBRE (B1/X) no está registrado', explanation },
      });
      const { body: incidents } = await agent.get('/invoices/incidents').expect(200);
      expect(incidents).toEqual([expect.objectContaining({ id: invoice.id, recordStatus: 'blocked', message: explanation })]);
    });

    it('retries with the same number once the user corrects the data of the copy', async () => {
      const { agent } = await issuingUser();
      const { invoice, recipient } = await issuedInvoice(agent);
      connector.failNext({ kind: 'rejected', code: 'recipient-not-in-census', message: 'NIF/NOMBRE no registrado' }, 'submitRecord');
      await worker.runPending();

      // The user fixes the clinic's tax ID in its profile, then corrects and retries.
      const fixed = clinic(uniqueTaxId());
      connector.census.set(fixed.taxId, fixed.name);
      await agent.put(`/recipients/${recipient.id}`).send(fixed).expect(200);
      await agent
        .post(`/invoices/${invoice.id}/resubmission`)
        .send({ operationDescription: 'Servicios odontológicos agosto 2026 (clínica)' })
        .expect(201);
      await worker.runPending();

      const retried = await invoiceOf(agent, invoice.id);
      expect(retried).toMatchObject({
        number: invoice.number,
        issueDate: invoice.issueDate,
        recipient: { taxId: fixed.taxId },
        operationDescription: 'Servicios odontológicos agosto 2026 (clínica)',
        record: { status: 'submitted', verificationUrl: expect.any(String), rejection: null },
        pdf: { version: 1 },
      });
      const submissions = connector.calls.filter((call) => call.operation === 'submitRecord').slice(-2);
      expect(submissions.map((call) => (call.input as { invoice: { recipient: { taxId: string } } }).invoice.recipient.taxId)).toEqual([
        recipient.taxId,
        fixed.taxId,
      ]);
    });
  });

  describe('rejected', () => {
    it('sends the corrected copy again as an Amendment of a rejected record, with the same number and a new PDF', async () => {
      const { agent } = await issuingUser();
      const { invoice, recipient } = await issuedInvoice(agent);
      await worker.runPending();
      await settle(invoice.id, 'rejected', { code: '1100', message: 'El NIF del destinatario no está identificado.' });

      const fixed = clinic(uniqueTaxId());
      connector.census.set(fixed.taxId, fixed.name);
      await agent.put(`/recipients/${recipient.id}`).send(fixed).expect(200);
      await agent
        .post(`/invoices/${invoice.id}/resubmission`)
        .send({ operationDescription: invoice.operationDescription })
        .expect(201);
      await worker.runPending();

      const amendment = connector.calls.filter((call) => call.operation === 'amendRecord').at(-1)!;
      expect(amendment.input).toMatchObject({
        previousRejection: 'record',
        invoice: { series: expect.any(String), recipient: { taxId: fixed.taxId } },
      });
      expect(await invoiceOf(agent, invoice.id)).toMatchObject({
        number: invoice.number,
        recipient: { taxId: fixed.taxId },
        record: { status: 'submitted', amendment: true, aeatError: null },
        pdf: { version: 2 },
      });

      await settle(invoice.id, 'accepted');
      expect((await invoiceOf(agent, invoice.id)).record).toMatchObject({ status: 'accepted', amendment: true });
    });

    it('says a previous Amendment was rejected when the invoice had reached the AEAT', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      await worker.runPending();
      await settle(invoice.id, 'accepted-with-errors', { code: '2004', message: 'La descripción no es adecuada.' });
      await agent.post(`/invoices/${invoice.id}/resubmission`).send({ operationDescription: 'Servicios odontológicos' }).expect(201);
      await worker.runPending();
      await settle(invoice.id, 'rejected', { code: '1100', message: 'Valor no permitido.' });

      await agent.post(`/invoices/${invoice.id}/resubmission`).send({ operationDescription: 'Servicios odontológicos 2026' }).expect(201);
      await worker.runPending();

      expect(connector.calls.filter((call) => call.operation === 'amendRecord').at(-1)!.input).toMatchObject({
        previousRejection: 'amendment',
      });
    });
  });

  describe('accepted with errors', () => {
    it('amends the record without a previous rejection', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      await worker.runPending();
      await settle(invoice.id, 'accepted-with-errors', { code: '2004', message: 'La descripción no es adecuada.' });

      await agent
        .post(`/invoices/${invoice.id}/resubmission`)
        .send({ operationDescription: 'Servicios odontológicos de agosto de 2026' })
        .expect(201);
      await worker.runPending();

      expect(connector.calls.filter((call) => call.operation === 'amendRecord').at(-1)!.input).toMatchObject({
        previousRejection: 'none',
        invoice: { operationDescription: 'Servicios odontológicos de agosto de 2026' },
      });
      expect(await invoiceOf(agent, invoice.id)).toMatchObject({
        operationDescription: 'Servicios odontológicos de agosto de 2026',
        record: { status: 'submitted', amendment: true },
        pdf: { version: 2 },
      });
    });
  });

  describe('audit', () => {
    it('records who corrected what and sent it again, and shows it in the history', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      connector.failNext({ kind: 'rejected', code: 'invalid-character', message: 'Carácter no válido' }, 'submitRecord');
      await worker.runPending();

      await agent.post(`/invoices/${invoice.id}/resubmission`).send({ operationDescription: 'Servicios odontológicos' }).expect(201);
      await worker.runPending();

      const issuerId = (await db.$client.query<{ issuer_id: string }>('SELECT issuer_id FROM invoices WHERE id = $1', [invoice.id]))
        .rows[0]!.issuer_id;
      const resubmitted = (await findAuditEvents(db, issuerId)).find((event) => event.action === 'invoice-record-resubmitted');
      expect(resubmitted).toMatchObject({
        actorUserId: expect.any(String),
        subjectId: invoice.id,
        details: {
          previousRecordStatus: 'blocked',
          operation: 'submission',
          changes: { operationDescription: { before: 'Servicios odontológicos agosto 2026', after: 'Servicios odontológicos' } },
        },
      });
      expect((await invoiceOf(agent, invoice.id)).history.map(({ event }: { event: string }) => event)).toEqual([
        'issued',
        'blocked',
        'resubmitted',
        'submitted',
        'pdf-generated',
      ]);
    });
  });

  describe('guards', () => {
    it('sends the record again once, however many times the user asks at once', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      connector.failNext({ kind: 'rejected', code: 'invalid-character', message: 'Carácter no válido' }, 'submitRecord');
      await worker.runPending();

      const statuses = (
        await Promise.all(
          [1, 2].map(() => agent.post(`/invoices/${invoice.id}/resubmission`).send({ operationDescription: 'Servicios odontológicos' })),
        )
      ).map(({ status }) => status);
      await worker.runPending();

      expect(statuses.sort()).toEqual([201, 409]);
      expect((await invoiceOf(agent, invoice.id)).history.filter(({ event }: { event: string }) => event === 'resubmitted')).toHaveLength(1);
    });

    it("never draws the corrected copy with an earlier record's QR", async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      // The record is sent, but its PDF cannot be stored: its job is left for a retry.
      storage.failNextPut = true;
      await worker.runPending();
      await settle(invoice.id, 'rejected', { code: '1100', message: 'Valor no permitido.' });
      const { rows } = await db.$client.query<{ id: string }>('SELECT id FROM invoice_records WHERE invoice_id = $1', [invoice.id]);
      await agent.post(`/invoices/${invoice.id}/resubmission`).send({ operationDescription: 'Servicios odontológicos' }).expect(201);

      // The first record's job is retried before the new record is sent.
      await worker.submit(rows[0]!.id);
      expect((await invoiceOf(agent, invoice.id)).pdf).toBeNull();

      await worker.runPending();
      expect((await invoiceOf(agent, invoice.id)).pdf).toEqual({ version: 1 });
    });

    it('refuses to send again a record without an incident', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      await worker.runPending();

      await agent
        .post(`/invoices/${invoice.id}/resubmission`)
        .send({ operationDescription: 'Otra descripción' })
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('INVOICE_NOT_RESUBMITTABLE'));
      expect((await invoiceOf(agent, invoice.id)).operationDescription).toBe('Servicios odontológicos agosto 2026');
    });

    it("refuses while the recipient's tax ID is not confirmed in the census", async () => {
      const { agent } = await issuingUser();
      const { invoice, recipient } = await issuedInvoice(agent);
      connector.failNext({ kind: 'rejected', code: 'recipient-not-in-census', message: 'NIF/NOMBRE no registrado' }, 'submitRecord');
      await worker.runPending();
      // The census does not answer when the user saves the new tax ID: it stays unchecked.
      connector.failNext({ kind: 'server-error' }, 'validateTaxId');
      await agent.put(`/recipients/${recipient.id}`).send(clinic(uniqueTaxId())).expect(200);

      await agent
        .post(`/invoices/${invoice.id}/resubmission`)
        .send({ operationDescription: invoice.operationDescription })
        .expect(422)
        .expect(({ body }) => expect(body.code).toBe('INVOICE_RECIPIENT_NOT_READY'));
    });

    it("never lets a user send again another issuer's invoice", async () => {
      const owner = await issuingUser();
      const { invoice } = await issuedInvoice(owner.agent);
      connector.failNext({ kind: 'rejected', code: 'invalid-character', message: 'Carácter no válido' }, 'submitRecord');
      await worker.runPending();
      const other = await issuingUser();

      await other.agent.post(`/invoices/${invoice.id}/resubmission`).send({ operationDescription: 'X' }).expect(404);
    });
  });
});

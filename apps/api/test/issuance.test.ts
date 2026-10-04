import type { INestApplication } from '@nestjs/common';
import { todayInSpain } from '@verifiq/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findAuditEvents } from '../src/audit/audit.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { SubmissionWorker } from '../src/invoices/submission-worker.js';
import type { RecordSubmission } from '../src/verifactu/connector.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import type { Agent } from './access.js';
import { onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp } from './test-app.js';

const exempt = { kind: 'exempt', ground: 'dentistry' } as const;
const year = todayInSpain().slice(0, 4);
const numbered = (n: number) => `F${year}-${String(n).padStart(4, '0')}`;

const line = (concept: string, unitPrice: string, vat: object = exempt) => ({ concept, quantity: '1', unitPrice, vat });

/** A monthly invoice to a clinic, ready to be issued. */
const monthlyDraft = (recipientId: string | null) => ({
  recipientId,
  billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
  operationDescription: 'Servicios odontológicos agosto 2026',
  lines: [line('Odontología conservadora', '2340'), line('Endodoncias', '1650'), line('Material', '100', { kind: 'taxed', rate: 21 })],
  withholding: 15,
});

const clinic = (taxId = uniqueTaxId()) => ({
  name: 'Clínica Dental Ruzafa SL',
  taxId,
  address: 'Carrer de Sueca 21',
  postalCode: '46006',
  municipality: 'València',
  province: 'Valencia',
});

describe('Issuance', () => {
  let app: INestApplication;
  let db: Database;
  let worker: SubmissionWorker;
  const connector = new FakeVerifactuConnector();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector });
    db = app.get<Database>(DATABASE);
    worker = app.get(SubmissionWorker);
  });

  afterAll(async () => {
    await app.close();
  });

  const issuerIdOf = (taxId: string) =>
    connector.calls.find((call) => call.operation === 'createIssuerKey' && (call.input as { taxId: string }).taxId === taxId)!
      .issuerId;

  /** An onboarded issuer whose Representation is signed: it can issue. */
  async function issuingUser() {
    const user = await onboardedUser(app);
    await user.agent.get('/issuer/representation').expect(200);
    const issuerId = issuerIdOf(user.taxId);
    connector.signRepresentation(issuerId);
    await user.agent.get('/issuer/representation').expect(200);
    return { ...user, issuerId };
  }

  async function createRecipient(agent: Agent, data = clinic()) {
    connector.census.set(data.taxId, data.name);
    return (await agent.post('/recipients').send(data).expect(201)).body as { id: string; taxId: string };
  }

  async function readyDraft(agent: Agent) {
    const recipient = await createRecipient(agent);
    const { body: draft } = await agent.post('/drafts').send(monthlyDraft(recipient.id)).expect(201);
    return { recipient, draft: draft as { id: string } };
  }

  async function issue(agent: Agent) {
    const { draft, recipient } = await readyDraft(agent);
    const { body: invoice } = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);
    return { invoice, recipient, draft };
  }

  const submissionsOf = (issuerId: string) =>
    connector.calls
      .filter((call) => call.operation === 'submitRecord' && call.issuerId === issuerId)
      .map((call) => call.input as RecordSubmission);

  it('issues a draft: assigns the first number of the series and freezes a copy', async () => {
    const { agent, taxId } = await issuingUser();
    const { draft, recipient } = await readyDraft(agent);
    await agent.get('/invoices/next-number').expect(200, { number: numbered(1) });

    const response = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);

    expect(response.body).toEqual({
      id: expect.any(String),
      number: numbered(1),
      issueDate: todayInSpain(),
      status: 'issued',
      record: { status: 'pending-submission', verificationUrl: null, rejection: null },
      pdf: null,
      issuer: {
        name: 'Lucía Ferrer Albiol',
        taxId,
        address: 'Carrer de Colón 12, 3º 2ª',
        postalCode: '46004',
        municipality: 'València',
        province: 'Valencia',
        email: null,
        phone: null,
        iban: null,
      },
      recipient: clinic(recipient.taxId),
      billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
      operationDate: '2026-08-31',
      operationDescription: 'Servicios odontológicos agosto 2026',
      lines: monthlyDraft(null).lines,
      withholding: 15,
      breakdown: expect.objectContaining({
        taxBase: '4090.00',
        totalAmount: '4111.00',
        withholding: { rate: 15, amount: '613.50' },
        amountDue: '3497.50',
      }),
      issuedAt: expect.any(String),
    });
    await agent.get(`/invoices/${response.body.id}`).expect(200, response.body);
    // The draft became the invoice.
    await agent.get(`/drafts/${draft.id}`).expect(404);
    await agent.get('/invoices/next-number').expect(200, { number: numbered(2) });
  });

  it('numbers the invoices of a series correlatively', async () => {
    const { agent } = await issuingUser();

    const numbers = [];
    for (let i = 0; i < 3; i++) numbers.push((await issue(agent)).invoice.number);

    expect(numbers).toEqual([numbered(1), numbered(2), numbered(3)]);
  });

  it('numbers simultaneous issuances in the same series without gaps or duplicates', async () => {
    const { agent } = await issuingUser();
    const drafts = await Promise.all(Array.from({ length: 8 }, () => readyDraft(agent)));

    const responses = await Promise.all(
      drafts.map(({ draft }) => agent.post('/invoices').send({ draftId: draft.id }).expect(201)),
    );

    const numbers = responses.map((response) => response.body.number as string).sort();
    expect(numbers).toEqual(Array.from({ length: 8 }, (_, i) => numbered(i + 1)));
  });

  it('issues a draft once, even if asked twice at the same time', async () => {
    const { agent } = await issuingUser();
    const { draft } = await readyDraft(agent);

    const responses = await Promise.all([
      agent.post('/invoices').send({ draftId: draft.id }),
      agent.post('/invoices').send({ draftId: draft.id }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 404]);
    await agent.get('/invoices/next-number').expect(200, { number: numbered(2) });
  });

  it('numbers each issuer from 1', async () => {
    const first = await issuingUser();
    const second = await issuingUser();
    await issue(first.agent);

    const { invoice } = await issue(second.agent);

    expect(invoice.number).toBe(numbered(1));
  });

  describe('preconditions', () => {
    it('refuses to issue without a valid Representation, burning no number', async () => {
      const { agent } = await onboardedUser(app);
      const { draft } = await readyDraft(agent);

      const response = await agent.post('/invoices').send({ draftId: draft.id }).expect(409);

      expect(response.body.code).toBe('CANNOT_ISSUE');
      await agent.get(`/drafts/${draft.id}`).expect(200);
      await agent.get('/invoices/next-number').expect(200, { number: numbered(1) });
    });

    it('refuses to issue a draft with problems, listing them', async () => {
      const { agent } = await issuingUser();
      const { body: draft } = await agent
        .post('/drafts')
        .send({ ...monthlyDraft(null), operationDescription: '' })
        .expect(201);

      const response = await agent.post('/invoices').send({ draftId: draft.id }).expect(422);

      expect(response.body).toMatchObject({
        code: 'DRAFT_NOT_READY',
        problems: [{ code: 'recipient-missing' }, { code: 'operation-description-missing' }],
      });
      await agent.get('/invoices/next-number').expect(200, { number: numbered(1) });
    });

    it('refuses to issue to a recipient whose tax ID the census has not confirmed', async () => {
      const { agent } = await issuingUser();
      connector.failNext({ kind: 'server-error' }, 'validateTaxId');
      const { body: recipient } = await agent.post('/recipients').send(clinic()).expect(201);
      expect(recipient.censusStatus).toBe('unchecked');
      const { body: draft } = await agent.post('/drafts').send(monthlyDraft(recipient.id)).expect(201);

      const response = await agent.post('/invoices').send({ draftId: draft.id }).expect(422);

      expect(response.body.problems).toEqual([{ code: 'recipient-unchecked' }]);
    });

    it('answers 404 for a draft that does not exist or is another issuer’s', async () => {
      const owner = await issuingUser();
      const other = await issuingUser();
      const { draft } = await readyDraft(owner.agent);

      await other.agent.post('/invoices').send({ draftId: draft.id }).expect(404);
      await other.agent.post('/invoices').send({ draftId: '00000000-0000-4000-8000-000000000000' }).expect(404);
      await owner.agent.get(`/drafts/${draft.id}`).expect(200);
    });

    it('validates the body', async () => {
      const { agent } = await issuingUser();
      await agent.post('/invoices').send({ draftId: 'nope' }).expect(400);
    });
  });

  describe('the frozen copy', () => {
    it('keeps the recipient as it was when issued', async () => {
      const { agent } = await issuingUser();
      const { invoice, recipient } = await issue(agent);

      const renamed = { ...clinic(recipient.taxId), name: 'Ruzafa Dental SL', address: 'Carrer de Cuba 1' };
      connector.census.set(recipient.taxId, renamed.name);
      await agent.put(`/recipients/${recipient.id}`).send(renamed).expect(200);

      const response = await agent.get(`/invoices/${invoice.id}`).expect(200);
      expect(response.body.recipient).toEqual(clinic(recipient.taxId));
    });

    it('keeps the issuer as it was when issued', async () => {
      const { agent, taxId } = await issuingUser();
      const { invoice } = await issue(agent);

      await agent
        .put('/onboarding/fiscal-data')
        .send({ ...invoice.issuer, taxId, address: 'Avinguda del Port 3' })
        .expect(200);

      const response = await agent.get(`/invoices/${invoice.id}`).expect(200);
      expect(response.body.issuer.address).toBe('Carrer de Colón 12, 3º 2ª');
    });

    it('cannot be changed or deleted in the database', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issue(agent);

      await expect(db.$client.query(`UPDATE invoices SET snapshot = '{}' WHERE id = $1`, [invoice.id])).rejects.toThrow();
      await expect(db.$client.query(`UPDATE invoices SET number = 99 WHERE id = $1`, [invoice.id])).rejects.toThrow();
      await expect(db.$client.query(`DELETE FROM invoices WHERE id = $1`, [invoice.id])).rejects.toThrow();
      await expect(db.$client.query(`DELETE FROM invoice_records WHERE invoice_id = $1`, [invoice.id])).rejects.toThrow();
    });

    it('keeps the recipient from being deleted: it can only be archived', async () => {
      const { agent } = await issuingUser();
      const { recipient } = await issue(agent);

      await agent.delete(`/recipients/${recipient.id}`).expect(409);
    });
  });

  describe('submission', () => {
    it('sends the record to the connector with an idempotency key and keeps its QR', async () => {
      const { agent, issuerId } = await issuingUser();
      const { invoice, recipient } = await issue(agent);

      await worker.runPending();

      const [submission, ...others] = submissionsOf(issuerId);
      expect(others).toEqual([]);
      expect(submission).toEqual({
        invoiceRecordId: expect.any(String),
        idempotencyKey: expect.any(String),
        invoice: {
          series: `F${year}-`,
          number: '0001',
          issueDate: todayInSpain(),
          type: 'F1',
          operationDate: '2026-08-31',
          operationDescription: 'Servicios odontológicos agosto 2026',
          recipient: { taxId: recipient.taxId, name: 'Clínica Dental Ruzafa SL' },
          lines: [
            { kind: 'taxed', taxBase: '100.00', vatRate: 21, taxAmount: '21.00' },
            { kind: 'exempt', taxBase: '3990.00', exemptionCode: 'E1' },
          ],
          totalAmount: '4111.00',
        },
      });
      const response = await agent.get(`/invoices/${invoice.id}`).expect(200);
      expect(response.body).toMatchObject({
        status: 'issued',
        record: { status: 'submitted', verificationUrl: expect.stringMatching(/^https:\/\//), rejection: null },
      });
    });

    it('leaves nothing pending once sent', async () => {
      const { agent, issuerId } = await issuingUser();
      await issue(agent);
      await worker.runPending();

      await worker.runPending();

      expect(submissionsOf(issuerId)).toHaveLength(1);
    });

    it('retries a transient error later, without registering the invoice twice', async () => {
      const { agent, issuerId } = await issuingUser();
      const { invoice } = await issue(agent);
      const [{ id: recordId }] = await db.$client
        .query<{ id: string }>('SELECT id FROM invoice_records WHERE invoice_id = $1', [invoice.id])
        .then((result) => result.rows as [{ id: string }]);

      connector.failNext({ kind: 'server-error' }, 'submitRecord');
      await expect(worker.submit(recordId)).rejects.toThrow();
      await agent.get(`/invoices/${invoice.id}`).expect(200).expect((response) => {
        expect(response.body.record.status).toBe('pending-submission');
      });

      // The connector queued it, but its answer never arrived.
      connector.failNext({ kind: 'timeout', processed: true }, 'submitRecord');
      await expect(worker.submit(recordId)).rejects.toThrow();

      await worker.submit(recordId);

      const submissions = submissionsOf(issuerId);
      expect(submissions).toHaveLength(3);
      expect(new Set(submissions.map(({ idempotencyKey }) => idempotencyKey)).size).toBe(1);
      const response = await agent.get(`/invoices/${invoice.id}`).expect(200);
      expect(response.body.record.status).toBe('submitted');
    });

    it('keeps what the connector answered: fingerprint, QR and key never change once set', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issue(agent);
      await worker.runPending();

      for (const column of ['fingerprint', 'verification_url', 'qr_png', 'connector_record_id', 'idempotency_key']) {
        await expect(
          db.$client.query(`UPDATE invoice_records SET ${column} = 'x' WHERE invoice_id = $1`, [invoice.id]),
        ).rejects.toThrow();
      }
    });

    it('blocks the record when the connector refuses it, keeping the number', async () => {
      const { agent } = await issuingUser();
      // Only this record is left to send when the connector refuses the next one.
      await worker.runPending();
      const { invoice } = await issue(agent);
      connector.failNext({ kind: 'rejected', code: 'vf-nif', message: 'NIF del destinatario no válido' }, 'submitRecord');

      await worker.runPending();

      const response = await agent.get(`/invoices/${invoice.id}`).expect(200);
      expect(response.body).toMatchObject({
        number: numbered(1),
        record: { status: 'blocked', verificationUrl: null, rejection: { code: 'vf-nif', message: 'NIF del destinatario no válido' } },
      });
      await agent.get('/invoices/next-number').expect(200, { number: numbered(2) });
    });
  });

  it('records the issuance, its submission and its PDF in the audit log', async () => {
    const { agent, issuerId } = await issuingUser();
    const { invoice } = await issue(agent);
    await worker.runPending();

    const events = await findAuditEvents(db, issuerId);

    expect(events).toEqual([
      expect.objectContaining({
        action: 'invoice-issued',
        actorUserId: expect.any(String),
        subjectId: invoice.id,
        details: expect.objectContaining({ number: numbered(1), amountDue: '3497.50', totalAmount: '4111.00' }),
      }),
      expect.objectContaining({
        action: 'invoice-record-submitted',
        actorUserId: null,
        subjectId: invoice.id,
        details: expect.objectContaining({ fingerprint: expect.any(String) }),
      }),
      expect.objectContaining({ action: 'invoice-pdf-generated', actorUserId: null, subjectId: invoice.id }),
    ]);
    await expect(db.$client.query('DELETE FROM audit_events WHERE issuer_id = $1', [issuerId])).rejects.toThrow();
  });

  it('shows an invoice only to its issuer', async () => {
    const owner = await issuingUser();
    const other = await issuingUser();
    const { invoice } = await issue(owner.agent);

    await other.agent.get(`/invoices/${invoice.id}`).expect(404);
    await other.agent.get('/invoices/not-a-uuid').expect(404);
  });
});

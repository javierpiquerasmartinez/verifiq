import type { INestApplication } from '@nestjs/common';
import { todayInSpain } from '@verifiq/domain';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { findAuditEvents } from '../src/audit/audit.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { SubmissionWorker } from '../src/invoices/submission-worker.js';
import type { RecordSubmission, VoidingSubmission } from '../src/verifactu/connector.js';
import { FakeVerifactuConnector, type FakeVerdict } from '../src/verifactu/fake-connector.js';
import { signIn, type Agent } from './access.js';
import { onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp } from './test-app.js';

const year = todayInSpain().slice(0, 4);
const ordinary = (n: number) => `F${year}-${String(n).padStart(4, '0')}`;

const exempt = { kind: 'exempt', ground: 'dentistry' } as const;
const lines = [
  { concept: 'Odontología conservadora', quantity: '1', unitPrice: '2340', vat: exempt },
  { concept: 'Endodoncias', quantity: '3', unitPrice: '120.5', vat: exempt },
];

const clinic = (taxId = uniqueTaxId()) => ({
  name: 'Clínica Dental Ruzafa SL',
  taxId,
  address: 'Carrer de Sueca 21',
  postalCode: '46006',
  municipality: 'València',
  province: 'Valencia',
});

describe('Voiding and correcting the recipient', () => {
  let app: INestApplication;
  let worker: SubmissionWorker;
  let db: Database;
  const connector = new FakeVerifactuConnector();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector });
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
    return { ...user, issuerId: issuerIdOf(user.taxId) };
  }

  /** The AEAT gives the invoice's latest record its verdict, through the webhook. */
  async function settle(invoiceId: string, verdict: FakeVerdict) {
    const { rows } = await db.$client.query<{ connector_record_id: string }>(
      'SELECT connector_record_id FROM invoice_records WHERE invoice_id = $1 ORDER BY created_at DESC LIMIT 1',
      [invoiceId],
    );
    const connectorRecordId = rows[0]!.connector_record_id;
    connector.settle(connectorRecordId, verdict, verdict === 'accepted' ? {} : { aeatError: { code: '1100', message: 'Error' } });
    const delivery = connector.resultsDelivery([connectorRecordId]);
    await request(app.getHttpServer()).post('/webhooks/verifactu').set(delivery.headers).send(delivery.body).expect(204);
  }

  /** Issues an August invoice to a new clinic in the census, sends it and, unless told otherwise, the AEAT accepts it. */
  async function issuedInvoice(agent: Agent, { verdict = 'accepted' as FakeVerdict | null } = {}) {
    const recipient = clinic();
    connector.census.set(recipient.taxId, recipient.name);
    const { body: created } = await agent.post('/recipients').send(recipient).expect(201);
    const { body: draft } = await agent
      .post('/drafts')
      .send({
        recipientId: created.id,
        billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
        operationDescription: 'Servicios odontológicos agosto 2026',
        lines,
        withholding: 15,
      })
      .expect(201);
    const { body: invoice } = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);
    await worker.runPending();
    if (verdict) await settle(invoice.id, verdict);
    return { invoice: invoice as { id: string; number: string; issueDate: string }, recipient: created as { id: string } };
  }

  const invoiceOf = async (agent: Agent, id: string) => (await agent.get(`/invoices/${id}`).expect(200)).body;

  const voidInvoice = (agent: Agent, invoiceId: string, body: object = {}) =>
    agent.post(`/invoices/${invoiceId}/voiding`).send(body);

  const correctRecipient = (agent: Agent, invoiceId: string, sent: boolean) =>
    agent.post(`/invoices/${invoiceId}/recipient-correction`).send({ sent });

  /** The Voidings the worker sent, of every issuer or of one. */
  const voidings = (issuerId?: string) =>
    connector.calls
      .filter((call) => call.operation === 'voidRecord' && (issuerId === undefined || call.issuerId === issuerId))
      .map((call) => call.input as VoidingSubmission);

  const notVoidable = ({ body }: { body: { code: string } }) => expect(body.code).toBe('INVOICE_NOT_VOIDABLE');

  describe('voiding', () => {
    it('sends the Voiding of an invoice the AEAT has and leaves it voided, read only', async () => {
      const { agent, issuerId } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);

      const { body } = await voidInvoice(agent, invoice.id).expect(201);
      expect(body.draft).toBeNull();
      expect(body.invoice).toMatchObject({
        status: 'voided',
        record: { status: 'pending-submission', voiding: true, amendment: false },
      });

      await worker.runPending();
      expect(voidings().at(-1)).toMatchObject({
        invoice: { series: `F${year}-`, number: invoice.number.slice(-4), issueDate: invoice.issueDate },
        previouslyRejected: false,
        notRegistered: false,
      });
      expect((await invoiceOf(agent, invoice.id)).record.status).toBe('submitted');

      await settle(invoice.id, 'accepted');
      const voided = await invoiceOf(agent, invoice.id);
      expect(voided).toMatchObject({ status: 'voided', record: { status: 'accepted', voiding: true } });
      // The PDF of the invoice stays: the Voiding has no QR of its own.
      expect(voided.pdf).toEqual({ version: 1 });
      expect(voided.history.map(({ event }: { event: string }) => event)).toContain('voided');

      const events = await findAuditEvents(db, issuerId);
      expect(events.find((event) => event.action === 'invoice-voided')).toMatchObject({
        subjectId: invoice.id,
        details: { number: invoice.number, reissueDraftId: null },
      });

      const { body: list } = await agent.get('/invoices?filter=voided').expect(200);
      expect(list.items.map(({ id }: { id: string }) => id)).toContain(invoice.id);
      const { body: incidents } = await agent.get('/invoices/incidents').expect(200);
      expect(incidents.map(({ id }: { id: string }) => id)).not.toContain(invoice.id);
    });

    it('never reuses the voided number: the invoice issued again takes the next one', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      expect(invoice.number).toBe(ordinary(1));
      const { body: voided } = await voidInvoice(agent, invoice.id, { reissue: true }).expect(201);
      await worker.runPending();

      const { body: reissued } = await agent.post('/invoices').send({ draftId: voided.draft.id }).expect(201);
      expect(reissued.number).toBe(ordinary(2));
      expect((await invoiceOf(agent, invoice.id)).number).toBe(ordinary(1));
      const { body } = await agent.get('/invoices/next-number').expect(200);
      expect(body.number).toBe(ordinary(3));
    });

    it('waits for the AEAT’s verdict on the invoice', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent, { verdict: null });

      await voidInvoice(agent, invoice.id).expect(409).expect(notVoidable);
    });

    it('voids an invoice once', async () => {
      const { agent, issuerId } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      await voidInvoice(agent, invoice.id).expect(201);

      await voidInvoice(agent, invoice.id).expect(409).expect(notVoidable);
      await worker.runPending();
      await settle(invoice.id, 'accepted');
      await voidInvoice(agent, invoice.id).expect(409).expect(notVoidable);
      expect(voidings(issuerId)).toHaveLength(1);
    });

    it('sends again a Voiding the AEAT rejected, saying so', async () => {
      const { agent, issuerId } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      await voidInvoice(agent, invoice.id).expect(201);
      await worker.runPending();
      await settle(invoice.id, 'rejected');
      expect((await invoiceOf(agent, invoice.id)).record).toMatchObject({ status: 'rejected', voiding: true });
      // The AEAT still has the invoice: it needs the user.
      const { body: incidents } = await agent.get('/invoices/incidents').expect(200);
      expect(incidents.map(({ id }: { id: string }) => id)).toContain(invoice.id);

      const { body } = await voidInvoice(agent, invoice.id).expect(201);
      expect(body.invoice).toMatchObject({ status: 'voided', record: { status: 'pending-submission', voiding: true } });
      await worker.runPending();
      expect(voidings().at(-1)).toMatchObject({ previouslyRejected: true, notRegistered: false });

      const events = await findAuditEvents(db, issuerId);
      expect(events.filter((event) => event.action === 'invoice-voided')).toHaveLength(1);
      expect(events.at(-2)).toMatchObject({ action: 'invoice-record-resubmitted', details: { operation: 'voiding' } });
    });

    it('voids an invoice the AEAT rejected, which it never registered', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent, { verdict: 'rejected' });

      await voidInvoice(agent, invoice.id).expect(201);
      await worker.runPending();
      expect(voidings().at(-1)).toMatchObject({ previouslyRejected: false, notRegistered: true });
    });

    it('refuses to void without a valid Representation', async () => {
      const { agent, issuerId } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      connector.signRepresentation(issuerId, 'expired');
      await db.$client.query("UPDATE issuers SET representation_state = 'expired' WHERE id = $1", [issuerId]);

      const cannotIssue = ({ body }: { body: { code: string } }) => expect(body.code).toBe('CANNOT_ISSUE');
      await voidInvoice(agent, invoice.id).expect(409).expect(cannotIssue);
      await correctRecipient(agent, invoice.id, false).expect(409).expect(cannotIssue);
      expect((await invoiceOf(agent, invoice.id)).status).toBe('issued');
      expect(voidings(issuerId)).toHaveLength(0);
    });

    it('is no other issuer’s to void', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      const other = await issuingUser();

      await voidInvoice(other.agent, invoice.id).expect(404);
      expect((await invoiceOf(agent, invoice.id)).status).toBe('issued');
    });
  });

  describe('void and issue again', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('voids an invoice blocked on an earlier day and gives a new draft with its content', async () => {
      const user = await issuingUser();
      const recipient = clinic();
      connector.census.set(recipient.taxId, recipient.name);
      const { body: created } = await user.agent.post('/recipients').send(recipient).expect(201);
      const { body: draft } = await user.agent
        .post('/drafts')
        .send({ recipientId: created.id, billingPeriod: null, operationDescription: 'Implante', lines, withholding: 15 })
        .expect(201);
      const { body: invoice } = await user.agent.post('/invoices').send({ draftId: draft.id }).expect(201);
      connector.failNext({ kind: 'rejected', code: 'invalid-character', message: 'Carácter no válido' }, 'submitRecord');
      await worker.runPending();

      // The next day, the user signs in again.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 24 * 3_600_000);
      const agent = await signIn(app, user.email, user.secret);

      const { body } = await voidInvoice(agent, invoice.id, { reissue: true }).expect(201);
      expect(body.invoice.status).toBe('voided');
      expect(body.draft).toMatchObject({
        recipient: { id: created.id },
        billingPeriod: null,
        operationDescription: 'Implante',
        lines,
        withholding: 15,
        correction: null,
        problems: [],
      });
      await worker.runPending();
      expect(voidings().at(-1)).toMatchObject({ previouslyRejected: false, notRegistered: true });

      const events = await findAuditEvents(db, user.issuerId);
      expect(events.find((event) => event.action === 'invoice-voided')).toMatchObject({
        details: { reissueDraftId: body.draft.id },
      });
    });
  });

  describe('never combined with rectification', () => {
    it('never voids a rectified invoice', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      const { body: draft } = await agent
        .post(`/invoices/${invoice.id}/corrective-draft`)
        .send({ reason: 'price_change', note: 'Descuento', total: true })
        .expect(201);

      // Not while its corrective draft is open,
      await voidInvoice(agent, invoice.id).expect(409).expect(notVoidable);
      await correctRecipient(agent, invoice.id, false).expect(409).expect(notVoidable);
      // nor once its corrective invoice is issued.
      const { body: corrective } = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);
      await voidInvoice(agent, invoice.id).expect(409).expect(notVoidable);
      // Nor is a corrective invoice voided.
      await worker.runPending();
      await settle(corrective.id, 'accepted');
      await voidInvoice(agent, corrective.id).expect(409).expect(notVoidable);
      expect((await invoiceOf(agent, invoice.id)).status).toBe('rectified');
    });

    it('never rectifies a voided invoice, nor issues a corrective draft started before', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);
      const { body: draft } = await agent
        .post(`/invoices/${invoice.id}/corrective-draft`)
        .send({ reason: 'price_change', note: 'Descuento', total: true })
        .expect(201);
      await agent.delete(`/drafts/${draft.id}`).expect(204);
      await voidInvoice(agent, invoice.id).expect(201);

      await agent
        .post(`/invoices/${invoice.id}/corrective-draft`)
        .send({ reason: 'price_change', note: 'Descuento', total: true })
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('INVOICE_NOT_RECTIFIABLE'));
      await correctRecipient(agent, invoice.id, true)
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('INVOICE_NOT_RECTIFIABLE'));
    });
  });

  describe('correcting the recipient', () => {
    it('voids an invoice not sent yet and gives a new draft with its content and no recipient', async () => {
      const { agent, issuerId } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);

      const { body } = await correctRecipient(agent, invoice.id, false).expect(201);
      expect(body.correctiveInvoice).toBeNull();
      expect(body.draft).toMatchObject({
        recipient: null,
        billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
        operationDescription: 'Servicios odontológicos agosto 2026',
        lines,
        withholding: 15,
        correction: null,
      });
      expect((await invoiceOf(agent, invoice.id)).status).toBe('voided');
      await worker.runPending();
      expect(voidings().at(-1)).toMatchObject({ notRegistered: false, previouslyRejected: false });

      const events = await findAuditEvents(db, issuerId);
      expect(events.find((event) => event.action === 'invoice-recipient-corrected')).toMatchObject({
        subjectId: invoice.id,
        details: { sent: false, draftId: body.draft.id, correctiveInvoiceId: null },
      });
      expect(events.find((event) => event.action === 'invoice-voided')).toMatchObject({ subjectId: invoice.id });
    });

    it('rectifies totally an invoice already sent (R4) and gives a new draft with its content and no recipient', async () => {
      const { agent, issuerId } = await issuingUser();
      const { invoice } = await issuedInvoice(agent);

      const { body } = await correctRecipient(agent, invoice.id, true).expect(201);
      expect(body.correctiveInvoice).toMatchObject({
        number: `R${year}-0001`,
        status: 'issued',
        correction: { type: 'R4', reason: 'amounts_or_data_error', invoice: { id: invoice.id } },
        breakdown: { totalAmount: '-2701.50' },
      });
      expect(body.draft).toMatchObject({ recipient: null, lines, correction: null });
      expect((await invoiceOf(agent, invoice.id)).status).toBe('rectified');

      await worker.runPending();
      const submission = connector.calls.filter((call) => call.operation === 'submitRecord').at(-1)!.input as RecordSubmission;
      expect(submission.invoice).toMatchObject({ type: 'R4', totalAmount: '-2701.50' });
      // Never combined: the invoice is not voided.
      expect(voidings(issuerId)).toHaveLength(0);
      await voidInvoice(agent, invoice.id).expect(409).expect(notVoidable);

      const events = await findAuditEvents(db, issuerId);
      expect(events.find((event) => event.action === 'invoice-recipient-corrected')).toMatchObject({
        subjectId: invoice.id,
        details: { sent: true, draftId: body.draft.id, correctiveInvoiceId: body.correctiveInvoice.id },
      });
    });

    it('voids an invoice the AEAT rejected, sent or not: the AEAT never registered it', async () => {
      const { agent, issuerId } = await issuingUser();
      const { invoice } = await issuedInvoice(agent, { verdict: 'rejected' });

      await correctRecipient(agent, invoice.id, true)
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('INVOICE_NOT_RECTIFIABLE'));
      const { body } = await correctRecipient(agent, invoice.id, false).expect(201);
      expect(body).toMatchObject({ correctiveInvoice: null, draft: { recipient: null, lines } });
      expect((await invoiceOf(agent, invoice.id)).status).toBe('voided');
      await worker.runPending();
      expect(voidings(issuerId).at(-1)).toMatchObject({ notRegistered: true, previouslyRejected: false });
    });

    it('rectifies only an invoice the AEAT has', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await issuedInvoice(agent, { verdict: null });

      await correctRecipient(agent, invoice.id, true)
        .expect(409)
        .expect(({ body }) => expect(body.code).toBe('INVOICE_NOT_RECTIFIABLE'));
      await correctRecipient(agent, invoice.id, false).expect(409).expect(notVoidable);
      const { body: drafts } = await agent.get('/drafts').expect(200);
      expect(drafts).toHaveLength(0);
    });
  });
});

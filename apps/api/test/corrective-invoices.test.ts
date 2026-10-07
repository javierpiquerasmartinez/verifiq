import type { INestApplication } from '@nestjs/common';
import { todayInSpain } from '@verifiq/domain';
import request from 'supertest';
import { extractText } from 'unpdf';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findAuditEvents } from '../src/audit/audit.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { SubmissionWorker } from '../src/invoices/submission-worker.js';
import type { RecordSubmission } from '../src/verifactu/connector.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import type { Agent } from './access.js';
import { onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp } from './test-app.js';

const year = todayInSpain().slice(0, 4);
const corrective = (n: number) => `R${year}-${String(n).padStart(4, '0')}`;

const exempt = { kind: 'exempt', ground: 'dentistry' } as const;
const line = (concept: string, unitPrice: string, quantity = '1') => ({ concept, quantity, unitPrice, vat: exempt });

const clinic = (taxId = uniqueTaxId()) => ({
  name: 'Clínica Dental Ruzafa SL',
  taxId,
  address: 'Carrer de Sueca 21',
  postalCode: '46006',
  municipality: 'València',
  province: 'Valencia',
});

describe('Corrective invoices', () => {
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
    return user;
  }

  /** The AEAT gives the invoice's latest record its verdict, through the webhook. */
  async function settle(invoiceId: string, verdict: 'accepted' | 'accepted-with-errors' | 'rejected') {
    const { rows } = await db.$client.query<{ connector_record_id: string }>(
      'SELECT connector_record_id FROM invoice_records WHERE invoice_id = $1 ORDER BY created_at DESC LIMIT 1',
      [invoiceId],
    );
    const connectorRecordId = rows[0]!.connector_record_id;
    connector.settle(connectorRecordId, verdict, verdict === 'accepted' ? {} : { aeatError: { code: '1100', message: 'Error' } });
    const delivery = connector.resultsDelivery([connectorRecordId]);
    await request(app.getHttpServer()).post('/webhooks/verifactu').set(delivery.headers).send(delivery.body).expect(204);
  }

  /** Issues an August invoice to a new clinic in the census and, unless told otherwise, the AEAT accepts it. */
  async function acceptedInvoice(agent: Agent, { verdict = 'accepted' as 'accepted' | 'accepted-with-errors' | null } = {}) {
    const recipient = clinic();
    connector.census.set(recipient.taxId, recipient.name);
    const { body: created } = await agent.post('/recipients').send(recipient).expect(201);
    const { body: draft } = await agent
      .post('/drafts')
      .send({
        recipientId: created.id,
        billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
        operationDescription: 'Servicios odontológicos agosto 2026',
        lines: [line('Odontología conservadora', '2340'), line('Endodoncias', '120.5', '3')],
        withholding: 15,
      })
      .expect(201);
    const { body: invoice } = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);
    await worker.runPending();
    if (verdict) await settle(invoice.id, verdict);
    return { invoice: invoice as { id: string; number: string; issueDate: string }, recipient: created as { id: string } };
  }

  const startCorrection = (agent: Agent, invoiceId: string, body: object) =>
    agent.post(`/invoices/${invoiceId}/corrective-draft`).send(body);

  /** The record the worker last sent to the connector. */
  const lastSubmission = () =>
    connector.calls.filter((call) => call.operation === 'submitRecord').at(-1)!.input as RecordSubmission;

  async function issueCorrection(agent: Agent, invoiceId: string, body: object, lines?: object[]) {
    const { body: draft } = await startCorrection(agent, invoiceId, body).expect(201);
    if (lines) {
      await agent
        .put(`/drafts/${draft.id}`)
        .send({ ...draft, recipientId: draft.recipient.id, lines })
        .expect(200);
    }
    const { body: issued } = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);
    await worker.runPending();
    return issued as { id: string; number: string };
  }

  describe('corrective draft', () => {
    it('starts in the corrected invoice’s recipient, period and withholding, linked to it, with no lines', async () => {
      const { agent } = await issuingUser();
      const { invoice, recipient } = await acceptedInvoice(agent);

      const { body: draft } = await startCorrection(agent, invoice.id, {
        reason: 'price_change',
        note: 'Descuento acordado en septiembre',
      }).expect(201);

      expect(draft).toMatchObject({
        recipient: { id: recipient.id },
        billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
        operationDate: '2026-08-31',
        withholding: 15,
        lines: [],
        correction: {
          type: 'R1',
          reason: 'price_change',
          note: 'Descuento acordado en septiembre',
          invoice: { id: invoice.id, number: invoice.number, issueDate: invoice.issueDate },
        },
        problems: [{ code: 'lines-missing' }],
      });
      expect(draft.operationDescription).toContain(invoice.number);
    });

    it('preloads every line negated to rectify totally', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await acceptedInvoice(agent);

      const { body: draft } = await startCorrection(agent, invoice.id, {
        reason: 'amounts_or_data_error',
        note: 'Factura duplicada',
        total: true,
      }).expect(201);

      expect(draft.lines).toEqual([line('Odontología conservadora', '2340', '-1'), line('Endodoncias', '120.5', '-3')]);
      expect(draft.breakdown).toMatchObject({
        totalAmount: '-2701.50',
        withholding: { rate: 15, amount: '-405.23' },
        amountDue: '-2296.27',
      });
      expect(draft.problems).toEqual([]);
    });

    it('takes negative lines, and keeps its recipient, period and withholding whatever is sent', async () => {
      const { agent } = await issuingUser();
      const { invoice, recipient } = await acceptedInvoice(agent);
      const another = clinic();
      connector.census.set(another.taxId, another.name);
      const { body: other } = await agent.post('/recipients').send(another).expect(201);
      const { body: draft } = await startCorrection(agent, invoice.id, { reason: 'other', note: 'Ajuste' }).expect(201);

      const { body: saved } = await agent
        .put(`/drafts/${draft.id}`)
        .send({
          recipientId: other.id,
          billingPeriod: null,
          operationDescription: 'Ajuste de agosto',
          lines: [line('Endodoncias', '-120.5')],
          withholding: 0,
        })
        .expect(200);

      expect(saved).toMatchObject({
        recipient: { id: recipient.id },
        billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
        withholding: 15,
        operationDescription: 'Ajuste de agosto',
        lines: [line('Endodoncias', '-120.5')],
        breakdown: { totalAmount: '-120.50' },
      });
    });

    it('needs a known reason and a note', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await acceptedInvoice(agent);

      await startCorrection(agent, invoice.id, { reason: 'R1', note: 'Descuento' }).expect(400);
      await startCorrection(agent, invoice.id, { reason: 'other', note: '  ' }).expect(400);
    });

    it('rectifies an invoice accepted with errors', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await acceptedInvoice(agent, { verdict: 'accepted-with-errors' });

      await startCorrection(agent, invoice.id, { reason: 'amounts_or_data_error', note: 'NIF mal escrito' }).expect(201);
    });

    it('waits for the AEAT to have the invoice', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await acceptedInvoice(agent, { verdict: null });

      const { body } = await startCorrection(agent, invoice.id, { reason: 'other', note: 'Ajuste' }).expect(409);
      expect(body.code).toBe('INVOICE_NOT_RECTIFIABLE');
    });

    it('never rectifies a corrective invoice: its original is rectified again', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await acceptedInvoice(agent);
      const rectifying = await issueCorrection(agent, invoice.id, { reason: 'other', note: 'Ajuste', total: true });
      await settle(rectifying.id, 'accepted');

      await startCorrection(agent, rectifying.id, { reason: 'other', note: 'Otra vez' }).expect(409);
      await startCorrection(agent, invoice.id, { reason: 'other', note: 'Otra vez' }).expect(201);
    });

    it('never reaches another issuer’s invoice', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await acceptedInvoice(agent);
      const { agent: stranger } = await issuingUser();

      await startCorrection(stranger, invoice.id, { reason: 'other', note: 'Ajuste' }).expect(404);
    });
  });

  describe('issuance', () => {
    it.each([
      ['price_change', 'R1'],
      ['production_recalculated', 'R1'],
      ['vat_error', 'R1'],
      ['amounts_or_data_error', 'R4'],
      ['other', 'R4'],
    ] as const)('sends a %s correction as a %s by differences, referring to the corrected invoice', async (reason, type) => {
      const { agent } = await issuingUser();
      const { invoice } = await acceptedInvoice(agent);

      await issueCorrection(agent, invoice.id, { reason, note: 'Corrección' }, [line('Endodoncias', '-120.5')]);

      const sent = lastSubmission().invoice;
      expect(sent).toMatchObject({
        series: `R${year}-`,
        number: '0001',
        type,
        operationDate: '2026-08-31',
        totalAmount: '-120.50',
        lines: [{ kind: 'exempt', taxBase: '-120.50', exemptionCode: 'E1' }],
        corrects: [{ series: `F${year}-`, number: '0001', issueDate: invoice.issueDate }],
      });
    });

    it('numbers corrective invoices in their own series, apart from the ordinary one', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await acceptedInvoice(agent);

      const { body: next } = await agent.get('/invoices/next-number?series=corrective').expect(200);
      expect(next.number).toBe(corrective(1));
      const first = await issueCorrection(agent, invoice.id, { reason: 'other', note: 'Uno' }, [line('Ajuste', '-1')]);
      const second = await issueCorrection(agent, invoice.id, { reason: 'other', note: 'Dos' }, [line('Ajuste', '2')]);

      expect([first.number, second.number]).toEqual([corrective(1), corrective(2)]);
      const { body: ordinary } = await agent.get('/invoices/next-number').expect(200);
      expect(ordinary.number).toBe(`F${year}-0002`);
    });

    it('leaves the original rectified, both linked, with the rectification in the original’s history', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await acceptedInvoice(agent);

      const issued = await issueCorrection(agent, invoice.id, {
        reason: 'price_change',
        note: 'Descuento acordado',
        total: true,
      });

      const { body: original } = await agent.get(`/invoices/${invoice.id}`).expect(200);
      expect(original.status).toBe('rectified');
      expect(original.correction).toBeNull();
      expect(original.correctedBy).toEqual([
        { id: issued.id, number: corrective(1), issueDate: todayInSpain(), amountDue: '-2296.27', reason: 'price_change' },
      ]);
      expect(original.history.at(-1)).toMatchObject({ event: 'rectified', invoice: { id: issued.id, number: corrective(1) } });

      const { body: rectifying } = await agent.get(`/invoices/${issued.id}`).expect(200);
      expect(rectifying).toMatchObject({
        status: 'issued',
        operationDate: '2026-08-31',
        correctedBy: [],
        correction: {
          type: 'R1',
          reason: 'price_change',
          note: 'Descuento acordado',
          invoice: { id: invoice.id, number: invoice.number, issueDate: invoice.issueDate },
        },
      });

      const issuerId = (await db.$client.query<{ issuer_id: string }>('SELECT issuer_id FROM invoices WHERE id = $1', [invoice.id]))
        .rows[0]!.issuer_id;
      const rectified = (await findAuditEvents(db, issuerId)).find((event) => event.action === 'invoice-rectified');
      expect(rectified).toMatchObject({
        subjectId: invoice.id,
        details: { correctiveInvoiceId: issued.id, number: corrective(1), type: 'R1', reason: 'price_change' },
      });
    });

    it('lists the corrective invoice with what it corrects, and the original under the rectified', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await acceptedInvoice(agent);
      const { body: draft } = await startCorrection(agent, invoice.id, { reason: 'other', note: 'Ajuste' }).expect(201);

      const { body: withDraft } = await agent.get('/invoices').expect(200);
      expect(withDraft.items.find((item: { id: string }) => item.id === draft.id)).toMatchObject({
        kind: 'draft',
        corrects: invoice.number,
      });

      await agent.put(`/drafts/${draft.id}`).send({ ...draft, recipientId: draft.recipient.id, lines: [line('Ajuste', '-10')] });
      const { body: issued } = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);

      const { body: list } = await agent.get('/invoices').expect(200);
      expect(list.items.find((item: { id: string }) => item.id === issued.id)).toMatchObject({ corrects: invoice.number, amountDue: '-8.50' });
      expect(list.items.find((item: { id: string }) => item.id === invoice.id)).toMatchObject({ corrects: null, status: 'rectified' });
      const { body: rectified } = await agent.get('/invoices?filter=rectified').expect(200);
      expect(rectified.items.map((item: { id: string }) => item.id)).toEqual([invoice.id]);
    });

    it('prints the corrected invoice’s number and date and the reason on the PDF', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await acceptedInvoice(agent);

      const issued = await issueCorrection(agent, invoice.id, { reason: 'price_change', note: 'Descuento acordado', total: true });

      const response = await agent
        .get(`/invoices/${issued.id}/pdf`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);
      const { text } = await extractText(new Uint8Array(response.body as Buffer), { mergePages: true });
      const flat = text.replace(/\s+/g, ' ');
      const [y, m, d] = invoice.issueDate.split('-');
      expect(flat).toContain('Factura rectificativa');
      expect(flat).toContain(corrective(1));
      expect(flat).toContain(`Rectifica la factura ${invoice.number} de ${d}/${m}/${y}`);
      expect(flat).toContain('Motivo: Descuento, devolución o cambio de precio posterior. Descuento acordado');
      expect(flat).toContain('−2.701,50 €');
    });

    it('refuses to issue a corrective draft once its invoice can no longer be rectified', async () => {
      const { agent } = await issuingUser();
      const { invoice } = await acceptedInvoice(agent);
      const { body: draft } = await startCorrection(agent, invoice.id, { reason: 'other', note: 'Ajuste', total: true }).expect(201);
      // As if its record had gone back to the AEAT: an Amendment awaiting its verdict.
      await db.$client.query(
        `INSERT INTO invoice_records (issuer_id, invoice_id, status, operation, previous_rejection, idempotency_key)
         SELECT issuer_id, id, 'pending-submission', 'amendment', 'none', gen_random_uuid()::text FROM invoices WHERE id = $1`,
        [invoice.id],
      );

      const { body } = await agent.post('/invoices').send({ draftId: draft.id }).expect(409);
      expect(body.code).toBe('INVOICE_NOT_RECTIFIABLE');
      await agent.get(`/drafts/${draft.id}`).expect(200);
    });
  });
});

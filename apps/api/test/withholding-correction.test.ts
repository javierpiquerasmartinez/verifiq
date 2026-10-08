import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { extractText } from 'unpdf';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findAuditEvents } from '../src/audit/audit.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { InvoicePdfsService } from '../src/invoices/invoice-pdfs.js';
import { SubmissionWorker } from '../src/invoices/submission-worker.js';
import type { FakeVerdict } from '../src/verifactu/fake-connector.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import type { Agent } from './access.js';
import { onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp } from './test-app.js';

const exempt = { kind: 'exempt', ground: 'dentistry' } as const;
const lines = [
  { concept: 'Odontología conservadora', quantity: '1', unitPrice: '2340', vat: exempt },
  { concept: 'Material', quantity: '1', unitPrice: '100', vat: { kind: 'taxed', rate: 21 } },
];

/** The text of a PDF, its pages joined, with runs of whitespace as one space. */
async function textOf(pdf: Buffer): Promise<string> {
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  return text.replace(/\s+/g, ' ');
}

describe('Correcting the withholding', () => {
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

  /** Issues an invoice with a 15 % withholding and, unless told otherwise, sends it: its PDF is generated. */
  async function issuedInvoice(agent: Agent, { send = true } = {}) {
    const recipient = {
      name: 'Clínica Dental Ruzafa SL',
      taxId: uniqueTaxId(),
      address: 'Carrer de Sueca 21',
      postalCode: '46006',
      municipality: 'València',
      province: 'Valencia',
    };
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
    if (send) await worker.runPending();
    return invoice as { id: string; number: string };
  }

  const correctWithholding = (agent: Agent, invoiceId: string, withholding: unknown) =>
    agent.post(`/invoices/${invoiceId}/withholding-correction`).send({ withholding });

  const download = (agent: Agent, invoiceId: string, version?: number) =>
    agent
      .get(`/invoices/${invoiceId}/pdf${version === undefined ? '' : `?version=${version}`}`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      });

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

  /** The invoice's records, oldest first: the withholding of the copy each one sent. */
  const recordWithholdings = async (invoiceId: string) =>
    (
      await db.$client.query<{ withholding: number }>(
        "SELECT snapshot -> 'withholding' AS withholding FROM invoice_records WHERE invoice_id = $1 ORDER BY created_at",
        [invoiceId],
      )
    ).rows.map((row) => row.withholding);

  const notCorrectable = ({ body }: { body: { code: string } }) =>
    expect(body.code).toBe('INVOICE_NOT_WITHHOLDING_CORRECTABLE');

  it('changes only the withholding and the total to pay, with the same number and record', async () => {
    const { agent } = await issuingUser();
    const invoice = await issuedInvoice(agent);
    const before = (await agent.get(`/invoices/${invoice.id}`).expect(200)).body;
    const calls = connector.calls.length;

    const { body } = await correctWithholding(agent, invoice.id, 7).expect(201);

    expect(body).toEqual({
      ...before,
      withholding: 7,
      breakdown: { ...before.breakdown, withholding: { rate: 7, amount: '170.80' }, amountDue: '2290.20' },
      pdf: { version: 2 },
      history: expect.any(Array),
    });
    expect(body.breakdown.totalAmount).toBe('2461.00');
    // Nothing reaches the AEAT: the withholding is not part of the record.
    await worker.runPending();
    expect(connector.calls.length).toBe(calls);
    expect(await recordWithholdings(invoice.id)).toEqual([15]);
  });

  it('keeps every PDF version: the current one with the new withholding, the earlier ones downloadable', async () => {
    const { agent } = await issuingUser();
    const invoice = await issuedInvoice(agent);
    const first = (await download(agent, invoice.id).expect(200)).body as Buffer;

    await correctWithholding(agent, invoice.id, 7).expect(201);
    await correctWithholding(agent, invoice.id, 0).expect(201);

    const current = await textOf((await download(agent, invoice.id).expect(200)).body);
    expect(current).toContain('Retención IRPF (0 %) 0,00 €');
    expect(current).toContain('Total a pagar 2.461,00 €');
    expect(current).toContain(invoice.number);
    expect(current).toContain('QR tributario:');
    const second = await textOf((await download(agent, invoice.id, 2).expect(200)).body);
    expect(second).toContain('Retención IRPF (7 %) −170,80 €');
    const original = await download(agent, invoice.id, 1).expect(200);
    expect((original.body as Buffer).equals(first)).toBe(true);
    expect(original.headers['content-disposition']).toBe(`inline; filename="${invoice.number}.pdf"`);
    await agent.get(`/invoices/${invoice.id}/pdf?version=4`).expect(404);
    await agent.get(`/invoices/${invoice.id}/pdf?version=first`).expect(400);
  });

  it('shows the correction and its PDF version in the timeline, and audits it', async () => {
    const { agent, issuerId } = await issuingUser();
    const invoice = await issuedInvoice(agent);

    const { body } = await correctWithholding(agent, invoice.id, 7).expect(201);

    expect(body.history.slice(-3)).toEqual([
      { event: 'pdf-generated', occurredAt: expect.any(String), actor: null, invoice: null, pdfVersion: 1, withholding: null },
      {
        event: 'withholding-corrected',
        occurredAt: expect.any(String),
        actor: 'Lucía Ferrer',
        invoice: null,
        pdfVersion: null,
        withholding: { before: 15, after: 7 },
      },
      { event: 'pdf-generated', occurredAt: expect.any(String), actor: 'Lucía Ferrer', invoice: null, pdfVersion: 2, withholding: null },
    ]);
    const events = await findAuditEvents(db, issuerId);
    expect(events.slice(-2)).toEqual([
      expect.objectContaining({
        action: 'invoice-withholding-corrected',
        actorUserId: expect.any(String),
        subjectId: invoice.id,
        details: {
          number: invoice.number,
          withholding: { before: { rate: 15, amount: '366.00' }, after: { rate: 7, amount: '170.80' } },
          amountDue: { before: '2095.00', after: '2290.20' },
        },
      }),
      expect.objectContaining({
        action: 'invoice-pdf-generated',
        actorUserId: expect.any(String),
        subjectId: invoice.id,
        details: { version: 2, invoiceRecordId: expect.any(String), sha256: expect.stringMatching(/^[0-9a-f]{64}$/) },
      }),
    ]);
  });

  it('changes nothing when the withholding is already the right one', async () => {
    const { agent } = await issuingUser();
    const invoice = await issuedInvoice(agent);

    const { body } = await correctWithholding(agent, invoice.id, 15).expect(201);

    expect(body.pdf).toEqual({ version: 1 });
    expect(body.history.map((entry: { event: string }) => entry.event)).not.toContain('withholding-corrected');
  });

  it('waits for the QR: an invoice without a PDF yet keeps its withholding', async () => {
    const { agent } = await issuingUser();
    const invoice = await issuedInvoice(agent, { send: false });

    await correctWithholding(agent, invoice.id, 7).expect(409).expect(notCorrectable);
  });

  it('never corrects a voided invoice', async () => {
    const { agent } = await issuingUser();
    const invoice = await issuedInvoice(agent);
    await settle(invoice.id, 'accepted');
    await agent.post(`/invoices/${invoice.id}/voiding`).send({}).expect(201);

    await correctWithholding(agent, invoice.id, 7).expect(409).expect(notCorrectable);
  });

  it('never corrects an invoice with a corrective draft open: the draft would keep the old withholding', async () => {
    const { agent } = await issuingUser();
    const invoice = await issuedInvoice(agent);
    await settle(invoice.id, 'accepted');
    const { body: draft } = await agent
      .post(`/invoices/${invoice.id}/corrective-draft`)
      .send({ reason: 'other', note: 'Ajuste' })
      .expect(201);

    await correctWithholding(agent, invoice.id, 7).expect(409).expect(notCorrectable);

    await agent.delete(`/drafts/${draft.id}`).expect(204);
    await correctWithholding(agent, invoice.id, 7).expect(201);
  });

  it('sends the corrected copy when the record is amended later, and draws its PDF with it', async () => {
    const { agent } = await issuingUser();
    const invoice = await issuedInvoice(agent);
    await settle(invoice.id, 'accepted-with-errors');
    await correctWithholding(agent, invoice.id, 7).expect(201);

    await agent
      .post(`/invoices/${invoice.id}/resubmission`)
      .send({ operationDescription: 'Servicios odontológicos agosto 2026 (corregida)' })
      .expect(201);
    await worker.runPending();

    expect(await recordWithholdings(invoice.id)).toEqual([15, 7]);
    const { body } = await agent.get(`/invoices/${invoice.id}`).expect(200);
    expect(body).toMatchObject({ withholding: 7, pdf: { version: 3 } });
    const text = await textOf((await download(agent, invoice.id).expect(200)).body);
    expect(text).toContain('Retención IRPF (7 %) −170,80 €');
  });

  it('keeps the corrected version when the record’s PDF is generated again afterwards', async () => {
    const { agent } = await issuingUser();
    const invoice = await issuedInvoice(agent);
    const corrected = (await correctWithholding(agent, invoice.id, 7).expect(201)).body;
    const { rows } = await db.$client.query<{ id: string }>('SELECT id FROM invoice_records WHERE invoice_id = $1', [invoice.id]);

    // A worker that rendered the record's PDF before the correction stores it only now.
    await app.get(InvoicePdfsService).generateForRecord(rows[0]!.id);

    const { body } = await agent.get(`/invoices/${invoice.id}`).expect(200);
    expect(body.pdf).toEqual({ version: 2 });
    const current = (await download(agent, invoice.id).expect(200)).body as Buffer;
    expect(current.equals((await download(agent, invoice.id, 2).expect(200)).body as Buffer)).toBe(true);
    expect(corrected.pdf).toEqual({ version: 2 });
  });

  it('accepts only the withholdings an invoice can have', async () => {
    const { agent } = await issuingUser();
    const invoice = await issuedInvoice(agent);

    await correctWithholding(agent, invoice.id, 19).expect(400);
    await correctWithholding(agent, invoice.id, '7').expect(400);
  });

  it('never corrects another issuer’s invoice', async () => {
    const lucia = await issuingUser();
    const invoice = await issuedInvoice(lucia.agent);
    const other = await issuingUser();

    await correctWithholding(other.agent, invoice.id, 7).expect(404);
    await other.agent.get(`/invoices/${invoice.id}/pdf?version=1`).expect(404);
  });

  it('keeps the rest of the copy frozen', async () => {
    const { agent } = await issuingUser();
    const invoice = await issuedInvoice(agent);

    await expect(
      db.$client.query(
        `UPDATE invoices SET snapshot = jsonb_set(snapshot, '{breakdown,totalAmount}', '"1.00"') WHERE id = $1`,
        [invoice.id],
      ),
    ).rejects.toThrow();
    await expect(
      db.$client.query(`UPDATE invoices SET snapshot = jsonb_set(snapshot, '{withholding}', '7') WHERE id = $1`, [invoice.id]),
    ).rejects.toThrow();
  });
});

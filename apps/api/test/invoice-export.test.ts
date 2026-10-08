import type { INestApplication } from '@nestjs/common';
import { formatSpanishDate, todayInSpain } from '@verifiq/domain';
import { unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SubmissionWorker } from '../src/invoices/submission-worker.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import type { Agent } from './access.js';
import { onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp } from './test-app.js';

const lines = [
  { concept: 'Odontología conservadora', quantity: '1', unitPrice: '2340', vat: { kind: 'exempt', ground: 'dentistry' } },
  { concept: 'Material', quantity: '1', unitPrice: '100', vat: { kind: 'taxed', rate: 21 } },
];

/** The body of a download, as bytes. */
const bytesOf = (download: ReturnType<Agent['get']>) =>
  download.buffer(true).parse((response, done) => {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => done(null, Buffer.concat(chunks)));
  });

/** The rows of the summary CSV, each as its fields. */
const rowsOf = (csv: Uint8Array) =>
  new TextDecoder('utf-8', { ignoreBOM: true })
    .decode(csv)
    .split('\r\n')
    .filter((row) => row !== '')
    .map((row) => row.split(';'));

describe('Invoice export', () => {
  let app: INestApplication;
  let worker: SubmissionWorker;
  const connector = new FakeVerifactuConnector();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector });
    worker = app.get(SubmissionWorker);
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

  async function draft(agent: Agent, recipientName = 'Clínica Dental Ruzafa SL') {
    const recipient = {
      name: recipientName,
      taxId: uniqueTaxId(),
      address: 'Carrer de Sueca 21',
      postalCode: '46006',
      municipality: 'València',
      province: 'Valencia',
    };
    connector.census.set(recipient.taxId, recipient.name);
    const { body: created } = await agent.post('/recipients').send(recipient).expect(201);
    const { body } = await agent
      .post('/drafts')
      .send({
        recipientId: created.id,
        billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
        operationDescription: 'Servicios odontológicos agosto 2026',
        lines,
        withholding: 15,
      })
      .expect(201);
    return { draft: body as { id: string }, recipient };
  }

  /** Issues an invoice and sends its record: its PDF is generated. */
  async function issuedInvoice(agent: Agent, recipientName?: string) {
    const { draft: created, recipient } = await draft(agent, recipientName);
    const { body: invoice } = await agent.post('/invoices').send({ draftId: created.id }).expect(201);
    await worker.runPending();
    return { invoice: invoice as { id: string; number: string }, recipient };
  }

  const exportOf = (agent: Agent) => bytesOf(agent.get('/invoices/export'));

  const pdfOf = async (agent: Agent, invoiceId: string, version?: number) =>
    (await bytesOf(agent.get(`/invoices/${invoiceId}/pdf${version ? `?version=${version}` : ''}`)).expect(200)).body as Buffer;

  it('gives a ZIP with the PDF of each issued invoice and a summary CSV', async () => {
    const { agent } = await issuingUser();
    const first = await issuedInvoice(agent);
    const second = await issuedInvoice(agent, 'Laboratorio Turia SL');
    // A draft is no invoice: neither its PDF nor its row.
    await draft(agent);

    const response = await exportOf(agent).expect(200);

    expect(response.headers['content-type']).toBe('application/zip');
    expect(response.headers['content-disposition']).toBe(`attachment; filename="facturas-${todayInSpain()}.zip"`);
    const files = unzipSync(new Uint8Array(response.body));
    expect(Object.keys(files).sort()).toEqual(['facturas.csv', `${first.invoice.number}.pdf`, `${second.invoice.number}.pdf`].sort());
    expect(Buffer.from(files[`${first.invoice.number}.pdf`]!).equals(await pdfOf(agent, first.invoice.id))).toBe(true);

    const [header, ...rows] = rowsOf(files['facturas.csv']!);
    expect(header?.[0]).toBe('\uFEFFNúmero');
    expect(rows).toEqual([
      [
        first.invoice.number,
        formatSpanishDate(todayInSpain()),
        'Clínica Dental Ruzafa SL',
        first.recipient.taxId,
        '2440,00',
        '100,00',
        '21,00',
        ...Array(6).fill('0,00'),
        '2340,00',
        '2461,00',
        '15',
        '366,00',
        '2095,00',
        'Emitida',
        'Enviada',
        '',
      ],
      expect.arrayContaining([second.invoice.number, 'Laboratorio Turia SL']),
    ]);
  });

  it('lists an invoice without PDF in the CSV only', async () => {
    const { agent } = await issuingUser();
    const { draft: created } = await draft(agent);
    connector.failNext({ kind: 'rejected', code: 'vf-nif', message: 'NIF del destinatario no válido' }, 'submitRecord');
    const { body: invoice } = await agent.post('/invoices').send({ draftId: created.id }).expect(201);
    await worker.runPending();

    const files = unzipSync(new Uint8Array((await exportOf(agent).expect(200)).body));

    expect(Object.keys(files)).toEqual(['facturas.csv']);
    const [, row] = rowsOf(files['facturas.csv']!);
    expect(row?.[0]).toBe(invoice.number);
    expect(row?.slice(-3)).toEqual(['Emitida', 'Bloqueada', '']);
  });

  it('has the current PDF and the corrected withholding of an invoice whose withholding was corrected', async () => {
    const { agent } = await issuingUser();
    const { invoice } = await issuedInvoice(agent);
    await agent.post(`/invoices/${invoice.id}/withholding-correction`).send({ withholding: 7 }).expect(201);

    const files = unzipSync(new Uint8Array((await exportOf(agent).expect(200)).body));

    const pdf = Buffer.from(files[`${invoice.number}.pdf`]!);
    expect(pdf.equals(await pdfOf(agent, invoice.id, 2))).toBe(true);
    expect(pdf.equals(await pdfOf(agent, invoice.id, 1))).toBe(false);
    const [, row] = rowsOf(files['facturas.csv']!);
    // 7 % of the 2440.00 tax base, off the 2461.00 total amount.
    expect(row?.slice(15, 18)).toEqual(['7', '170,80', '2290,20']);
  });

  it("has only the session issuer's invoices", async () => {
    const { agent } = await issuingUser();
    const { invoice } = await issuedInvoice(agent);
    const other = await issuingUser();
    const theirs = await issuedInvoice(other.agent, 'Otro Cliente SL');

    const files = unzipSync(new Uint8Array((await exportOf(agent).expect(200)).body));

    expect(Object.keys(files).sort()).toEqual(['facturas.csv', `${invoice.number}.pdf`].sort());
    // Both are the first invoice of their issuer, with the same number: the file is this issuer's.
    expect(Buffer.from(files[`${invoice.number}.pdf`]!).equals(await pdfOf(agent, invoice.id))).toBe(true);
    const csv = new TextDecoder().decode(files['facturas.csv']);
    expect(csv).not.toContain('Otro Cliente SL');
    expect(csv).not.toContain(theirs.recipient.taxId);
  });

  it('gives only the header of the CSV to a user without invoices', async () => {
    const { agent } = await issuingUser();

    const files = unzipSync(new Uint8Array((await exportOf(agent).expect(200)).body));

    expect(Object.keys(files)).toEqual(['facturas.csv']);
    expect(rowsOf(files['facturas.csv']!)).toHaveLength(1);
  });
});

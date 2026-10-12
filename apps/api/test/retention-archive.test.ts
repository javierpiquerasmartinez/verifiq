import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RetentionArchive } from '../src/archive/retention-archive.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { SubmissionWorker } from '../src/invoices/submission-worker.js';
import { recordExchange } from '../src/verifactu/exchanges.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import type { Agent } from './access.js';
import { onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp, InMemoryObjectStorage } from './test-app.js';

const MINUTE = 60_000;

const draftTo = (recipientId: string) => ({
  recipientId,
  billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
  operationDescription: 'Servicios odontológicos agosto 2026',
  lines: [{ concept: 'Odontología conservadora', quantity: '1', unitPrice: '2340', vat: { kind: 'exempt', ground: 'dentistry' } }],
  withholding: 15,
});

describe('Retention archive', () => {
  let app: INestApplication;
  let worker: SubmissionWorker;
  let archive: RetentionArchive;
  const connector = new FakeVerifactuConnector();
  const storage = new InMemoryObjectStorage();
  // A round covers up to 5 minutes before its clock: this one covers up to now. One more millisecond
  // for the rows of this millisecond: the database keeps microseconds.
  const nextRound = () => archive.exportOnce(new Date(Date.now() + 5 * MINUTE + 1));

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector, storage });
    worker = app.get(SubmissionWorker);
    archive = app.get(RetentionArchive);
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

  /** Issues an invoice, sends its record and draws its PDF. */
  async function issuedInvoice(agent: Agent) {
    const recipient = { name: 'Clínica Dental Ruzafa SL', taxId: uniqueTaxId(), address: 'Carrer de Sueca 21', postalCode: '46006', municipality: 'València', province: 'Valencia' };
    connector.census.set(recipient.taxId, recipient.name);
    const { body: created } = await agent.post('/recipients').send(recipient).expect(201);
    const { body: draft } = await agent.post('/drafts').send(draftTo(created.id)).expect(201);
    const { body: invoice } = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);
    await worker.runPending();
    const { rows } = await app
      .get<Database>(DATABASE)
      .$client.query<{ connector_record_id: string }>('SELECT connector_record_id FROM invoice_records WHERE invoice_id = $1', [invoice.id]);
    return { id: invoice.id as string, connectorRecordId: rows[0]!.connector_record_id };
  }

  const keysUnder = (prefix: string) => [...storage.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
  const json = (key: string) => JSON.parse(storage.objects.get(key)!.body.toString('utf8'));
  const ndjson = (keys: string[]) =>
    keys.flatMap((key) => storage.objects.get(key)!.body.toString('utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)));

  it('archives an issued invoice with its copy, its records and its PDF', async () => {
    const { agent, issuerId } = await issuingUser();
    const invoice = await issuedInvoice(agent);

    await nextRound();

    const versions = keysUnder(`archive/issuers/${issuerId}/invoices/${invoice.id}/versions/`);
    expect(versions).toHaveLength(1);
    const archived = json(versions[0]!);
    expect(archived.invoice).toMatchObject({ id: invoice.id, issuerId, status: 'issued', snapshot: expect.any(Object) });
    expect(archived.records).toEqual([
      expect.objectContaining({ status: 'submitted', fingerprint: expect.any(String), qrPng: expect.any(String), snapshot: expect.any(Object) }),
    ]);

    const pdfs = keysUnder(`archive/issuers/${issuerId}/invoices/${invoice.id}/pdfs/`);
    expect(pdfs).toHaveLength(1);
    const [original] = [...storage.objects.entries()].filter(([key]) => key.startsWith(`issuers/${issuerId}/invoices/`));
    expect(storage.objects.get(pdfs[0]!)).toEqual(original![1]);
  });

  it('adds a version only when the invoice changed', async () => {
    const { agent, issuerId } = await issuingUser();
    const invoice = await issuedInvoice(agent);
    const versions = () => keysUnder(`archive/issuers/${issuerId}/invoices/${invoice.id}/versions/`);
    await nextRound();

    await nextRound();
    expect(versions()).toHaveLength(1);

    connector.settle(invoice.connectorRecordId, 'accepted', { registrationCode: 'A-YYRC9W7S2JX4QBQ' });
    const delivery = connector.resultsDelivery([invoice.connectorRecordId]);
    await request(app.getHttpServer()).post('/webhooks/verifactu').set(delivery.headers).send(delivery.body).expect(204);
    await nextRound();

    expect(versions()).toHaveLength(2);
    expect(json(versions()[1]!).records).toEqual([
      expect.objectContaining({ status: 'accepted', registrationCode: 'A-YYRC9W7S2JX4QBQ' }),
    ]);
    expect(json(versions()[0]!).records).toEqual([expect.objectContaining({ status: 'submitted' })]);
    expect(ndjson(keysUnder('archive/webhook-deliveries/'))).toContainEqual(
      expect.objectContaining({ body: delivery.body }),
    );
  });

  it("archives the issuer's connector exchanges and audit log", async () => {
    const { agent, issuerId } = await issuingUser();
    const invoice = await issuedInvoice(agent);
    // The fake connector keeps no exchanges: as the Verifacti adapter would.
    await recordExchange(app.get<Database>(DATABASE), {
      issuerId,
      operation: 'submitRecord',
      method: 'POST',
      url: 'https://api.verifacti.com/verifactu/create',
      requestHeaders: {},
      requestBody: '{"serie":"F2026-"}',
      responseStatus: 200,
      responseBody: '{"estado":"Pendiente"}',
      startedAt: new Date(),
      durationMs: 120,
    });

    await nextRound();

    expect(ndjson(keysUnder(`archive/issuers/${issuerId}/connector-exchanges/`))).toEqual([
      expect.objectContaining({ issuerId, operation: 'submitRecord', responseBody: '{"estado":"Pendiente"}' }),
    ]);
    const audit = ndjson(keysUnder(`archive/issuers/${issuerId}/audit-events/`));
    expect(audit).toContainEqual(expect.objectContaining({ action: 'invoice-issued', subjectId: invoice.id }));
  });

  it('exports again in the next round what a failed round did not', async () => {
    const { agent, issuerId } = await issuingUser();
    const invoice = await issuedInvoice(agent);
    const put = storage.put.bind(storage);
    storage.put = async () => {
      throw new Error('R2 is down');
    };
    await expect(nextRound()).rejects.toThrow('R2 is down');
    storage.put = put;

    await nextRound();

    expect(keysUnder(`archive/issuers/${issuerId}/invoices/${invoice.id}/versions/`)).toHaveLength(1);
  });
});

import type { INestApplication } from '@nestjs/common';
import { formatSpanishDate, todayInSpain } from '@verifiq/domain';
import { extractText } from 'unpdf';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findAuditEvents } from '../src/audit/audit.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { SubmissionWorker } from '../src/invoices/submission-worker.js';
import type { StoredObject } from '../src/storage/object-storage.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import type { Agent } from './access.js';
import { fiscalData, onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp, InMemoryObjectStorage } from './test-app.js';

const year = todayInSpain().slice(0, 4);
const numbered = (n: number) => `F${year}-${String(n).padStart(4, '0')}`;

const exempt = { kind: 'exempt', ground: 'dentistry' } as const;
const line = (concept: string, unitPrice: string, vat: object = exempt) => ({ concept, quantity: '1', unitPrice, vat });

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Storage whose next writes fail, as R2 can. */
class FlakyObjectStorage extends InMemoryObjectStorage {
  failures = 0;

  override async put(key: string, object: StoredObject): Promise<void> {
    if (this.failures > 0) {
      this.failures--;
      throw new Error('R2 is unavailable');
    }
    await super.put(key, object);
  }
}

/** The text of a PDF, its pages joined, with runs of whitespace as one space. */
async function textOf(pdf: Buffer): Promise<string> {
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  return text.replace(/\s+/g, ' ');
}

/** The images drawn in a PDF: its image objects, less the transparency masks of the PNGs with alpha. */
function imagesIn(pdf: Buffer): number {
  const raw = pdf.toString('latin1');
  const count = (pattern: RegExp) => raw.match(pattern)?.length ?? 0;
  return count(/\/Subtype \/Image/g) - count(/\/SMask \d+ 0 R/g);
}

describe('Invoice PDF', () => {
  let app: INestApplication;
  let db: Database;
  let worker: SubmissionWorker;
  const connector = new FakeVerifactuConnector();
  const storage = new FlakyObjectStorage();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector, storage });
    db = app.get<Database>(DATABASE);
    worker = app.get(SubmissionWorker);
  });

  afterAll(async () => {
    await app.close();
  });

  const issuerIdOf = (taxId: string) =>
    connector.calls.find((call) => call.operation === 'createIssuerKey' && (call.input as { taxId: string }).taxId === taxId)!
      .issuerId;

  /** An onboarded issuer, with IBAN, whose Representation is signed: it can issue. */
  async function issuingUser() {
    const user = await onboardedUser(app);
    await user.agent
      .put('/onboarding/fiscal-data')
      .send({ ...fiscalData(user.taxId), iban: 'ES9121000418450200051332' })
      .expect(200);
    await user.agent.get('/issuer/representation').expect(200);
    const issuerId = issuerIdOf(user.taxId);
    connector.signRepresentation(issuerId);
    await user.agent.get('/issuer/representation').expect(200);
    return { ...user, issuerId };
  }

  async function issue(agent: Agent) {
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
        lines: [line('Odontología conservadora', '2340'), line('Endodoncias', '1650'), line('Material', '100', { kind: 'taxed', rate: 21 })],
        withholding: 15,
      })
      .expect(201);
    const { body: invoice } = await agent.post('/invoices').send({ draftId: draft.id }).expect(201);
    return { invoice: invoice as { id: string; number: string }, recipient };
  }

  const download = (agent: Agent, invoiceId: string) =>
    agent
      .get(`/invoices/${invoiceId}/pdf`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      });

  it('has no PDF and no download until the record has its QR', async () => {
    const { agent } = await issuingUser();
    const { invoice } = await issue(agent);

    const response = await agent.get(`/invoices/${invoice.id}`).expect(200);
    expect(response.body.pdf).toBeNull();
    const refused = await agent.get(`/invoices/${invoice.id}/pdf`).expect(404);
    expect(refused.body.code).toBe('INVOICE_PDF_NOT_AVAILABLE');
  });

  it('never has a PDF when the connector refuses the record', async () => {
    const { agent } = await issuingUser();
    await worker.runPending();
    const { invoice } = await issue(agent);
    connector.failNext({ kind: 'rejected', code: 'vf-nif', message: 'NIF del destinatario no válido' }, 'submitRecord');

    await worker.runPending();

    const response = await agent.get(`/invoices/${invoice.id}`).expect(200);
    expect(response.body).toMatchObject({ record: { status: 'blocked' }, pdf: null });
    await agent.get(`/invoices/${invoice.id}/pdf`).expect(404);
  });

  it('generates the PDF once the record has its QR, with all the mandatory content', async () => {
    const { agent, taxId } = await issuingUser();
    const { invoice, recipient } = await issue(agent);

    await worker.runPending();

    const response = await agent.get(`/invoices/${invoice.id}`).expect(200);
    expect(response.body.pdf).toEqual({ version: 1 });
    const pdf = await download(agent, invoice.id).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toBe(`inline; filename="${numbered(1)}.pdf"`);
    const text = await textOf(pdf.body);
    for (const content of [
      // The QR tributario, with its captions.
      'QR tributario:',
      'VERI*FACTU',
      // Issuer and recipient.
      'Lucía Ferrer Albiol',
      `NIF ${taxId}`,
      'Carrer de Colón 12, 3º 2ª',
      '46004 València (Valencia)',
      'Clínica Dental Ruzafa SL',
      `NIF ${recipient.taxId}`,
      'Carrer de Sueca 21',
      // Number and dates: the operation date differs from the issue date.
      numbered(1),
      formatSpanishDate(todayInSpain()),
      'Periodo facturado',
      `${formatSpanishDate('2026-08-01')} – ${formatSpanishDate('2026-08-31')}`,
      `Fecha de operación ${formatSpanishDate('2026-08-31')}`,
      // Lines.
      'Servicios odontológicos agosto 2026',
      'Odontología conservadora',
      'Endodoncias',
      'Material',
      '2.340,00 €',
      // Breakdown, exemption mention and totals.
      'Base imponible 21 %',
      'Cuota IVA 21 %',
      '21,00 €',
      'Base exenta',
      '3.990,00 €',
      'artículo 20.Uno.5º de la Ley 37/1992',
      'Importe total',
      '4.111,00 €',
      'Retención de IRPF (15 %)',
      '−613,50 €',
      'Total a pagar',
      '3.497,50 €',
      // How to pay.
      'ES91 2100 0418 4502 0005 1332',
    ]) {
      expect(text).toContain(content);
    }
    // Only the QR: the issuer has no logo.
    expect(imagesIn(pdf.body)).toBe(1);
  });

  it('includes the logo when the issuer has one', async () => {
    const { agent } = await issuingUser();
    await agent.put('/issuer/logo').set('Content-Type', 'image/png').send(PNG).expect(200);
    const { invoice } = await issue(agent);

    await worker.runPending();

    const pdf = await download(agent, invoice.id).expect(200);
    expect(imagesIn(pdf.body)).toBe(2);
  });

  it('stores the PDF with its version and serves the stored file on every download', async () => {
    const { agent, issuerId } = await issuingUser();
    const { invoice } = await issue(agent);

    await worker.runPending();
    await worker.runPending();

    const { rows } = await db.$client.query<{ version: number; storage_key: string }>(
      'SELECT version, storage_key FROM invoice_pdfs WHERE invoice_id = $1',
      [invoice.id],
    );
    expect(rows).toEqual([{ version: 1, storage_key: expect.stringContaining(`issuers/${issuerId}/invoices/${invoice.id}/`) }]);
    const stored = storage.objects.get(rows[0]!.storage_key)!;
    expect(stored.contentType).toBe('application/pdf');
    const first = await download(agent, invoice.id).expect(200);
    const second = await download(agent, invoice.id).expect(200);
    expect(first.body.equals(stored.body)).toBe(true);
    expect(second.body.equals(stored.body)).toBe(true);
    await expect(db.$client.query('UPDATE invoice_pdfs SET version = 2 WHERE invoice_id = $1', [invoice.id])).rejects.toThrow();
    await expect(db.$client.query('DELETE FROM invoice_pdfs WHERE invoice_id = $1', [invoice.id])).rejects.toThrow();
  });

  it('generates the PDF on the retry when storing it fails', async () => {
    const { agent } = await issuingUser();
    const { invoice } = await issue(agent);
    const [{ id: recordId }] = await db.$client
      .query<{ id: string }>('SELECT id FROM invoice_records WHERE invoice_id = $1', [invoice.id])
      .then((result) => result.rows as [{ id: string }]);

    storage.failures = 1;
    await expect(worker.submit(recordId)).rejects.toThrow();
    await agent.get(`/invoices/${invoice.id}/pdf`).expect(404);

    await worker.submit(recordId);

    await agent.get(`/invoices/${invoice.id}/pdf`).expect(200);
  });

  it('records the new PDF version in the audit log', async () => {
    const { agent, issuerId } = await issuingUser();
    const { invoice } = await issue(agent);

    await worker.runPending();

    const events = await findAuditEvents(db, issuerId);
    expect(events.at(-1)).toEqual(
      expect.objectContaining({ action: 'invoice-pdf-generated', actorUserId: null, subjectId: invoice.id, details: { version: 1, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) } }),
    );
  });

  it('serves no PDF of another issuer’s invoice', async () => {
    const lucia = await issuingUser();
    const pau = await issuingUser();
    const { invoice } = await issue(lucia.agent);
    await worker.runPending();

    await pau.agent.get(`/invoices/${invoice.id}/pdf`).expect(404);
    await pau.agent.get('/invoices/not-a-uuid/pdf').expect(404);
  });
});

import type { INestApplication } from '@nestjs/common';
import type { InvoiceList, InvoiceListFilter } from '@verifiq/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import type { Agent } from './access.js';
import { onboardedUser, uniqueTaxId } from './issuer.js';
import { createTestApp } from './test-app.js';

const exempt = { kind: 'exempt', ground: 'dentistry' } as const;

/** Exempt and with a 15 % withholding: the total amount is `unitPrice`, the amount due 85 % of it. */
const draftTo = (recipientId: string | null, unitPrice: string) => ({
  recipientId,
  billingPeriod: { start: '2026-08-01', end: '2026-08-31' },
  operationDescription: 'Servicios odontológicos agosto 2026',
  lines: [{ concept: 'Odontología conservadora', quantity: '1', unitPrice, vat: exempt }],
  withholding: 15,
});

describe('Invoice list', () => {
  let app: INestApplication;
  let db: Database;
  const connector = new FakeVerifactuConnector();

  beforeAll(async () => {
    app = await createTestApp({ verifactu: connector });
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

  async function createRecipient(agent: Agent, name: string) {
    const data = { name, taxId: uniqueTaxId(), address: 'Carrer de Sueca 21', postalCode: '46006', municipality: 'València', province: 'Valencia' };
    connector.census.set(data.taxId, data.name);
    return ((await agent.post('/recipients').send(data).expect(201)).body as { id: string }).id;
  }

  async function createDraft(agent: Agent, recipientId: string | null, unitPrice: string) {
    return ((await agent.post('/drafts').send(draftTo(recipientId, unitPrice)).expect(201)).body as { id: string }).id;
  }

  /**
   * Issues an invoice: its record waits to be sent. The worker never runs here (it would take other
   * test files' records too); the tests move records on with setRecord.
   */
  async function issue(agent: Agent, recipientId: string, unitPrice: string) {
    const draftId = await createDraft(agent, recipientId, unitPrice);
    const { body } = await agent.post('/invoices').send({ draftId }).expect(201);
    return body as { id: string; number: string };
  }

  /** Moves the invoice's record on, as the connector and the AEAT would. */
  async function setRecord(invoiceId: string, status: string, fields: { message?: string; hoursAgo?: number } = {}) {
    await db.$client.query(
      `UPDATE invoice_records
          SET status = $2,
              rejection_code = CASE WHEN $2 = 'blocked' THEN 'vf-nif' END,
              rejection_message = CASE WHEN $2 = 'blocked' THEN $3 END,
              aeat_error_code = CASE WHEN $2 IN ('rejected', 'accepted-with-errors') THEN '1100' END,
              aeat_error_message = CASE WHEN $2 IN ('rejected', 'accepted-with-errors') THEN $3 END,
              created_at = now() - make_interval(hours => $4)
        WHERE invoice_id = $1`,
      [invoiceId, status, fields.message ?? null, fields.hoursAgo ?? 0],
    );
  }

  const setInvoiceStatus = (invoiceId: string, status: string) =>
    db.$client.query('UPDATE invoices SET status = $2 WHERE id = $1', [invoiceId, status]);

  const list = async (agent: Agent, query: Record<string, string | number> = {}) =>
    (await agent.get('/invoices').query(query).expect(200)).body as InvoiceList;

  const ids = (page: InvoiceList) => page.items.map((item) => item.id);

  /**
   * One of each: a draft, and invoices accepted, pending, rejected, unconfirmed, rectified and voided.
   * Created in this order, so the list shows them the other way round.
   */
  async function issuerWithEveryState() {
    const { agent } = await issuingUser();
    const ruzafa = await createRecipient(agent, 'Clínica Dental Ruzafa SL');
    const benimaclet = await createRecipient(agent, 'Centro Odontológico Benimaclet SL');
    const accepted = await issue(agent, ruzafa, '4820');
    await setRecord(accepted.id, 'accepted');
    const pending = await issue(agent, benimaclet, '3410');
    const rejected = await issue(agent, benimaclet, '3960');
    await setRecord(rejected.id, 'rejected', { message: 'El NIF del destinatario no está identificado.' });
    const unconfirmed = await issue(agent, ruzafa, '2180');
    await setRecord(unconfirmed.id, 'submitted', { hoursAgo: 25 });
    const rectified = await issue(agent, ruzafa, '4600');
    await setRecord(rectified.id, 'accepted');
    await setInvoiceStatus(rectified.id, 'rectified');
    const voided = await issue(agent, benimaclet, '3150');
    await setRecord(voided.id, 'accepted');
    await setInvoiceStatus(voided.id, 'voided');
    const draft = await createDraft(agent, ruzafa, '5140');
    return { agent, ruzafa, accepted, pending, rejected, unconfirmed, rectified, voided, draft };
  }

  it('lists drafts and invoices together, newest first, with the columns of the screen', async () => {
    const { agent } = await issuingUser();
    const ruzafa = await createRecipient(agent, 'Clínica Dental Ruzafa SL');
    const invoice = await issue(agent, ruzafa, '3960');
    const draft = await createDraft(agent, ruzafa, '5140');

    const page = await list(agent);

    expect(page.items).toEqual([
      {
        kind: 'draft',
        id: draft,
        date: expect.any(String),
        recipientName: 'Clínica Dental Ruzafa SL',
        corrects: null,
        totalAmount: '5140.00',
        amountDue: '4369.00',
      },
      {
        kind: 'invoice',
        id: invoice.id,
        number: invoice.number,
        date: expect.any(String),
        recipientName: 'Clínica Dental Ruzafa SL',
        corrects: null,
        totalAmount: '3960.00',
        amountDue: '3366.00',
        status: 'issued',
        recordStatus: 'pending-submission',
        unconfirmed: false,
      },
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('lists a draft without recipient', async () => {
    const { agent } = await issuingUser();
    const draft = await createDraft(agent, null, '100');

    expect((await list(agent)).items).toEqual([expect.objectContaining({ id: draft, recipientName: null })]);
  });

  it('a draft edited again moves to the top', async () => {
    const { agent } = await issuingUser();
    const ruzafa = await createRecipient(agent, 'Clínica Dental Ruzafa SL');
    const draft = await createDraft(agent, ruzafa, '100');
    const invoice = await issue(agent, ruzafa, '200');
    expect(ids(await list(agent))).toEqual([invoice.id, draft]);

    await agent.put(`/drafts/${draft}`).send(draftTo(ruzafa, '150')).expect(200);

    expect(ids(await list(agent))).toEqual([draft, invoice.id]);
  });

  it('puts each invoice under one filter, and counts them', async () => {
    const issuer = await issuerWithEveryState();
    const expected: Record<InvoiceListFilter, string[]> = {
      all: [issuer.draft, issuer.voided.id, issuer.rectified.id, issuer.unconfirmed.id, issuer.rejected.id, issuer.pending.id, issuer.accepted.id],
      drafts: [issuer.draft],
      pending: [issuer.pending.id],
      accepted: [issuer.accepted.id],
      incidents: [issuer.unconfirmed.id, issuer.rejected.id],
      rectified: [issuer.rectified.id],
      voided: [issuer.voided.id],
    };

    for (const [filter, expectedIds] of Object.entries(expected)) {
      const page = await list(issuer.agent, { filter });
      expect(ids(page), filter).toEqual(expectedIds);
      expect(page.counts).toEqual({ all: 7, drafts: 1, pending: 1, accepted: 1, incidents: 2, rectified: 1, voided: 1 });
    }
  });

  it('counts an accepted with errors or blocked record as an incident', async () => {
    const { agent } = await issuingUser();
    const ruzafa = await createRecipient(agent, 'Clínica Dental Ruzafa SL');
    const withErrors = await issue(agent, ruzafa, '100');
    await setRecord(withErrors.id, 'accepted-with-errors', { message: 'El nombre no coincide.' });
    const blocked = await issue(agent, ruzafa, '200');
    await setRecord(blocked.id, 'blocked', { message: 'NIF del destinatario no válido' });

    expect(ids(await list(agent, { filter: 'incidents' }))).toEqual([blocked.id, withErrors.id]);
  });

  describe('search', () => {
    it('finds an invoice by its number, whole or in part', async () => {
      const issuer = await issuerWithEveryState();

      expect(ids(await list(issuer.agent, { q: issuer.rejected.number }))).toEqual([issuer.rejected.id]);
      expect(ids(await list(issuer.agent, { q: issuer.rejected.number.toLowerCase() }))).toEqual([issuer.rejected.id]);
      expect(ids(await list(issuer.agent, { q: `-${issuer.rejected.number.slice(-4)}` }))).toEqual([issuer.rejected.id]);
    });

    it('finds an invoice numbered past 9999', async () => {
      const { agent, taxId } = await issuingUser();
      const ruzafa = await createRecipient(agent, 'Clínica Dental Ruzafa SL');
      await issue(agent, ruzafa, '100');
      await db.$client.query(
        'UPDATE series_counters SET last_number = 12344 WHERE issuer_id = (SELECT id FROM issuers WHERE tax_id = $1)',
        [taxId],
      );
      const invoice = await issue(agent, ruzafa, '200');
      expect(invoice.number).toMatch(/-12345$/);

      expect(ids(await list(agent, { q: invoice.number }))).toEqual([invoice.id]);
    });

    it('finds drafts and invoices by the recipient, ignoring case and accents', async () => {
      const issuer = await issuerWithEveryState();

      const page = await list(issuer.agent, { q: 'ODONTOLOGICO' });

      expect(ids(page)).toEqual([issuer.voided.id, issuer.rejected.id, issuer.pending.id]);
      expect(ids(await list(issuer.agent, { q: 'ruzafa' }))).toEqual([
        issuer.draft,
        issuer.rectified.id,
        issuer.unconfirmed.id,
        issuer.accepted.id,
      ]);
    });

    it('finds drafts and invoices by their total amount or amount due, typed as Spaniards do', async () => {
      const issuer = await issuerWithEveryState();

      expect(ids(await list(issuer.agent, { q: '3.960,00 €' }))).toEqual([issuer.rejected.id]);
      expect(ids(await list(issuer.agent, { q: '3366' }))).toEqual([issuer.rejected.id]);
      expect(ids(await list(issuer.agent, { q: '4.369' }))).toEqual([issuer.draft]);
    });

    it('counts what matches the search under each filter', async () => {
      const issuer = await issuerWithEveryState();

      const page = await list(issuer.agent, { q: 'ruzafa', filter: 'incidents' });

      expect(ids(page)).toEqual([issuer.unconfirmed.id]);
      expect(page.counts).toEqual({ all: 4, drafts: 1, pending: 0, accepted: 1, incidents: 1, rectified: 1, voided: 0 });
    });

    it('treats LIKE wildcards as text', async () => {
      const issuer = await issuerWithEveryState();

      expect((await list(issuer.agent, { q: '%' })).items).toEqual([]);
    });
  });

  describe('pagination', () => {
    it('walks every page once, without gaps or repeats, drafts in their place', async () => {
      const issuer = await issuerWithEveryState();
      // A draft edited between the invoices' issuances, not at the end.
      const older = await createDraft(issuer.agent, issuer.ruzafa, '10');
      await db.$client.query(
        `UPDATE drafts SET updated_at = (SELECT created_at FROM invoices WHERE id = $2) + interval '1 millisecond' WHERE id = $1`,
        [older, issuer.pending.id],
      );

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page: InvoiceList = await list(issuer.agent, { limit: 2, ...(cursor ? { cursor } : {}) });
        expect(page.items.length).toBeLessThanOrEqual(2);
        seen.push(...ids(page));
        cursor = page.nextCursor;
        pages++;
      } while (cursor);

      expect(pages).toBe(4);
      expect(seen).toEqual([
        issuer.draft,
        issuer.voided.id,
        issuer.rectified.id,
        issuer.unconfirmed.id,
        issuer.rejected.id,
        older,
        issuer.pending.id,
        issuer.accepted.id,
      ]);
    });

    it('rejects a cursor it did not give', async () => {
      const { agent } = await issuingUser();

      await agent.get('/invoices').query({ cursor: 'nonsense' }).expect(400);
    });
  });

  it('never lists another issuer’s drafts or invoices', async () => {
    const issuer = await issuerWithEveryState();
    const { agent } = await issuingUser();

    const page = await list(agent);

    expect(page.items).toEqual([]);
    expect(page.counts.all).toBe(0);
    expect(ids(await list(issuer.agent))).toHaveLength(7);
  });

  describe('incidents', () => {
    it('lists the invoices whose record needs the user, longest waiting first, with what went wrong', async () => {
      const { agent } = await issuingUser();
      const ruzafa = await createRecipient(agent, 'Clínica Dental Ruzafa SL');
      const blocked = await issue(agent, ruzafa, '100');
      await setRecord(blocked.id, 'blocked', { message: 'NIF del destinatario no válido', hoursAgo: 3 });
      const rejected = await issue(agent, ruzafa, '200');
      await setRecord(rejected.id, 'rejected', { message: 'El NIF del destinatario no está identificado.', hoursAgo: 2 });
      const withErrors = await issue(agent, ruzafa, '300');
      await setRecord(withErrors.id, 'accepted-with-errors', { message: 'El nombre no coincide.', hoursAgo: 1 });
      const unconfirmed = await issue(agent, ruzafa, '400');
      await setRecord(unconfirmed.id, 'submitted', { hoursAgo: 30 });
      await issue(agent, ruzafa, '500');
      const accepted = await issue(agent, ruzafa, '600');
      await setRecord(accepted.id, 'accepted');

      const { body } = await agent.get('/invoices/incidents').expect(200);

      const recipientName = 'Clínica Dental Ruzafa SL';
      expect(body).toEqual([
        { id: unconfirmed.id, number: unconfirmed.number, recipientName, recordStatus: 'submitted', unconfirmed: true, message: null },
        { id: blocked.id, number: blocked.number, recipientName, recordStatus: 'blocked', unconfirmed: false, message: 'NIF del destinatario no válido' },
        {
          id: rejected.id,
          number: rejected.number,
          recipientName,
          recordStatus: 'rejected',
          unconfirmed: false,
          message: 'El NIF del destinatario no está identificado.',
        },
        { id: withErrors.id, number: withErrors.number, recipientName, recordStatus: 'accepted-with-errors', unconfirmed: false, message: 'El nombre no coincide.' },
      ]);
    });

    it('leaves out voided and rectified invoices', async () => {
      const { agent } = await issuingUser();
      const ruzafa = await createRecipient(agent, 'Clínica Dental Ruzafa SL');
      const voided = await issue(agent, ruzafa, '100');
      await setRecord(voided.id, 'accepted-with-errors', { message: 'El nombre no coincide.' });
      await setInvoiceStatus(voided.id, 'voided');

      expect((await agent.get('/invoices/incidents').expect(200)).body).toEqual([]);
    });
  });
});

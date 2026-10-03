import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type {
  ConnectorIssuer,
  ConnectorResult,
  RecordInvoice,
  RecordRef,
  VerifactuConnector,
} from '../src/verifactu/connector.js';
import { todayInSpain } from '../src/verifactu/dates.js';

export interface ContractHarness {
  connector: VerifactuConnector;
  /** An issuer the connector may register. The sandbox reuses the operator's test tax ID. */
  issuer: ConnectorIssuer;
  /** Registered in the AEAT census under this name. */
  recipient: { taxId: string; name: string };
  /** Waits until the AEAT has a verdict on the record; the fake hands down the given one. */
  awaitVerdict(record: RecordRef, verdict: 'accepted'): Promise<void>;
}

export function ok<T>(result: ConnectorResult<T>): T {
  if (result.outcome !== 'ok') throw new Error(`Expected ok, got ${JSON.stringify(result)}`);
  return result.value;
}

let invoiceCounter = 0;

/** A valid invoice under a series no earlier run used, so the AEAT never sees a duplicate. */
export function anInvoice(recipient: ContractHarness['recipient'], overrides: Partial<RecordInvoice> = {}): RecordInvoice {
  invoiceCounter += 1;
  return {
    series: `T${Date.now().toString(36).toUpperCase()}`,
    number: String(invoiceCounter),
    issueDate: todayInSpain(),
    type: 'F1',
    operationDescription: 'Servicios de odontología',
    recipient,
    lines: [
      { kind: 'taxed', taxBase: '200.00', vatRate: 21, taxAmount: '42.00' },
      { kind: 'exempt', taxBase: '100.00', exemptionCode: 'E1' },
    ],
    totalAmount: '342.00',
    ...overrides,
  };
}

const submission = (invoice: RecordInvoice) => ({
  invoiceRecordId: randomUUID(),
  idempotencyKey: randomUUID(),
  invoice,
});

/** What every VerifactuConnector adapter must do the same way. */
export function verifactuConnectorContract(
  name: string,
  makeHarness: () => Promise<ContractHarness>,
  {
    managesIssuers = true,
  }: {
    /**
     * False when the harness only holds a key for one tax ID (Verifacti's free test company): the issuer
     * is already registered, and registering issuers, the Representation and the census are left out.
     */
    managesIssuers?: boolean;
  } = {},
) {
  describe(`VerifactuConnector contract: ${name}`, () => {
    let h: ContractHarness;

    beforeAll(async () => {
      h = await makeHarness();
      if (managesIssuers) ok(await h.connector.createIssuerKey(h.issuer));
    }, 60_000);

    describe.runIf(managesIssuers)('issuers', () => {
      it('creates the issuer key again without complaint', async () => {
        expect(await h.connector.createIssuerKey(h.issuer)).toEqual({ outcome: 'ok', value: undefined });
      });

      it('reports the representation state', async () => {
        const status = ok(await h.connector.representationStatus(h.issuer));
        expect(['none', 'pending', 'signed', 'rejected', 'expired', 'cancelled']).toContain(status.state);
      });

      it('finds a registered tax ID in the census', async () => {
        const check = ok(await h.connector.validateTaxId(h.issuer, h.recipient));
        expect(check.result).toBe('identified');
      });

      it('does not find an unregistered tax ID in the census', async () => {
        const check = ok(await h.connector.validateTaxId(h.issuer, { taxId: '00000000T', name: 'NADIE NADIE NADIE' }));
        expect(check.result).not.toBe('identified');
      });
    });

    it('queues a record with its fingerprint and QR, pending until the AEAT decides', async () => {
      const invoice = anInvoice(h.recipient);
      const record = submission(invoice);
      const queued = ok(await h.connector.submitRecord(h.issuer, record));

      expect(queued.fingerprint).toMatch(/^[0-9A-F]{64}$/);
      expect(Buffer.from(queued.qrPng, 'base64').length).toBeGreaterThan(0);
      const url = new URL(queued.verificationUrl);
      expect(url.searchParams.get('nif')).toBe(h.issuer.taxId);
      // Verifacti's free test company is one NIF shared by every account, so it prefixes each account's series.
      expect(url.searchParams.get('numserie')).toMatch(new RegExp(`^(\\w+_)?${invoice.series}${invoice.number}$`));
      expect(url.searchParams.get('importe')).toMatch(/^342(\.00?)?$/);

      const status = ok(await h.connector.recordStatus(h.issuer, { invoiceRecordId: record.invoiceRecordId, ...queued }));
      expect(['pending', 'accepted']).toContain(status.state);
    });

    it('rejects synchronously a record whose total does not add up, with a stable code', async () => {
      const result = await h.connector.submitRecord(h.issuer, submission(anInvoice(h.recipient, { totalAmount: '999.00' })));
      expect(result).toMatchObject({ outcome: 'rejected', code: expect.any(String), message: expect.any(String) });
      if (result.outcome === 'rejected') expect(result.code).not.toBe('');
    });

    it('replays the same record for a repeated idempotency key', async () => {
      const first = submission(anInvoice(h.recipient));
      const queued = ok(await h.connector.submitRecord(h.issuer, first));
      const replayed = ok(await h.connector.submitRecord(h.issuer, first));
      expect(replayed.connectorRecordId).toBe(queued.connectorRecordId);
      expect(replayed.fingerprint).toBe(queued.fingerprint);
    });

    it('rejects an idempotency key reused with different data', async () => {
      const first = submission(anInvoice(h.recipient));
      ok(await h.connector.submitRecord(h.issuer, first));
      const result = await h.connector.submitRecord(h.issuer, { ...first, invoice: anInvoice(h.recipient) });
      expect(result.outcome).toBe('rejected');
    });

    it('rejects asking for a record it does not know', async () => {
      const result = await h.connector.recordStatus(h.issuer, {
        invoiceRecordId: randomUUID(),
        connectorRecordId: randomUUID(),
      });
      expect(result.outcome).toBe('rejected');
    });

    it(
      'records the AEAT verdict, then amends and voids the invoice',
      async () => {
        const invoice = anInvoice(h.recipient);
        const record = submission(invoice);
        const queued = ok(await h.connector.submitRecord(h.issuer, record));
        const ref = { invoiceRecordId: record.invoiceRecordId, connectorRecordId: queued.connectorRecordId };
        await h.awaitVerdict(ref, 'accepted');
        expect(ok(await h.connector.recordStatus(h.issuer, ref))).toEqual({ state: 'accepted' });

        const amendment = ok(
          await h.connector.amendRecord(h.issuer, {
            ...submission({ ...invoice, operationDescription: 'Servicios de odontología (corregido)' }),
            previousRejection: 'none',
          }),
        );
        const amendmentRef = { invoiceRecordId: record.invoiceRecordId, connectorRecordId: amendment.connectorRecordId };
        expect(amendment.connectorRecordId).not.toBe(queued.connectorRecordId);
        expect(amendment.fingerprint).toMatch(/^[0-9A-F]{64}$/);
        await h.awaitVerdict(amendmentRef, 'accepted');
        expect(ok(await h.connector.recordStatus(h.issuer, amendmentRef)).state).toBe('accepted');

        const voiding = ok(
          await h.connector.voidRecord(h.issuer, {
            invoiceRecordId: record.invoiceRecordId,
            idempotencyKey: randomUUID(),
            invoice: { series: invoice.series, number: invoice.number, issueDate: invoice.issueDate },
            previouslyRejected: false,
            notRegistered: false,
          }),
        );
        expect(voiding.fingerprint).toMatch(/^[0-9A-F]{64}$/);
        const voidingRef = { invoiceRecordId: record.invoiceRecordId, connectorRecordId: voiding.connectorRecordId };
        await h.awaitVerdict(voidingRef, 'accepted');
        expect(ok(await h.connector.recordStatus(h.issuer, voidingRef))).toEqual({ state: 'voided' });
      },
      // The AEAT test environment may take a few minutes per record.
      15 * 60_000,
    );
  });
}

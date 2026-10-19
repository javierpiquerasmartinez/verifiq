import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import { fiscalData } from './issuer.js';
import { anInvoice, ok } from './verifactu-contract.js';

const recipient = { taxId: 'B12345674', name: 'CLINICA DENTAL MAR SL' };

describe('FakeVerifactuConnector programming', () => {
  let fake: FakeVerifactuConnector;
  const issuer = { issuerId: randomUUID(), ...fiscalData() };
  const submission = () => ({ invoiceRecordId: randomUUID(), idempotencyKey: randomUUID(), invoice: anInvoice(recipient) });

  beforeEach(async () => {
    fake = new FakeVerifactuConnector();
    ok(await fake.createIssuerKey(issuer));
  });

  it('answers a programmed rejection with its code', async () => {
    fake.failNext({ kind: 'rejected', code: 'vf-verifactu-nif_destinatario', message: 'NIF no censado' }, 'submitRecord');
    expect(await fake.submitRecord(issuer, submission())).toEqual({
      outcome: 'rejected',
      code: 'vf-verifactu-nif_destinatario',
      message: 'NIF no censado',
    });
  });

  it('answers a programmed server error once, then works again', async () => {
    fake.failNext({ kind: 'server-error' });
    const record = submission();
    expect(await fake.submitRecord(issuer, record)).toMatchObject({ outcome: 'transient', reason: 'server-error' });
    expect((await fake.submitRecord(issuer, record)).outcome).toBe('ok');
  });

  it('only fails the operation it was programmed for', async () => {
    fake.failNext({ kind: 'server-error' }, 'recordStatus');
    const queued = ok(await fake.submitRecord(issuer, submission()));
    expect(
      await fake.recordStatus(issuer, { invoiceRecordId: randomUUID(), connectorRecordId: queued.connectorRecordId }),
    ).toMatchObject({ outcome: 'transient' });
  });

  it('after a timeout that was processed, a retry with the same key replays the record', async () => {
    fake.failNext({ kind: 'timeout', processed: true }, 'submitRecord');
    const record = submission();
    expect(await fake.submitRecord(issuer, record)).toMatchObject({ outcome: 'transient', reason: 'timeout' });
    const first = ok(await fake.submitRecord(issuer, record));
    const again = ok(await fake.submitRecord(issuer, record));
    expect(again.connectorRecordId).toBe(first.connectorRecordId);
    expect(fake.calls.filter((call) => call.operation === 'submitRecord')).toHaveLength(3);
  });

  it.each([
    ['accepted', { state: 'accepted' }],
    ['rejected', { state: 'rejected', aeatError: { code: '1100', message: 'Valor no permitido' } }],
    ['accepted-with-errors', { state: 'accepted-with-errors', aeatError: { code: '2000', message: 'Aviso' } }],
  ] as const)('hands down an AEAT verdict: %s', async (verdict, expected) => {
    const queued = ok(await fake.submitRecord(issuer, submission()));
    fake.settle(queued.connectorRecordId, verdict, 'aeatError' in expected ? { aeatError: expected.aeatError } : {});
    expect(
      ok(await fake.recordStatus(issuer, { invoiceRecordId: randomUUID(), connectorRecordId: queued.connectorRecordId })),
    ).toEqual(expected);
  });

  it('refuses records of an issuer without a key', async () => {
    const other = { issuerId: randomUUID(), ...fiscalData() };
    expect(await fake.submitRecord(other, submission())).toMatchObject({
      outcome: 'rejected',
      code: 'issuer-not-registered',
    });
  });

  it('refuses an issue date other than today', async () => {
    const record = { ...submission(), invoice: anInvoice(recipient, { issueDate: '2020-01-01' }) };
    expect((await fake.submitRecord(issuer, record)).outcome).toBe('rejected');
  });

  it('amends a record issued on an earlier day', async () => {
    const amendment = {
      ...submission(),
      invoice: anInvoice(recipient, { issueDate: '2026-01-15' }),
      previousRejection: 'none' as const,
    };
    expect((await fake.amendRecord(issuer, amendment)).outcome).toBe('ok');
  });

  it('follows the remote signing of the representation', async () => {
    expect(ok(await fake.representationStatus(issuer))).toEqual({ state: 'none' });
    const { signingUrl } = ok(
      await fake.startRepresentationSigning(issuer, {
        firstName: 'Lucía',
        lastNames: 'Ferrer Albiol',
        municipality: 'València',
        street: 'Carrer de Colón',
        streetNumber: '12',
        email: 'lucia@example.com',
      }),
    );
    expect(ok(await fake.representationStatus(issuer))).toEqual({ state: 'pending', signingUrl });
    fake.signRepresentation(issuer.issuerId);
    expect(ok(await fake.representationStatus(issuer))).toEqual({ state: 'signed' });
  });
});

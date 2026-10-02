import { randomBytes, randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inject } from 'vitest';
import type { Database } from '../src/database/database.module.js';
import * as schema from '../src/database/schema.js';
import { connectorCredentials, issuers } from '../src/database/schema.js';
import type { ConnectorIssuer, RecordInvoice } from '../src/verifactu/connector.js';
import { findConnectorExchanges } from '../src/verifactu/exchanges.js';
import { SecretBox } from '../src/verifactu/secret-box.js';
import { VerifactiConnector } from '../src/verifactu/verifacti-connector.js';
import { fiscalData } from './issuer.js';
import { VerifactiStub } from './verifacti-stub.js';

const ACCOUNT_KEY = 'vfn_account_key';
const ISSUER_KEY = 'vf_test_issuer_key_123';

let db: Database;

beforeAll(() => {
  db = drizzle({ client: new pg.Pool({ connectionString: inject('databaseUrl') }), schema });
});

afterAll(async () => {
  await db.$client.end();
});

async function newIssuer(): Promise<ConnectorIssuer> {
  const data = fiscalData();
  const [row] = await db.insert(issuers).values(data).returning({ issuerId: issuers.id });
  return { issuerId: row!.issuerId, ...data };
}

function connectorFor(stub: VerifactiStub, timeoutMs = 2_000) {
  return new VerifactiConnector({
    accountApiKey: ACCOUNT_KEY,
    environment: 'test',
    baseUrl: 'https://verifacti.example.test',
    timeoutMs,
    db,
    secretBox: new SecretBox(randomBytes(32).toString('base64')),
    fetch: stub.fetch,
  });
}

describe('VerifactiConnector: issuer key', () => {
  let stub: VerifactiStub;
  let issuer: ConnectorIssuer;

  beforeEach(async () => {
    stub = new VerifactiStub()
      .on('POST /nifs', { status: 200, body: [{ nif: 'x', activo: true }] })
      .on('GET /nifs/keys/test/' + (issuer = await newIssuer()).taxId, { status: 200, body: { api_key: ISSUER_KEY } });
  });

  it('registers the tax ID with the account key and keeps the issuer key sealed', async () => {
    const connector = connectorFor(stub);
    expect(await connector.createIssuerKey(issuer)).toEqual({ outcome: 'ok', value: undefined });

    const created = stub.last('POST /nifs');
    expect(created.headers.authorization).toBe(`Bearer ${ACCOUNT_KEY}`);
    expect(created.body).toEqual([
      {
        nif: issuer.taxId,
        nombre: issuer.name,
        entorno: 'test',
        hacienda: 'verifactu',
        direccion: issuer.address,
        cp: issuer.postalCode,
        poblacion: issuer.municipality,
        provincia: issuer.province,
      },
    ]);

    const [credentials] = await db
      .select()
      .from(connectorCredentials)
      .where(eq(connectorCredentials.issuerId, issuer.issuerId));
    expect(credentials).toMatchObject({ environment: 'test' });
    expect(credentials!.sealedApiKey).not.toContain(ISSUER_KEY);
  });

  it('still fetches the key when the tax ID was already registered', async () => {
    stub.on('POST /nifs', { status: 409, body: { error: 'NIF ya existe' } });
    expect((await connectorFor(stub).createIssuerKey(issuer)).outcome).toBe('ok');
  });

  it('never stores a key in the exchange log', async () => {
    await connectorFor(stub).createIssuerKey(issuer);
    const exchanges = await findConnectorExchanges(db, issuer.issuerId);
    expect(exchanges.map((exchange) => exchange.operation)).toEqual(['createIssuerKey', 'createIssuerKey']);
    const logged = JSON.stringify(exchanges);
    expect(logged).not.toContain(ISSUER_KEY);
    expect(logged).not.toContain(ACCOUNT_KEY);
  });
});

const QUEUED = {
  uuid: 'b018ced3-b362-4494-8776-9eefff1c160c',
  estado: 'Pendiente',
  url: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=A15022510&numserie=F1&fecha=03-10-2026&importe=342.00',
  qr: 'iVBORw0KGgo=',
  huella: 'B11F3A015173AD99075E2720F61E2DE1FF08CBFEDD85C6F73C77AD835301B2A3',
};

const invoice = (overrides: Partial<RecordInvoice> = {}): RecordInvoice => ({
  series: 'F',
  number: '7',
  issueDate: '2026-10-03',
  type: 'F1',
  operationDescription: 'Servicios de odontología septiembre 2026',
  recipient: { taxId: 'B12345674', name: 'Clínica Dental Mar SL' },
  lines: [
    { kind: 'taxed', taxBase: '200.00', vatRate: 21, taxAmount: '42.00' },
    { kind: 'exempt', taxBase: '100.00', exemptionCode: 'E1' },
  ],
  totalAmount: '342.00',
  ...overrides,
});

/** An issuer whose key the adapter already holds. */
async function registeredIssuer(stub: VerifactiStub, timeoutMs?: number) {
  const issuer = await newIssuer();
  stub
    .on('POST /nifs', { status: 200, body: [] })
    .on(`GET /nifs/keys/test/${issuer.taxId}`, { status: 200, body: { api_key: ISSUER_KEY } });
  const connector = connectorFor(stub, timeoutMs);
  expect((await connector.createIssuerKey(issuer)).outcome).toBe('ok');
  return { issuer, connector };
}

describe('VerifactiConnector: records', () => {
  it('submits the record with the issuer key and an idempotency key, and keeps the exchange', async () => {
    const stub = new VerifactiStub().on('POST /verifactu/create', { status: 200, body: QUEUED });
    const { issuer, connector } = await registeredIssuer(stub);
    const invoiceRecordId = randomUUID();

    const result = await connector.submitRecord(issuer, { invoiceRecordId, idempotencyKey: 'key-1', invoice: invoice() });

    expect(result).toEqual({
      outcome: 'ok',
      value: {
        connectorRecordId: QUEUED.uuid,
        fingerprint: QUEUED.huella,
        verificationUrl: QUEUED.url,
        qrPng: QUEUED.qr,
      },
    });
    const sent = stub.last('POST /verifactu/create');
    expect(sent.headers.authorization).toBe(`Bearer ${ISSUER_KEY}`);
    expect(sent.headers['idempotency-key']).toBe('key-1');
    expect(sent.body).toEqual({
      serie: 'F',
      numero: '7',
      fecha_expedicion: '03-10-2026',
      tipo_factura: 'F1',
      descripcion: 'Servicios de odontología septiembre 2026',
      nif: 'B12345674',
      nombre: 'Clínica Dental Mar SL',
      lineas: [
        { base_imponible: '200.00', impuesto: '01', tipo_impositivo: '21', cuota_repercutida: '42.00' },
        { base_imponible: '100.00', impuesto: '01', operacion_exenta: 'E1' },
      ],
      importe_total: '342.00',
    });

    const [exchange] = await findConnectorExchanges(db, issuer.issuerId, { invoiceRecordId });
    expect(exchange).toMatchObject({
      operation: 'submitRecord',
      method: 'POST',
      url: 'https://verifacti.example.test/verifactu/create',
      requestHeaders: { authorization: 'Bearer [redacted]', 'idempotency-key': 'key-1' },
      responseStatus: 200,
      error: null,
    });
    expect(JSON.parse(exchange!.requestBody!)).toEqual(sent.body);
    expect(JSON.parse(exchange!.responseBody!)).toEqual(QUEUED);
  });

  it('sends a corrective invoice by differences with the invoices it corrects', async () => {
    const stub = new VerifactiStub().on('POST /verifactu/create', { status: 200, body: QUEUED });
    const { issuer, connector } = await registeredIssuer(stub);
    await connector.submitRecord(issuer, {
      invoiceRecordId: randomUUID(),
      idempotencyKey: randomUUID(),
      invoice: invoice({
        type: 'R1',
        series: 'R',
        operationDate: '2026-09-30',
        corrects: [{ series: 'F', number: '3', issueDate: '2026-09-01' }],
      }),
    });
    expect(stub.last('POST /verifactu/create').body).toMatchObject({
      serie: 'R',
      tipo_factura: 'R1',
      fecha_operacion: '30-09-2026',
      tipo_rectificativa: 'I',
      facturas_rectificadas: [{ serie: 'F', numero: '3', fecha_expedicion: '01-09-2026' }],
    });
  });

  it('amends a record, saying whether the AEAT rejected it', async () => {
    const stub = new VerifactiStub().on('PUT /verifactu/modify', { status: 200, body: QUEUED });
    const { issuer, connector } = await registeredIssuer(stub);
    const result = await connector.amendRecord(issuer, {
      invoiceRecordId: randomUUID(),
      idempotencyKey: 'amend-1',
      invoice: invoice(),
      previousRejection: 'record',
    });
    expect(result.outcome).toBe('ok');
    expect(stub.last('PUT /verifactu/modify').body).toMatchObject({ serie: 'F', numero: '7', rechazo_previo: 'X' });
    expect(stub.last('PUT /verifactu/modify').headers['idempotency-key']).toBe('amend-1');
  });

  it('voids a record', async () => {
    const stub = new VerifactiStub().on('POST /verifactu/cancel', {
      status: 200,
      body: { uuid: QUEUED.uuid, huella: QUEUED.huella, estado: 'Pendiente' },
    });
    const { issuer, connector } = await registeredIssuer(stub);
    const result = await connector.voidRecord(issuer, {
      invoiceRecordId: randomUUID(),
      idempotencyKey: 'void-1',
      invoice: { series: 'F', number: '7', issueDate: '2026-10-03' },
      previouslyRejected: false,
      notRegistered: true,
    });
    expect(result).toEqual({ outcome: 'ok', value: { connectorRecordId: QUEUED.uuid, fingerprint: QUEUED.huella } });
    expect(stub.last('POST /verifactu/cancel').body).toEqual({
      serie: 'F',
      numero: '7',
      fecha_expedicion: '03-10-2026',
      rechazo_previo: 'N',
      sin_registro_previo: 'S',
    });
  });

  it('refuses records of an issuer without a key, without calling Verifacti', async () => {
    const stub = new VerifactiStub();
    const issuer = await newIssuer();
    const result = await connectorFor(stub).submitRecord(issuer, {
      invoiceRecordId: randomUUID(),
      idempotencyKey: randomUUID(),
      invoice: invoice(),
    });
    expect(result).toMatchObject({ outcome: 'rejected', code: 'issuer-not-registered' });
    expect(stub.requests).toHaveLength(0);
  });
});

describe('VerifactiConnector: failures', () => {
  const submit = async (reply: Parameters<VerifactiStub['on']>[1], timeoutMs?: number) => {
    const stub = new VerifactiStub().on('POST /verifactu/create', reply);
    const { issuer, connector } = await registeredIssuer(stub, timeoutMs);
    const invoiceRecordId = randomUUID();
    const result = await connector.submitRecord(issuer, { invoiceRecordId, idempotencyKey: randomUUID(), invoice: invoice() });
    const [exchange] = await findConnectorExchanges(db, issuer.issuerId, { invoiceRecordId });
    return { result, exchange };
  };

  it('a 400 is a rejection with Verifacti’s stable code and message', async () => {
    const error = { error: 'El campo tipo_factura debe ser F1, F2…', codigo: 'vf-verifactu-tipo_factura_valor' };
    const { result, exchange } = await submit({ status: 400, body: error });
    expect(result).toEqual({ outcome: 'rejected', code: error.codigo, message: error.error });
    expect(exchange).toMatchObject({ responseStatus: 400 });
    expect(JSON.parse(exchange!.responseBody!)).toEqual(error);
  });

  it.each([500, 502])('a %i is transient', async (status) => {
    const { result } = await submit({ status, body: { error: 'Error interno' } });
    expect(result).toMatchObject({ outcome: 'transient', reason: 'server-error' });
  });

  it('no answer in time is transient, and the attempt is kept', async () => {
    const { result, exchange } = await submit('timeout', 50);
    expect(result).toMatchObject({ outcome: 'transient', reason: 'timeout' });
    expect(exchange).toMatchObject({ responseStatus: null, responseBody: null });
    expect(exchange!.error).toMatch(/50 ms/);
    expect(exchange!.requestBody).not.toBeNull();
  });

  it('a network error is transient', async () => {
    const { result, exchange } = await submit('network-error');
    expect(result).toMatchObject({ outcome: 'transient', reason: 'network' });
    expect(exchange!.error).toMatch(/fetch failed/);
  });

  it('a request still in progress under the same idempotency key is transient', async () => {
    const { result } = await submit({ status: 409, body: { error: 'Otra petición se está procesando' } });
    expect(result).toMatchObject({ outcome: 'transient', reason: 'in-progress' });
  });

  it('an idempotency key reused with other data is a rejection', async () => {
    const { result } = await submit({ status: 422, body: { error: 'idempotency_key_reused' } });
    expect(result).toMatchObject({ outcome: 'rejected', code: 'idempotency-key-reused' });
  });

  it('a revoked key is transient: the operator must fix it', async () => {
    const { result } = await submit({ status: 401, body: { error: 'API key inválida' } });
    expect(result).toMatchObject({ outcome: 'transient', reason: 'unauthorized' });
  });
});

describe('VerifactiConnector: record status', () => {
  it.each([
    ['Pendiente', { state: 'pending' }],
    ['Error servidor AEAT', { state: 'pending' }],
    ['Correcto', { state: 'accepted' }],
    ['Aceptado con errores', { state: 'accepted-with-errors', aeatError: { code: '2004', message: 'Aviso' } }],
    ['Incorrecto', { state: 'rejected', aeatError: { code: '1100', message: 'Valor no permitido' } }],
    ['No registrado', { state: 'rejected', aeatError: { code: '1100', message: 'Valor no permitido' } }],
    ['Duplicado', { state: 'duplicate', aeatError: { code: '3000', message: 'Registro duplicado' } }],
    ['Anulado', { state: 'voided' }],
  ] as const)('%s', async (estado, expected) => {
    const aeatError = 'aeatError' in expected ? expected.aeatError : undefined;
    const stub = new VerifactiStub().on('GET /verifactu/status', {
      status: 200,
      body: {
        estado,
        nif: 'A15022510',
        ...(aeatError && { codigo_error: Number(aeatError.code), mensaje_error: aeatError.message }),
      },
    });
    const { issuer, connector } = await registeredIssuer(stub);
    const result = await connector.recordStatus(issuer, { invoiceRecordId: randomUUID(), connectorRecordId: QUEUED.uuid });
    expect(result).toEqual({ outcome: 'ok', value: expected });
    expect(stub.last('GET /verifactu/status').query.get('uuid')).toBe(QUEUED.uuid);
  });

  it('an unknown record is a rejection', async () => {
    const stub = new VerifactiStub().on('GET /verifactu/status', { status: 404 });
    const { issuer, connector } = await registeredIssuer(stub);
    const result = await connector.recordStatus(issuer, { invoiceRecordId: randomUUID(), connectorRecordId: QUEUED.uuid });
    expect(result).toMatchObject({ outcome: 'rejected', code: 'not-found' });
  });
});

describe('VerifactiConnector: representation and census', () => {
  it('starts the remote signing with the account key', async () => {
    const stub = new VerifactiStub();
    const issuer = await newIssuer();
    stub.on(`POST /representacion/firma_remota/${issuer.taxId}`, {
      status: 200,
      body: { url: 'https://saas.esignanywhere.net/workstepredirector/go#abc' },
    });
    const result = await connectorFor(stub).startRepresentationSigning(issuer, {
      firstName: 'Lucía',
      lastNames: 'Ferrer Albiol',
      municipality: 'València',
      street: 'Carrer de Colón',
      streetNumber: '12',
      email: 'lucia@example.com',
    });
    expect(result).toEqual({
      outcome: 'ok',
      value: { signingUrl: 'https://saas.esignanywhere.net/workstepredirector/go#abc' },
    });
    const sent = stub.last(`POST /representacion/firma_remota/${issuer.taxId}`);
    expect(sent.headers.authorization).toBe(`Bearer ${ACCOUNT_KEY}`);
    expect(sent.body).toEqual({
      nombre: 'Lucía',
      apellidos: 'Ferrer Albiol',
      municipio: 'València',
      calle: 'Carrer de Colón',
      numero: '12',
      email: 'lucia@example.com',
      idioma: 'es',
    });
  });

  it.each([
    [{ estado: 'Correcto' }, { state: 'signed' }],
    [{ estado: 'Inexistente' }, { state: 'none' }],
    [{ estado: 'Pendiente', firma_remota: true, url: 'https://sign.example/x' }, { state: 'pending', signingUrl: 'https://sign.example/x' }],
    [{ estado: 'Caducado' }, { state: 'expired' }],
    [{ estado: 'Rechazado', error: 'Firma no válida' }, { state: 'rejected' }],
    [{ estado: 'Cancelado' }, { state: 'cancelled' }],
  ])('reports the representation %o', async (body, expected) => {
    const stub = new VerifactiStub();
    const issuer = await newIssuer();
    stub.on(`GET /representacion/estado/${issuer.taxId}`, { status: 200, body });
    expect(await connectorFor(stub).representationStatus(issuer)).toEqual({ outcome: 'ok', value: expected });
  });

  it.each([
    ['IDENTIFICADO', 'identified'],
    ['NO IDENTIFICADO', 'not-identified'],
    ['NO IDENTIFICADO-SIMILAR', 'name-mismatch'],
    ['IDENTIFICADO-BAJA', 'deregistered'],
    ['IDENTIFICADO-REVOCADO', 'revoked'],
  ])('checks the census: %s', async (resultado, result) => {
    const stub = new VerifactiStub().on('POST /nifs/validar', {
      status: 200,
      body: { nif: 'B12345674', nombre: 'CLINICA DENTAL MAR SL', resultado },
    });
    const issuer = await newIssuer();
    const check = await connectorFor(stub).validateTaxId(issuer, { taxId: 'B12345674', name: 'Clínica Dental Mar' });
    expect(check).toEqual({ outcome: 'ok', value: { result, name: 'CLINICA DENTAL MAR SL' } });
    expect(stub.last('POST /nifs/validar').body).toEqual({ nif: 'B12345674', nombre: 'Clínica Dental Mar' });
    expect((await findConnectorExchanges(db, issuer.issuerId))[0]).toMatchObject({ operation: 'validateTaxId' });
  });

  it('a census that does not answer is transient', async () => {
    const stub = new VerifactiStub().on('POST /nifs/validar', { status: 200, body: { nif: 'B12345674', resultado: 'ERROR' } });
    const result = await connectorFor(stub).validateTaxId(await newIssuer(), { taxId: 'B12345674' });
    expect(result).toMatchObject({ outcome: 'transient' });
  });
});

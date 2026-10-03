import { randomBytes, randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, describe, inject } from 'vitest';
import type { Database } from '../src/database/database.module.js';
import * as schema from '../src/database/schema.js';
import { issuers } from '../src/database/schema.js';
import { saveIssuerApiKey } from '../src/verifactu/credentials.js';
import { FakeVerifactuConnector } from '../src/verifactu/fake-connector.js';
import { SecretBox } from '../src/verifactu/secret-box.js';
import { VerifactiConnector } from '../src/verifactu/verifacti-connector.js';
import { fiscalData } from './issuer.js';
import { ok, verifactuConnectorContract } from './verifactu-contract.js';

verifactuConnectorContract('in-memory fake', async () => {
  const connector = new FakeVerifactuConnector();
  const recipient = { taxId: 'B12345674', name: 'CLINICA DENTAL MAR SL' };
  connector.census.set(recipient.taxId, recipient.name);
  return {
    connector,
    issuer: { issuerId: randomUUID(), ...fiscalData() },
    recipient,
    async awaitVerdict(record, verdict) {
      connector.settle(record.connectorRecordId, verdict);
    },
  };
});

// On demand only (it sends real records to the AEAT test environment): the CI workflow
// "Verifacti contract" or a local run with these variables. Never starts a paid remote signing.
const sandbox = {
  // Account key (vfn_…, paid plan): the whole contract, registering issuers included.
  accountApiKey: process.env.VERIFACTI_TEST_ACCOUNT_API_KEY,
  // Key of the free plan's test company (vf_test_…): the records part of the contract only.
  issuerApiKey: process.env.VERIFACTI_TEST_ISSUER_API_KEY,
  // The test NIF and its name in the census (GET /verifactu/health with the issuer key returns the NIF).
  taxId: process.env.VERIFACTI_TEST_TAX_ID,
  name: process.env.VERIFACTI_TEST_NAME,
};
const managesIssuers = Boolean(sandbox.accountApiKey);
const sandboxConfigured = Boolean((sandbox.accountApiKey || sandbox.issuerApiKey) && sandbox.taxId && sandbox.name);

describe.runIf(sandboxConfigured)('Verifacti sandbox', () => {
  let db: Database | undefined;

  afterAll(async () => {
    await db?.$client.end();
  });

  verifactuConnectorContract(
    managesIssuers ? 'Verifacti sandbox' : 'Verifacti sandbox, free test company',
    async () => {
      db = drizzle({ client: new pg.Pool({ connectionString: inject('databaseUrl') }), schema });
      const data = { ...fiscalData(), taxId: sandbox.taxId!, name: sandbox.name! };
      const [row] = await db.insert(issuers).values(data).returning({ issuerId: issuers.id });
      const issuer = { issuerId: row!.issuerId, ...data };
      const secretBox = new SecretBox(randomBytes(32).toString('base64'));
      if (!managesIssuers) {
        await saveIssuerApiKey(db, secretBox, {
          issuerId: issuer.issuerId,
          environment: 'test',
          apiKey: sandbox.issuerApiKey!,
        });
      }
      const connector = new VerifactiConnector({
        // Without an account key, the operations that need it are never called.
        accountApiKey: sandbox.accountApiKey ?? '',
        environment: 'test',
        db,
        secretBox,
      });
      return {
        connector,
        issuer,
        // Invoicing itself keeps the test to the one NIF the account is sure to have in the census.
        recipient: { taxId: sandbox.taxId!, name: sandbox.name! },
        async awaitVerdict(record) {
          const deadline = Date.now() + 10 * 60_000;
          while (Date.now() < deadline) {
            if (ok(await connector.recordStatus(issuer, record)).state !== 'pending') return;
            await new Promise((resolve) => setTimeout(resolve, 10_000));
          }
          throw new Error(`The AEAT gave no verdict on ${record.connectorRecordId} in 10 minutes`);
        },
      };
    },
    { managesIssuers },
  );
});

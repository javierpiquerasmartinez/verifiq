import { Logger } from '@nestjs/common';
import type { WorkerEnv } from '../config.js';
import type { Database } from '../database/database.module.js';
import type { VerifactuConnector } from './connector.js';
import { FakeVerifactuConnector } from './fake-connector.js';
import { SecretBox } from './secret-box.js';
import { VerifactiConnector } from './verifacti-connector.js';

/** Builds the connector once the database exists. */
export type VerifactuConnectorFactory = (db: Database) => VerifactuConnector;

export function verifactuConnectorFromEnv(env: WorkerEnv): VerifactuConnectorFactory {
  if (env.VERIFACTI_API_KEY && env.VERIFACTI_ENVIRONMENT && env.CONNECTOR_MASTER_KEY) {
    const secretBox = new SecretBox(env.CONNECTOR_MASTER_KEY);
    if (!env.VERIFACTI_WEBHOOK_SECRET) {
      new Logger('VeriFactu').warn('VERIFACTI_WEBHOOK_SECRET is not set: AEAT verdicts arrive only by polling');
    }
    return (db) =>
      new VerifactiConnector({
        accountApiKey: env.VERIFACTI_API_KEY!,
        environment: env.VERIFACTI_ENVIRONMENT!,
        db,
        secretBox,
        webhookSecret: env.VERIFACTI_WEBHOOK_SECRET,
        webhookId: env.VERIFACTI_WEBHOOK_ID,
      });
  }
  new Logger('VeriFactu').warn('VERIFACTI_API_KEY is not set: an in-memory fake connector stands in for VeriFactu');
  return () => new FakeVerifactuConnector();
}

/** Issuers sign the Representation only in production: test NIFs need none (and a signing has a cost). */
export function representationRequiredFromEnv(env: WorkerEnv): boolean {
  return env.VERIFACTI_ENVIRONMENT === 'prod';
}

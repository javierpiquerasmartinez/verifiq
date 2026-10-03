import { Logger } from '@nestjs/common';
import type { Env } from '../config.js';
import type { Database } from '../database/database.module.js';
import type { VerifactuConnector } from './connector.js';
import { FakeVerifactuConnector } from './fake-connector.js';
import { SecretBox } from './secret-box.js';
import { VerifactiConnector } from './verifacti-connector.js';

/** Builds the connector once the database exists. */
export type VerifactuConnectorFactory = (db: Database) => VerifactuConnector;

export function verifactuConnectorFromEnv(env: Env): VerifactuConnectorFactory {
  if (env.VERIFACTI_API_KEY && env.CONNECTOR_MASTER_KEY) {
    const secretBox = new SecretBox(env.CONNECTOR_MASTER_KEY);
    return (db) =>
      new VerifactiConnector({
        accountApiKey: env.VERIFACTI_API_KEY!,
        environment: env.VERIFACTI_ENVIRONMENT,
        db,
        secretBox,
      });
  }
  new Logger('VeriFactu').warn('VERIFACTI_API_KEY is not set: an in-memory fake connector stands in for VeriFactu');
  return () => new FakeVerifactuConnector();
}

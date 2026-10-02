import { randomBytes } from 'node:crypto';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { migrateDatabase } from '../src/database/migrate.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Creates a throwaway database on the Postgres pointed to by TEST_DATABASE_URL,
 * applies every migration and hands its URL to the tests. Dropped afterwards.
 */
export default async function setup(project: TestProject) {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    throw new Error(
      'TEST_DATABASE_URL is required: a Postgres connection allowed to CREATE DATABASE.',
    );
  }

  const databaseName = `verifiq_test_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${databaseName}"`);

  const teardown = async () => {
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
  };

  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  try {
    await migrateDatabase(databaseUrl.toString());
  } catch (error) {
    await teardown();
    throw error;
  }
  project.provide('databaseUrl', databaseUrl.toString());

  return teardown;
}

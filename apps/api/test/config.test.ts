import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadEnv, loadWorkerEnv } from '../src/config.js';

// What Render gives the worker: the API's variables minus those only the API uses.
const workerEnv = {
  DATABASE_URL: 'postgres://user:password@localhost:5432/verifiq',
  VERIFACTI_API_KEY: 'vfn_abc123',
  VERIFACTI_ENVIRONMENT: 'test',
  CONNECTOR_MASTER_KEY: randomBytes(32).toString('base64'),
};

describe('environment', () => {
  it('starts the worker without the API-only secrets', () => {
    expect(loadWorkerEnv(workerEnv).VERIFACTI_API_KEY).toBe('vfn_abc123');
  });

  it('still requires the session secret for the API', () => {
    expect(() => loadEnv(workerEnv)).toThrow(/BETTER_AUTH_SECRET/);
    expect(loadEnv({ ...workerEnv, BETTER_AUTH_SECRET: 'x'.repeat(32) }).DATABASE_URL).toBe(workerEnv.DATABASE_URL);
  });

  it('applies the same cross-checks to the worker', () => {
    expect(() => loadWorkerEnv({ ...workerEnv, CONNECTOR_MASTER_KEY: undefined })).toThrow(/VERIFACTI_API_KEY requires CONNECTOR_MASTER_KEY/);
  });
});

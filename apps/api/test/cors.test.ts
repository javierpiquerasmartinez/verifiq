import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './test-app.js';

const STAGING = 'https://verifiq-phi.vercel.app';
const PREVIEWS = 'https://verifiq-*-javier-piqueras-martinezs-projects.vercel.app';

describe('CORS for the web app', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ webOrigins: [STAGING, PREVIEWS] });
  });

  afterAll(async () => {
    await app.close();
  });

  async function allowedOrigin(origin: string) {
    const response = await request(app.getHttpServer()).get('/health').set('Origin', origin);
    return response.headers['access-control-allow-origin'];
  }

  it('allows an exact origin', async () => {
    expect(await allowedOrigin(STAGING)).toBe(STAGING);
  });

  it.each([
    'https://verifiq-3img41gl1-javier-piqueras-martinezs-projects.vercel.app',
    'https://verifiq-git-feat-cors-previews-javier-piqueras-martinezs-projects.vercel.app',
  ])('allows a preview deployment matching the wildcard: %s', async (origin) => {
    expect(await allowedOrigin(origin)).toBe(origin);
  });

  it.each([
    'https://verifiq-evil.vercel.app',
    'https://verifiq-x-otro-equipo.vercel.app',
    'https://verifiq-x-javier-piqueras-martinezs-projects.vercel.app.evil.com',
    'https://evil.com/?https://verifiq-x-javier-piqueras-martinezs-projects.vercel.app',
    'http://verifiq-x-javier-piqueras-martinezs-projects.vercel.app',
    'https://verifiq-a.b-javier-piqueras-martinezs-projects.vercel.app',
  ])('rejects an origin outside the allowed list: %s', async (origin) => {
    expect(await allowedOrigin(origin)).toBeUndefined();
  });
});

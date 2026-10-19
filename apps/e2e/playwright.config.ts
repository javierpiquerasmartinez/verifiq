import { defineConfig, devices } from '@playwright/test';

// End-to-end tests against staging (issue 29): a real browser, the deployed web and API, and the AEAT
// test environment through Verifacti. Run on demand (GitHub Actions → E2E), never on every push.
export default defineConfig({
  testDir: 'tests',
  // Each test waits for the AEAT's verdicts: minutes, not seconds.
  timeout: 20 * 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://app.staging.verifiq.es',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

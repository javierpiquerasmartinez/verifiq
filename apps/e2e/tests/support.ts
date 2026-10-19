import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { createHmac, randomInt } from 'node:crypto';

/** A variable the workflow sets from a repository secret. */
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (a repository secret of the E2E workflow)`);
  return value;
}

/**
 * Staging sits behind Vercel's deployment protection: every request to the web carries the automation
 * bypass. Only to the web: on the API's requests the header would fail the CORS preflight.
 */
async function bypassVercelProtection(context: BrowserContext, baseURL: string): Promise<void> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) return;
  await context.route(`${new URL(baseURL).origin}/**`, (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-vercel-protection-bypass': secret } }),
  );
}

export const test = base.extend<{ newPage: () => Promise<Page> }>({
  context: async ({ context, baseURL }, use) => {
    await bypassVercelProtection(context, baseURL!);
    await use(context);
  },
  /** A page in a browser of its own (no cookies shared), for a second person in the same test. */
  newPage: async ({ browser, baseURL }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext({ baseURL, locale: 'es-ES', timezoneId: 'Europe/Madrid' });
      contexts.push(context);
      await bypassVercelProtection(context, baseURL!);
      return context.newPage();
    });
    for (const context of contexts) await context.close();
  },
});

export { expect };

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 6238 code (SHA-1, 6 digits, 30 s), as an authenticator app would show it. */
export function totpCode(secret: string, at = Date.now()): string {
  let bits = '';
  for (const char of secret.replace(/[\s=]/g, '').toUpperCase()) bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  return ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}

/** A code with time left: one about to expire could be stale by the time it is checked. */
async function freshTotpCode(secret: string): Promise<string> {
  const left = 30_000 - (Date.now() % 30_000);
  if (left < 5_000) await new Promise((resolve) => setTimeout(resolve, left + 500));
  return totpCode(secret);
}

/** Signs in with the password and the authenticator's code, as a person would. */
export async function signIn(page: Page, { email, password, totpSecret }: { email: string; password: string; totpSecret: string }) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Código de verificación').fill(await freshTotpCode(totpSecret));
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Sets up 2FA on the screen a new account lands on, and returns its secret. */
export async function setUpTwoFactor(page: Page, password: string): Promise<string> {
  await page.getByLabel('Tu contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continuar' }).click();
  const secret = (await page.locator('p.secret').textContent())!.trim();
  await page.getByLabel('Código de 6 cifras que muestra la aplicación').fill(await freshTotpCode(secret));
  await page.getByRole('button', { name: 'Activar la verificación' }).click();
  await page.getByRole('checkbox', { name: 'He guardado mis códigos de recuperación en un lugar seguro.' }).check();
  await page.getByRole('button', { name: 'Ir a Verifiq' }).click();
  return secret;
}

/** A valid Spanish tax ID (DNI), different on every run. */
export function randomTaxId(): string {
  const digits = String(randomInt(10_000_000, 100_000_000));
  return digits + 'TRWAGMYFPDXBNJZSQVHLCKE'[Number(digits) % 23];
}

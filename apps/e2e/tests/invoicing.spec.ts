import type { Page } from '@playwright/test';
import { env, expect, signIn, test } from './support';

// The e2e user is a second member of the staging issuer (the operator's own tax ID, registered at
// the AEAT test environment): its invoices reach the AEAT for real, so the test waits for its
// verdict before rectifying or voiding.
const VERDICT_TIMEOUT = 10 * 60_000;

test.beforeEach(async ({ page }) => {
  await signIn(page, {
    email: env('E2E_USER_EMAIL'),
    password: env('E2E_USER_PASSWORD'),
    totpSecret: env('E2E_USER_TOTP_SECRET'),
  });
  await expect(page.getByRole('heading', { name: 'Facturas', exact: true })).toBeVisible();
});

/** Last month, as the period invoiced: always in the past, never too far. */
function lastMonth(): { start: string; end: string } {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** Issues an invoice to the issuer's first recipient (staging's has some in the census) and opens it; returns its number. */
async function issueInvoice(page: Page, concept: string): Promise<string> {
  const period = lastMonth();
  await page.getByRole('link', { name: 'Nueva factura' }).first().click();
  await page.getByPlaceholder('Buscar cliente por nombre, NIF o municipio').click();
  await page.getByRole('list', { name: 'Clientes' }).getByRole('button').first().click();
  await page.getByLabel('Periodo facturado: del').fill(period.start);
  await page.getByLabel('al', { exact: true }).fill(period.end);
  await page.getByLabel('Concepto de la línea 1').fill(concept);
  await page.getByLabel('Precio unitario de la línea 1').fill('100');
  await page.getByRole('button', { name: 'Emitir factura' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Emitir factura/ }).click();
  return openIssued(page);
}

/** After the issue dialog: the QR is shown, then the invoice opens. Returns its number. */
async function openIssued(page: Page): Promise<string> {
  const dialog = page.getByRole('dialog');
  const heading = dialog.getByRole('heading', { name: /emitida$/ });
  await expect(heading).toBeVisible({ timeout: 60_000 });
  const number = (await heading.textContent() ?? '').replace(/^Factura\s+|\s+emitida$/g, '').trim();
  const qr = dialog.locator('svg').filter({ has: page.locator('title', { hasText: /^Código QR tributario de la factura/ }) });
  await expect(qr).toBeVisible();
  await dialog.getByRole('link', { name: 'Ver factura' }).click();
  await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
  return number;
}

/** The invoice page refreshes itself until the AEAT answers; a refusal fails at once. */
async function expectAccepted(page: Page) {
  const verdict = page.getByText(/^(Aceptada|Aceptada con errores|Rechazada|Bloqueada)$/).first();
  await expect(verdict).toBeVisible({ timeout: VERDICT_TIMEOUT });
  await expect(verdict).toHaveText(/^Aceptada/);
}

test('issues an invoice with its QR and, once the AEAT accepts it, rectifies it', async ({ page }) => {
  await issueInvoice(page, 'E2E · factura que se rectifica');
  await expectAccepted(page);

  await page.getByRole('button', { name: 'Corregir' }).click();
  await page.getByRole('menuitem', { name: /^Rectificar/ }).click();
  await page.getByLabel('Descuento, devolución o cambio de precio posterior').check();
  await page.getByLabel('Explícalo en pocas palabras').fill('E2E: descuento acordado');
  await page.getByRole('group', { name: 'Qué cambia' }).getByRole('button', { name: 'Toda la factura' }).click();
  await page.getByRole('button', { name: 'Preparar la rectificativa' }).click();

  await page.getByRole('button', { name: 'Emitir rectificativa' }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Emitir rectificativa/ }).click();
  await openIssued(page);
  await expect(page.getByText('Rectificativa', { exact: true }).first()).toBeVisible();
});

test('issues an invoice and, once the AEAT answers, voids it', async ({ page }) => {
  const number = await issueInvoice(page, 'E2E · factura que se anula');
  await expectAccepted(page);

  await page.getByRole('button', { name: 'Corregir' }).click();
  await page.getByRole('menuitem', { name: /^Anular/ }).click();
  await page.getByLabel(/para confirmar$/).fill(number);
  await page.getByRole('button', { name: 'Anular la factura' }).click();
  await expect(page.getByText('Anulada', { exact: true }).first()).toBeVisible();
});

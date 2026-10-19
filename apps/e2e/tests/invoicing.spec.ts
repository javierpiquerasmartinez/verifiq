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

/** Issues an invoice to the issuer's first recipient and opens it; returns its number. */
async function issueInvoice(page: Page, concept: string): Promise<string> {
  await page.getByRole('link', { name: 'Nueva factura' }).first().click();
  await page.getByPlaceholder('Buscar cliente por nombre, NIF o municipio').click();
  await page.getByRole('list', { name: 'Clientes' }).getByRole('button').first().click();
  await page.getByLabel('Periodo facturado: del').fill('2026-09-01');
  await page.getByLabel('al', { exact: true }).fill('2026-09-30');
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
  const number = (await heading.textContent())!.replace(/^Factura\s+|\s+emitida$/g, '').trim();
  const qr = dialog.locator('svg').filter({ has: page.locator('title', { hasText: /^Código QR tributario de la factura/ }) });
  await expect(qr).toBeVisible();
  await dialog.getByRole('link', { name: 'Ver factura' }).click();
  await expect(page.getByRole('heading', { level: 1, name: number })).toBeVisible();
  return number;
}

/** The invoice page refreshes itself until the AEAT answers. */
async function expectAccepted(page: Page) {
  await expect(page.getByText(/^Aceptada( con errores)?$/).first()).toBeVisible({ timeout: VERDICT_TIMEOUT });
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
  await expect(page.getByText('Rectificativa').first()).toBeVisible();
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

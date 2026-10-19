import { env, expect, randomTaxId, setUpTwoFactor, signIn, test } from './support';

const PASSWORD = 'e2e-correct-horse-battery';

// Invitation → account → 2FA → onboarding, up to the terms. Accepting them registers the issuer at
// Verifacti (POST /onboarding/terms), which would add a test tax ID to the operator's Verifacti account
// on every run (issue 29): the test checks they can be accepted and stops there.
test('the operator invites a freelancer, who sets up 2FA and goes through onboarding', async ({ page, newPage }) => {
  const email = `javi+e2e-${Date.now()}@verifiq.es`;

  await test.step('the operator sends the invitation', async () => {
    await signIn(page, {
      email: env('E2E_OPERATOR_EMAIL'),
      password: env('E2E_OPERATOR_PASSWORD'),
      totpSecret: env('E2E_OPERATOR_TOTP_SECRET'),
    });
    await expect(page.getByRole('heading', { name: 'Panel del operador' })).toBeVisible();
    await page.getByLabel('Email del autónomo').fill(email);
    await page.getByRole('button', { name: 'Enviar invitación' }).click();
  });
  const link = (await page.locator('code').filter({ hasText: '/invitation/' }).textContent())!.trim();

  const freelancer = await newPage();
  await test.step('the freelancer creates the account from the link', async () => {
    await freelancer.goto(new URL(link).pathname);
    await freelancer.getByLabel('Nombre y apellidos').fill('Lucía Ferrer Albiol');
    await freelancer.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await freelancer.getByLabel('Repite la contraseña').fill(PASSWORD);
    await freelancer.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(freelancer).toHaveURL(/\/set-up-2fa$/);
  });

  await test.step('sets up 2FA', async () => {
    await setUpTwoFactor(freelancer, PASSWORD);
    await expect(freelancer.getByRole('heading', { name: 'Tus datos fiscales' })).toBeVisible();
  });

  await test.step('goes through onboarding up to the terms', async () => {
    await freelancer.getByLabel('Nombre completo o razón social').fill('Lucía Ferrer Albiol');
    await freelancer.getByLabel('NIF', { exact: true }).fill(randomTaxId());
    await freelancer.getByLabel('Domicilio fiscal').fill('Carrer de Colón 12, 3º 2ª');
    await freelancer.getByLabel('Código postal').fill('46004');
    await freelancer.getByLabel('Municipio').fill('València');
    await freelancer.getByLabel('Provincia').fill('Valencia');
    await freelancer.getByRole('button', { name: 'Guardar y continuar' }).click();

    await expect(freelancer.getByRole('heading', { name: 'Impuestos por defecto' })).toBeVisible();
    await freelancer.getByRole('button', { name: 'Guardar y continuar' }).click();

    await expect(freelancer.getByRole('heading', { name: 'Numeración de tus facturas' })).toBeVisible();
    await freelancer.getByRole('checkbox', { name: /no podré cambiarlas después/ }).check();
    await freelancer.getByRole('button', { name: 'Confirmar numeración' }).click();

    await expect(freelancer.getByRole('heading', { name: 'Condiciones del servicio' })).toBeVisible();
    for (const terms of await freelancer.getByRole('checkbox').all()) await terms.check();
    await expect(freelancer.getByRole('button', { name: 'Aceptar y continuar' })).toBeEnabled();
  });
});

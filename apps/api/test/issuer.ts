import type { INestApplication } from '@nestjs/common';
import { LEGAL_DOCUMENTS } from '@verifiq/domain';
import { randomInt } from 'node:crypto';
import { activeUser, type Agent } from './access.js';

/** A valid tax ID no other test uses: the tax ID is unique across issuers. */
export function uniqueTaxId(): string {
  const digits = String(randomInt(100_000_000)).padStart(8, '0');
  return digits + 'TRWAGMYFPDXBNJZSQVHLCKE'[Number(digits) % 23];
}

export const fiscalData = (taxId = uniqueTaxId()) => ({
  name: 'Lucía Ferrer Albiol',
  taxId,
  address: 'Carrer de Colón 12, 3º 2ª',
  postalCode: '46004',
  municipality: 'València',
  province: 'Valencia',
});

export const DENTIST_DEFAULTS = { withholding: 15, vat: { kind: 'exempt', ground: 'dentistry' } };

export const CURRENT_TERMS = {
  termsOfUseVersion: LEGAL_DOCUMENTS.termsOfUse.version,
  dataProcessingAgreementVersion: LEGAL_DOCUMENTS.dataProcessingAgreement.version,
};

/** Walks the four onboarding steps, as the wizard does. */
export async function completeOnboarding(agent: Agent, taxId = uniqueTaxId()) {
  await agent.put('/onboarding/fiscal-data').send(fiscalData(taxId)).expect(200);
  await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(200);
  await agent.post('/onboarding/series').send({ prefix: 'F', correctivePrefix: 'R' }).expect(200);
  await agent.post('/onboarding/terms').send(CURRENT_TERMS).expect(200);
  return { taxId };
}

/** A user whose issuer has completed onboarding. */
export async function onboardedUser(app: INestApplication) {
  const user = await activeUser(app);
  const { taxId } = await completeOnboarding(user.agent);
  return { ...user, taxId };
}

import type { INestApplication } from '@nestjs/common';
import { LEGAL_DOCUMENTS } from '@verifiq/domain';
import { randomInt } from 'node:crypto';
import { activeUsuario, type Agent } from './access.js';

/** A valid NIF no other test uses: the NIF is unique across Emisores. */
export function uniqueNif(): string {
  const digits = String(randomInt(100_000_000)).padStart(8, '0');
  return digits + 'TRWAGMYFPDXBNJZSQVHLCKE'[Number(digits) % 23];
}

export const fiscalData = (nif = uniqueNif()) => ({
  name: 'Lucía Ferrer Albiol',
  nif,
  address: 'Carrer de Colón 12, 3º 2ª',
  postalCode: '46004',
  municipality: 'València',
  province: 'Valencia',
});

export const DENTIST_DEFAULTS = { retencionIrpf: 15, iva: { kind: 'exempt', supuesto: 'odontologia' } };

export const CURRENT_TERMS = {
  terminosVersion: LEGAL_DOCUMENTS.terminos.version,
  contratoEncargoVersion: LEGAL_DOCUMENTS.contratoEncargo.version,
};

/** Walks the four steps of the alta, as the wizard does. */
export async function completeOnboarding(agent: Agent, nif = uniqueNif()) {
  await agent.put('/onboarding/fiscal-data').send(fiscalData(nif)).expect(200);
  await agent.put('/onboarding/defaults').send(DENTIST_DEFAULTS).expect(200);
  await agent.post('/onboarding/serie').send({ prefix: 'F', rectificativaPrefix: 'R' }).expect(200);
  await agent.post('/onboarding/terms').send(CURRENT_TERMS).expect(200);
  return { nif };
}

/** A Usuario whose Emisor has completed the alta. */
export async function onboardedUsuario(app: INestApplication) {
  const usuario = await activeUsuario(app);
  const { nif } = await completeOnboarding(usuario.agent);
  return { ...usuario, nif };
}

import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
import { connectorCredentials } from '../database/schema.js';
import type { SecretBox } from './secret-box.js';

interface IssuerApiKey {
  issuerId: string;
  /** The connector environment the key belongs to. */
  environment: string;
}

/** Keeps the issuer's connector API key, sealed with the issuer id as context. Replaces any previous one. */
export async function saveIssuerApiKey(
  db: Database,
  secretBox: SecretBox,
  { issuerId, environment, apiKey }: IssuerApiKey & { apiKey: string },
): Promise<void> {
  const sealedApiKey = secretBox.seal(apiKey, issuerId);
  await db
    .insert(connectorCredentials)
    .values({ issuerId, environment, sealedApiKey })
    .onConflictDoUpdate({
      target: connectorCredentials.issuerId,
      set: { environment, sealedApiKey, updatedAt: new Date() },
    });
}

/** The issuer's API key for the environment, or null if it has none. */
export async function loadIssuerApiKey(
  db: Database,
  secretBox: SecretBox,
  { issuerId, environment }: IssuerApiKey,
): Promise<string | null> {
  const [credentials] = await db
    .select({ sealedApiKey: connectorCredentials.sealedApiKey })
    .from(connectorCredentials)
    .where(and(eq(connectorCredentials.issuerId, issuerId), eq(connectorCredentials.environment, environment)));
  return credentials ? secretBox.open(credentials.sealedApiKey, issuerId) : null;
}

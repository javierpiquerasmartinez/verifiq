import {
  LEGAL_DOCUMENTS,
  type IssuerDefaults,
  type IssuerSummary,
  type FiscalData,
  type LegalDocument,
  type Onboarding,
  type WithholdingRate,
  type VatRate,
  type Series,
  type ExemptionGroundId,
} from '@verifiq/domain';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
import { issuers, issuerMemberships, legalAcceptances, users } from '../database/schema.js';

// Every function takes the issuer id resolved by the isolation layer (issuer-context.ts) and filters by it.

type IssuerRow = typeof issuers.$inferSelect;

export class TaxIdTakenError extends Error {}

/** A step was sent before the steps it depends on. */
export class StepPendingError extends Error {}

export class SeriesAlreadyConfirmedError extends Error {}

function fiscalDataOf(row: IssuerRow): FiscalData {
  return {
    name: row.name,
    taxId: row.taxId,
    address: row.address,
    postalCode: row.postalCode,
    municipality: row.municipality,
    province: row.province,
    email: row.email,
    phone: row.phone,
    iban: row.iban,
  };
}

function defaultsOf(row: IssuerRow): IssuerDefaults | null {
  if (row.defaultWithholding === null) return null;
  return {
    withholding: row.defaultWithholding as WithholdingRate,
    vat:
      row.defaultExemptionGround !== null
        ? { kind: 'exempt', ground: row.defaultExemptionGround as ExemptionGroundId }
        : { kind: 'taxed', rate: row.defaultVatRate as VatRate },
  };
}

function seriesOf(row: IssuerRow): Series | null {
  if (row.seriesConfirmedAt === null) return null;
  return { prefix: row.seriesPrefix!, correctivePrefix: row.correctivePrefix! };
}

function stepOf(row: IssuerRow | undefined): Onboarding['step'] {
  if (!row) return 'fiscal-data';
  if (row.defaultWithholding === null) return 'defaults';
  if (row.seriesConfirmedAt === null) return 'series';
  if (row.onboardingCompletedAt === null) return 'terms';
  return 'completed';
}

async function findIssuer(db: Database, issuerId: string | null): Promise<IssuerRow | undefined> {
  if (!issuerId) return undefined;
  const [row] = await db.select().from(issuers).where(eq(issuers.id, issuerId));
  return row;
}

async function findTerms(db: Database, issuerId: string): Promise<Onboarding['terms']> {
  const accepted = await db
    .select({ document: legalAcceptances.document, version: legalAcceptances.version, acceptedAt: legalAcceptances.acceptedAt })
    .from(legalAcceptances)
    .where(eq(legalAcceptances.issuerId, issuerId))
    .orderBy(desc(legalAcceptances.acceptedAt));
  const latest = (document: LegalDocument) => accepted.find((row) => row.document === document);
  const termsOfUse = latest('termsOfUse');
  const dataProcessingAgreement = latest('dataProcessingAgreement');
  if (!termsOfUse || !dataProcessingAgreement) return null;
  return {
    termsOfUseVersion: termsOfUse.version,
    dataProcessingAgreementVersion: dataProcessingAgreement.version,
    acceptedAt: termsOfUse.acceptedAt.toISOString(),
  };
}

export async function findOnboarding(db: Database, issuerId: string | null): Promise<Onboarding> {
  const row = await findIssuer(db, issuerId);
  return {
    step: stepOf(row),
    fiscalData: row ? fiscalDataOf(row) : null,
    hasLogo: Boolean(row?.logoKey),
    defaults: row ? defaultsOf(row) : null,
    series: row ? seriesOf(row) : null,
    terms: row ? await findTerms(db, row.id) : null,
  };
}

export async function findSummary(db: Database, issuerId: string): Promise<IssuerSummary> {
  const [row] = await db
    .select({ name: issuers.name, taxId: issuers.taxId })
    .from(issuers)
    .where(eq(issuers.id, issuerId));
  if (!row) throw new Error(`Issuer ${issuerId} not found`);
  return row;
}

function isTaxIdConflict(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
  const pgError = cause as { code?: string; constraint?: string };
  return pgError.code === '23505' && pgError.constraint === 'issuers_tax_id_unique';
}

/**
 * Step 1. The first save creates the issuer and the user's membership; later saves update it.
 * Returns the issuer id.
 */
export async function saveFiscalData(
  db: Database,
  { userId, issuerId }: { userId: string; issuerId: string | null },
  data: FiscalData,
): Promise<string> {
  try {
    if (issuerId) {
      await db
        .update(issuers)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(issuers.id, issuerId));
      return issuerId;
    }
    return await db.transaction(async (tx) => {
      // Serialises the user's requests, so two simultaneous first saves create one issuer.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
      const [existing] = await tx
        .select({ issuerId: issuerMemberships.issuerId })
        .from(issuerMemberships)
        .where(eq(issuerMemberships.userId, userId));
      if (existing) {
        await tx
          .update(issuers)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(issuers.id, existing.issuerId));
        return existing.issuerId;
      }
      const [created] = await tx.insert(issuers).values(data).returning({ id: issuers.id });
      await tx.insert(issuerMemberships).values({ issuerId: created!.id, userId });
      return created!.id;
    });
  } catch (error) {
    if (isTaxIdConflict(error)) throw new TaxIdTakenError();
    throw error;
  }
}

/** Step 2. */
export async function saveDefaults(
  db: Database,
  issuerId: string | null,
  { withholding, vat }: IssuerDefaults,
): Promise<void> {
  if (!issuerId) throw new StepPendingError();
  await db
    .update(issuers)
    .set({
      defaultWithholding: withholding,
      defaultVatRate: vat.kind === 'taxed' ? vat.rate : null,
      defaultExemptionGround: vat.kind === 'exempt' ? vat.ground : null,
      updatedAt: new Date(),
    })
    .where(eq(issuers.id, issuerId));
}

/** Step 3: chosen once (ADR 0004); numbering starts at 1 in each series. */
export async function confirmSeries(
  db: Database,
  issuerId: string | null,
  { prefix, correctivePrefix }: Series,
): Promise<void> {
  const row = await findIssuer(db, issuerId);
  if (!row || row.defaultWithholding === null) throw new StepPendingError();
  const confirmed = await db
    .update(issuers)
    .set({ seriesPrefix: prefix, correctivePrefix, seriesConfirmedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(issuers.id, row.id), isNull(issuers.seriesConfirmedAt)))
    .returning({ id: issuers.id });
  if (confirmed.length === 0) throw new SeriesAlreadyConfirmedError();
}

/** Step 4: records the acceptance of the current legal documents and completes onboarding. */
export async function acceptTerms(
  db: Database,
  { userId, issuerId }: { userId: string; issuerId: string | null },
): Promise<void> {
  const row = await findIssuer(db, issuerId);
  if (!row || row.seriesConfirmedAt === null) throw new StepPendingError();
  if (row.onboardingCompletedAt !== null) return;
  await db.transaction(async (tx) => {
    const completed = await tx
      .update(issuers)
      .set({ onboardingCompletedAt: sql`now()`, updatedAt: new Date() })
      .where(
        and(eq(issuers.id, row.id), isNotNull(issuers.seriesConfirmedAt), isNull(issuers.onboardingCompletedAt)),
      )
      .returning({ id: issuers.id });
    if (completed.length === 0) return;
    const documents = Object.entries(LEGAL_DOCUMENTS) as [LegalDocument, { version: string }][];
    await tx
      .insert(legalAcceptances)
      .values(documents.map(([document, { version }]) => ({ issuerId: row.id, userId, document, version })));
  });
}

/** Object storage key of the issuer's current logo, if any. */
export async function findLogoKey(db: Database, issuerId: string): Promise<string | null> {
  const [row] = await db
    .select({ logoKey: issuers.logoKey })
    .from(issuers)
    .where(eq(issuers.id, issuerId));
  return row?.logoKey ?? null;
}

/** Points the issuer to a new logo (or none); returns the key of the one it replaces. */
export async function replaceLogoKey(
  db: Database,
  issuerId: string,
  logoKey: string | null,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ logoKey: issuers.logoKey })
      .from(issuers)
      .where(eq(issuers.id, issuerId))
      .for('update');
    await tx
      .update(issuers)
      .set({ logoKey, updatedAt: new Date() })
      .where(eq(issuers.id, issuerId));
    return row?.logoKey ?? null;
  });
}

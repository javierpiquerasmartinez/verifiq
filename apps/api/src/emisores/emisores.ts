import {
  LEGAL_DOCUMENTS,
  type EmisorDefaults,
  type EmisorSummary,
  type FiscalData,
  type LegalDocument,
  type Onboarding,
  type RetencionIrpfRate,
  type IvaRate,
  type Series,
  type SupuestoExencionId,
} from '@verifiq/domain';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Database } from '../database/database.module.js';
import { emisores, emisorMemberships, legalAcceptances, users } from '../database/schema.js';

// Every function takes the Emisor id resolved by the isolation layer (tenancy.ts) and filters by it.

type EmisorRow = typeof emisores.$inferSelect;

export class NifTakenError extends Error {}

/** A step was sent before the steps it depends on. */
export class StepPendingError extends Error {}

export class SerieAlreadyConfirmedError extends Error {}

function fiscalDataOf(row: EmisorRow): FiscalData {
  return {
    name: row.name,
    nif: row.nif,
    address: row.address,
    postalCode: row.postalCode,
    municipality: row.municipality,
    province: row.province,
    email: row.email,
    phone: row.phone,
    iban: row.iban,
  };
}

function defaultsOf(row: EmisorRow): EmisorDefaults | null {
  if (row.defaultRetencionIrpf === null) return null;
  return {
    retencionIrpf: row.defaultRetencionIrpf as RetencionIrpfRate,
    iva:
      row.defaultSupuestoExencion !== null
        ? { kind: 'exempt', supuesto: row.defaultSupuestoExencion as SupuestoExencionId }
        : { kind: 'taxed', rate: row.defaultIvaRate as IvaRate },
  };
}

function seriesOf(row: EmisorRow): Series | null {
  if (row.serieConfirmedAt === null) return null;
  return { prefix: row.seriePrefix!, rectificativaPrefix: row.rectificativaPrefix! };
}

function stepOf(row: EmisorRow | undefined): Onboarding['step'] {
  if (!row) return 'fiscal-data';
  if (row.defaultRetencionIrpf === null) return 'defaults';
  if (row.serieConfirmedAt === null) return 'serie';
  if (row.onboardingCompletedAt === null) return 'terms';
  return 'completed';
}

async function findEmisor(db: Database, emisorId: string | null): Promise<EmisorRow | undefined> {
  if (!emisorId) return undefined;
  const [row] = await db.select().from(emisores).where(eq(emisores.id, emisorId));
  return row;
}

async function findTerms(db: Database, emisorId: string): Promise<Onboarding['terms']> {
  const accepted = await db
    .select({ document: legalAcceptances.document, version: legalAcceptances.version, acceptedAt: legalAcceptances.acceptedAt })
    .from(legalAcceptances)
    .where(eq(legalAcceptances.emisorId, emisorId))
    .orderBy(desc(legalAcceptances.acceptedAt));
  const latest = (document: LegalDocument) => accepted.find((row) => row.document === document);
  const terminos = latest('terminos');
  const contratoEncargo = latest('contratoEncargo');
  if (!terminos || !contratoEncargo) return null;
  return {
    terminosVersion: terminos.version,
    contratoEncargoVersion: contratoEncargo.version,
    acceptedAt: terminos.acceptedAt.toISOString(),
  };
}

export async function findOnboarding(db: Database, emisorId: string | null): Promise<Onboarding> {
  const row = await findEmisor(db, emisorId);
  return {
    step: stepOf(row),
    fiscalData: row ? fiscalDataOf(row) : null,
    hasLogo: Boolean(row?.logoKey),
    defaults: row ? defaultsOf(row) : null,
    series: row ? seriesOf(row) : null,
    terms: row ? await findTerms(db, row.id) : null,
  };
}

export async function findSummary(db: Database, emisorId: string): Promise<EmisorSummary> {
  const [row] = await db
    .select({ name: emisores.name, nif: emisores.nif })
    .from(emisores)
    .where(eq(emisores.id, emisorId));
  if (!row) throw new Error(`Emisor ${emisorId} not found`);
  return row;
}

function isNifConflict(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string; constraint?: string } }).cause ?? error;
  const pgError = cause as { code?: string; constraint?: string };
  return pgError.code === '23505' && pgError.constraint === 'emisores_nif_unique';
}

/**
 * Step 1. The first save creates the Emisor and the Usuario's membership; later saves update it.
 * Returns the Emisor id.
 */
export async function saveFiscalData(
  db: Database,
  { userId, emisorId }: { userId: string; emisorId: string | null },
  data: FiscalData,
): Promise<string> {
  try {
    if (emisorId) {
      await db
        .update(emisores)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(emisores.id, emisorId));
      return emisorId;
    }
    return await db.transaction(async (tx) => {
      // Serialises the Usuario's requests, so two simultaneous first saves create one Emisor.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
      const [existing] = await tx
        .select({ emisorId: emisorMemberships.emisorId })
        .from(emisorMemberships)
        .where(eq(emisorMemberships.userId, userId));
      if (existing) {
        await tx
          .update(emisores)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(emisores.id, existing.emisorId));
        return existing.emisorId;
      }
      const [created] = await tx.insert(emisores).values(data).returning({ id: emisores.id });
      await tx.insert(emisorMemberships).values({ emisorId: created!.id, userId });
      return created!.id;
    });
  } catch (error) {
    if (isNifConflict(error)) throw new NifTakenError();
    throw error;
  }
}

/** Step 2. */
export async function saveDefaults(
  db: Database,
  emisorId: string | null,
  { retencionIrpf, iva }: EmisorDefaults,
): Promise<void> {
  if (!emisorId) throw new StepPendingError();
  await db
    .update(emisores)
    .set({
      defaultRetencionIrpf: retencionIrpf,
      defaultIvaRate: iva.kind === 'taxed' ? iva.rate : null,
      defaultSupuestoExencion: iva.kind === 'exempt' ? iva.supuesto : null,
      updatedAt: new Date(),
    })
    .where(eq(emisores.id, emisorId));
}

/** Step 3: chosen once (ADR 0004); numbering starts at 1 in each Serie. */
export async function confirmSeries(
  db: Database,
  emisorId: string | null,
  { prefix, rectificativaPrefix }: Series,
): Promise<void> {
  const row = await findEmisor(db, emisorId);
  if (!row || row.defaultRetencionIrpf === null) throw new StepPendingError();
  const confirmed = await db
    .update(emisores)
    .set({ seriePrefix: prefix, rectificativaPrefix, serieConfirmedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(emisores.id, row.id), isNull(emisores.serieConfirmedAt)))
    .returning({ id: emisores.id });
  if (confirmed.length === 0) throw new SerieAlreadyConfirmedError();
}

/** Step 4: records the acceptance of the current legal documents and completes the alta. */
export async function acceptTerms(
  db: Database,
  { userId, emisorId }: { userId: string; emisorId: string | null },
): Promise<void> {
  const row = await findEmisor(db, emisorId);
  if (!row || row.serieConfirmedAt === null) throw new StepPendingError();
  if (row.onboardingCompletedAt !== null) return;
  await db.transaction(async (tx) => {
    const completed = await tx
      .update(emisores)
      .set({ onboardingCompletedAt: sql`now()`, updatedAt: new Date() })
      .where(
        and(eq(emisores.id, row.id), isNotNull(emisores.serieConfirmedAt), isNull(emisores.onboardingCompletedAt)),
      )
      .returning({ id: emisores.id });
    if (completed.length === 0) return;
    const documents = Object.entries(LEGAL_DOCUMENTS) as [LegalDocument, { version: string }][];
    await tx
      .insert(legalAcceptances)
      .values(documents.map(([document, { version }]) => ({ emisorId: row.id, userId, document, version })));
  });
}

/** Object storage key of the Emisor's current logo, if any. */
export async function findLogoKey(db: Database, emisorId: string): Promise<string | null> {
  const [row] = await db
    .select({ logoKey: emisores.logoKey })
    .from(emisores)
    .where(eq(emisores.id, emisorId));
  return row?.logoKey ?? null;
}

/** Points the Emisor to a new logo (or none); returns the key of the one it replaces. */
export async function replaceLogoKey(
  db: Database,
  emisorId: string,
  logoKey: string | null,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ logoKey: emisores.logoKey })
      .from(emisores)
      .where(eq(emisores.id, emisorId))
      .for('update');
    await tx
      .update(emisores)
      .set({ logoKey, updatedAt: new Date() })
      .where(eq(emisores.id, emisorId));
    return row?.logoKey ?? null;
  });
}

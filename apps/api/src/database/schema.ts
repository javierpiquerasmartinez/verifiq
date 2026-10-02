// Drizzle schema; migrations live in ../../drizzle.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// --- Better Auth tables (see auth/auth.ts). Property names are the field names Better Auth expects.

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Capped at created_at + 7 days by a trigger (migration 0001): maximum session duration.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('accounts_user_id_idx').on(table.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('verifications_identifier_idx').on(table.identifier)],
);

export const twoFactors = pgTable(
  'two_factors',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(),
    backupCodes: text('backup_codes').notNull(),
    verified: boolean('verified').notNull().default(true),
    failedVerificationCount: integer('failed_verification_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
  },
  (table) => [
    index('two_factors_user_id_idx').on(table.userId),
    index('two_factors_secret_idx').on(table.secret),
  ],
);

export const rateLimits = pgTable('rate_limits', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

// --- Invitations: the only way to create a Usuario (no public sign-up).

export const invitations = pgTable('invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  // SHA-256 of the token sent in the link; the token itself is never stored.
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  userId: text('user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// --- Emisores: the unit of data isolation. Every business row belongs to one (emisor_id).

export const emisores = pgTable(
  'emisores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Step 1: fiscal data.
    name: text('name').notNull(),
    nif: text('nif').notNull().unique(),
    address: text('address').notNull(),
    postalCode: text('postal_code').notNull(),
    municipality: text('municipality').notNull(),
    province: text('province').notNull(),
    email: text('email'),
    phone: text('phone'),
    iban: text('iban'),
    // Object storage key of the logo; a new key per upload.
    logoKey: text('logo_key'),
    // Step 2: defaults. IVA is either a rate or a Supuesto de exención, never both.
    defaultRetencionIrpf: smallint('default_retencion_irpf'),
    defaultIvaRate: smallint('default_iva_rate'),
    defaultSupuestoExencion: text('default_supuesto_exencion'),
    // Step 3: Serie prefixes (ADR 0004). Immutable once confirmed (trigger in migration 0002).
    seriePrefix: text('serie_prefix'),
    rectificativaPrefix: text('rectificativa_prefix'),
    serieConfirmedAt: timestamp('serie_confirmed_at', { withTimezone: true }),
    // Step 4: terms accepted, the alta is complete.
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'emisores_default_iva_check',
      sql`${table.defaultIvaRate} IS NULL OR ${table.defaultSupuestoExencion} IS NULL`,
    ),
    check(
      'emisores_serie_check',
      sql`(${table.seriePrefix} IS NULL) = (${table.serieConfirmedAt} IS NULL) AND (${table.rectificativaPrefix} IS NULL) = (${table.serieConfirmedAt} IS NULL)`,
    ),
  ],
);

/** Usuario ↔ Emisor. The MVP creates exactly one per Usuario; the model allows more. */
export const emisorMemberships = pgTable(
  'emisor_memberships',
  {
    emisorId: uuid('emisor_id')
      .notNull()
      .references(() => emisores.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.emisorId, table.userId] }),
    index('emisor_memberships_user_id_idx').on(table.userId),
  ],
);

/** Append-only (trigger in migration 0002) record of every legal document version a Usuario accepted for an Emisor. */
export const legalAcceptances = pgTable(
  'legal_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emisorId: uuid('emisor_id')
      .notNull()
      .references(() => emisores.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    document: text('document').notNull(),
    version: text('version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('legal_acceptances_emisor_id_idx').on(table.emisorId)],
);

// Drizzle schema; migrations live in ../../drizzle.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
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

// --- Invitations: the only way to create a user (no public sign-up).

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

// --- Issuers: the unit of data isolation. Every business row belongs to one (issuer_id).

export const issuers = pgTable(
  'issuers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Step 1: fiscal data.
    name: text('name').notNull(),
    taxId: text('tax_id').notNull().unique(),
    address: text('address').notNull(),
    postalCode: text('postal_code').notNull(),
    municipality: text('municipality').notNull(),
    province: text('province').notNull(),
    email: text('email'),
    phone: text('phone'),
    iban: text('iban'),
    // Object storage key of the logo; a new key per upload.
    logoKey: text('logo_key'),
    // Step 2: defaults. VAT is either a rate or a exemption ground, never both.
    defaultWithholding: smallint('default_withholding'),
    defaultVatRate: smallint('default_vat_rate'),
    defaultExemptionGround: text('default_exemption_ground'),
    // Step 3: Series prefixes (ADR 0004). Immutable once confirmed (trigger in migration 0002).
    seriesPrefix: text('series_prefix'),
    correctivePrefix: text('corrective_prefix'),
    seriesConfirmedAt: timestamp('series_confirmed_at', { withTimezone: true }),
    // Step 4: terms accepted, onboarding is complete.
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    // Step 5: the issuer's key at the VeriFactu connector and its Representation. Set when the
    // connector registered the issuer; until then a rejection of it (its message) may be kept.
    connectorRegisteredAt: timestamp('connector_registered_at', { withTimezone: true }),
    connectorRejection: text('connector_rejection'),
    // Last Representation state the connector reported (the port's RepresentationState).
    representationState: text('representation_state'),
    representationSigningUrl: text('representation_signing_url'),
    // Where the signing link was sent, to send it again.
    representationSignerEmail: text('representation_signer_email'),
    representationCheckedAt: timestamp('representation_checked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'issuers_default_vat_check',
      sql`${table.defaultVatRate} IS NULL OR ${table.defaultExemptionGround} IS NULL`,
    ),
    check(
      'issuers_series_check',
      sql`(${table.seriesPrefix} IS NULL) = (${table.seriesConfirmedAt} IS NULL) AND (${table.correctivePrefix} IS NULL) = (${table.seriesConfirmedAt} IS NULL)`,
    ),
  ],
);

/** User ↔ issuer. The MVP creates exactly one per user; the model allows more. */
export const issuerMemberships = pgTable(
  'issuer_memberships',
  {
    issuerId: uuid('issuer_id')
      .notNull()
      .references(() => issuers.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.issuerId, table.userId] }),
    index('issuer_memberships_user_id_idx').on(table.userId),
  ],
);

/** Append-only (trigger in migration 0002) record of every legal document version a user accepted for an issuer. */
export const legalAcceptances = pgTable(
  'legal_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issuerId: uuid('issuer_id')
      .notNull()
      .references(() => issuers.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    document: text('document').notNull(),
    version: text('version').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('legal_acceptances_issuer_id_idx').on(table.issuerId)],
);

// --- VeriFactu connector (ADR 0001): the adapter's credentials and its evidence.

/** One API key per issuer, sealed with AES-GCM under a master key that lives outside the database. */
export const connectorCredentials = pgTable('connector_credentials', {
  issuerId: uuid('issuer_id')
    .primaryKey()
    .references(() => issuers.id),
  // `test` or `prod`: the connector environment the key belongs to.
  environment: text('environment').notNull(),
  sealedApiKey: text('sealed_api_key').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only (trigger in migration 0003) copy of every request to the connector and its answer,
 * kept beyond the connector's own retention. Credentials are redacted before storing.
 */
export const connectorExchanges = pgTable(
  'connector_exchanges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issuerId: uuid('issuer_id')
      .notNull()
      .references(() => issuers.id),
    // The InvoiceRecord the exchange belongs to. The foreign key arrives with the invoice_records table.
    invoiceRecordId: uuid('invoice_record_id'),
    operation: text('operation').notNull(),
    method: text('method').notNull(),
    url: text('url').notNull(),
    requestHeaders: jsonb('request_headers').notNull(),
    requestBody: text('request_body'),
    // Null when no answer arrived (timeout, network error): see `error`.
    responseStatus: integer('response_status'),
    responseHeaders: jsonb('response_headers'),
    responseBody: text('response_body'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    durationMs: integer('duration_ms').notNull(),
    // Microsecond precision: orders exchanges that started within the same millisecond.
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('connector_exchanges_issuer_id_idx').on(table.issuerId, table.recordedAt),
    index('connector_exchanges_invoice_record_id_idx').on(table.invoiceRecordId),
  ],
);

// --- Recipients: who the issuer invoices.

export const recipients = pgTable(
  'recipients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issuerId: uuid('issuer_id')
      .notNull()
      .references(() => issuers.id),
    name: text('name').notNull(),
    taxId: text('tax_id').notNull(),
    address: text('address').notNull(),
    postalCode: text('postal_code').notNull(),
    municipality: text('municipality').notNull(),
    province: text('province').notNull(),
    // The last AEAT census check of tax_id and name (the domain's CensusStatus).
    censusStatus: text('census_status').notNull(),
    censusCheckedAt: timestamp('census_checked_at', { withTimezone: true }),
    // Archived recipients are left out of the selectors but stay in their invoices.
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('recipients_issuer_id_idx').on(table.issuerId, table.name)],
);

// --- Drafts: invoices in preparation, without number (ADR 0002) or fiscal effect.

export const drafts = pgTable(
  'drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issuerId: uuid('issuer_id')
      .notNull()
      .references(() => issuers.id),
    // Deleting a recipient leaves its drafts without one: drafts never stop a recipient being deleted.
    recipientId: uuid('recipient_id').references(() => recipients.id, { onDelete: 'set null' }),
    billingPeriodStart: date('billing_period_start'),
    billingPeriodEnd: date('billing_period_end'),
    operationDescription: text('operation_description').notNull(),
    withholding: smallint('withholding').notNull(),
    // The domain's DraftLine[]: a draft is always saved and read whole.
    lines: jsonb('lines').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('drafts_issuer_id_idx').on(table.issuerId, table.updatedAt),
    index('drafts_recipient_id_idx').on(table.recipientId),
    check(
      'drafts_billing_period_check',
      sql`(${table.billingPeriodStart} IS NULL) = (${table.billingPeriodEnd} IS NULL) AND ${table.billingPeriodStart} <= ${table.billingPeriodEnd}`,
    ),
  ],
);

// --- Invoices. Issuance (issue 10) completes this table; for now it only ties invoices to their recipient.

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issuerId: uuid('issuer_id')
      .notNull()
      .references(() => issuers.id),
    // Restrict: a recipient with invoices can be archived, never deleted.
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => recipients.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('invoices_issuer_id_idx').on(table.issuerId),
    index('invoices_recipient_id_idx').on(table.recipientId),
  ],
);

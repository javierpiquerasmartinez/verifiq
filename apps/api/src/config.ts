import { z } from 'zod';

const commaSeparated = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

// What both processes read. The worker serves no HTTP, so it needs none of the API's own settings.
const sharedEnv = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
  // Comma-separated origins allowed to call the API from a browser (the web app).
  // `*` matches one fragment of a host name, e.g. https://verifiq-*-team.vercel.app.
  WEB_ORIGIN: z.string().default('http://localhost:5173').transform(commaSeparated),
  // Public URL of the web app, used to build the links sent by email.
  APP_URL: z.url().default('http://localhost:5173'),
  // Public URL of this API; https enables secure cookies.
  API_URL: z.url().default('http://localhost:3000'),
  // Without a key, emails are written to the log (local development only).
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().default('Verifiq <no-reply@verifiq.app>'),
  // Gets the alerts of invoice records the AEAT has not confirmed 24 h after their Issuance.
  // Without it they are only logged.
  OPERATOR_EMAIL: z.email().optional(),
  // Comma-separated CIDRs of the proxies in front of the API, to read the client IP for rate limiting.
  TRUSTED_PROXIES: z.string().default('').transform(commaSeparated),
  // Cloudflare R2 (EU jurisdiction) for logos and PDFs. Without them, files go to apps/api/.storage
  // (local development only).
  R2_ACCOUNT_ID: z.string().min(1).optional(),
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  R2_BUCKET: z.string().min(1).optional(),
  // Verifacti account key (vfn_…), the VeriFactu connector (ADR 0001). Without it an in-memory fake
  // stands in, which never reaches the AEAT (local development only).
  VERIFACTI_API_KEY: z.string().min(1).optional(),
  // `test` sends to the AEAT test environment (no Representation needed); `prod` registers real
  // invoices. Required with VERIFACTI_API_KEY: a missing value must never pass for `test` in production.
  VERIFACTI_ENVIRONMENT: z.enum(['test', 'prod']).optional(),
  // The `secret` the results webhook (POST /webhooks/verifactu) was registered with at Verifacti.
  // Without it every delivery is refused and the AEAT's verdicts arrive only by the 15-minute poll.
  VERIFACTI_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Seals the issuers' connector API keys in the database (AES-256-GCM). 32 random bytes in base64.
  CONNECTOR_MASTER_KEY: z
    .string()
    .refine((value) => Buffer.from(value, 'base64').length === 32, { message: 'Must be 32 bytes in base64' })
    .optional(),
});

/** Rules across variables, the same for both processes. */
function withCrossChecks<T extends typeof sharedEnv>(schema: T) {
  return schema
    .refine(
      (env) => {
        const r2 = [env.R2_ACCOUNT_ID, env.R2_ACCESS_KEY_ID, env.R2_SECRET_ACCESS_KEY, env.R2_BUCKET];
        return r2.every(Boolean) || !r2.some(Boolean);
      },
      { message: 'Set all of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET, or none' },
    )
    .refine((env) => !env.VERIFACTI_API_KEY || env.CONNECTOR_MASTER_KEY, {
      message: 'VERIFACTI_API_KEY requires CONNECTOR_MASTER_KEY',
    })
    .refine((env) => !env.VERIFACTI_API_KEY || env.VERIFACTI_ENVIRONMENT, {
      message: 'VERIFACTI_API_KEY requires VERIFACTI_ENVIRONMENT (test or prod)',
    })
    .refine((env) => env.VERIFACTI_ENVIRONMENT !== 'prod' || env.VERIFACTI_API_KEY, {
      message: 'VERIFACTI_ENVIRONMENT=prod requires VERIFACTI_API_KEY',
    });
}

const envSchema = withCrossChecks(
  sharedEnv.extend({
    // Signs session cookies and encrypts the TOTP secrets. At least 32 random characters.
    BETTER_AUTH_SECRET: z.string().min(32),
  }),
);

const workerEnvSchema = withCrossChecks(sharedEnv);

export type Env = z.infer<typeof envSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

/** Secrets and settings come only from environment variables. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}

/** The worker's: the same variables except those only the API uses. */
export function loadWorkerEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  return workerEnvSchema.parse(source);
}

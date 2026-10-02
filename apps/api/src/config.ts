import { z } from 'zod';

const commaSeparated = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const envSchema = z
  .object({
    DATABASE_URL: z.url(),
    PORT: z.coerce.number().int().positive().default(3000),
    // Comma-separated origins allowed to call the API from a browser (the web app).
    // `*` matches one fragment of a host name, e.g. https://verifiq-*-team.vercel.app.
    WEB_ORIGIN: z.string().default('http://localhost:5173').transform(commaSeparated),
    // Public URL of the web app, used to build the links sent by email.
    APP_URL: z.url().default('http://localhost:5173'),
    // Public URL of this API; https enables secure cookies.
    API_URL: z.url().default('http://localhost:3000'),
    // Signs session cookies and encrypts the TOTP secrets. At least 32 random characters.
    BETTER_AUTH_SECRET: z.string().min(32),
    // Without a key, emails are written to the log (local development only).
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().default('Verifiq <no-reply@verifiq.app>'),
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
    // `test` sends to the AEAT test environment; `prod` registers real invoices.
    VERIFACTI_ENVIRONMENT: z.enum(['test', 'prod']).default('test'),
    // Seals the issuers' connector API keys in the database (AES-256-GCM). 32 random bytes in base64.
    CONNECTOR_MASTER_KEY: z
      .string()
      .refine((value) => Buffer.from(value, 'base64').length === 32, { message: 'Must be 32 bytes in base64' })
      .optional(),
  })
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
  .refine((env) => env.VERIFACTI_ENVIRONMENT !== 'prod' || env.VERIFACTI_API_KEY, {
    message: 'VERIFACTI_ENVIRONMENT=prod requires VERIFACTI_API_KEY',
  });

export type Env = z.infer<typeof envSchema>;

/** Secrets and settings come only from environment variables. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}

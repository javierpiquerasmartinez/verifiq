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
  });

export type Env = z.infer<typeof envSchema>;

/** Secrets and settings come only from environment variables. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}

# Verifiq

pnpm + Turborepo monorepo (ADR 0003):

- `apps/web`: React + Vite (Vercel).
- `apps/api`: NestJS + Drizzle. Two processes from the same code: the API (`dist/main.js`) and the worker (`dist/worker.js`), both on Render.
- `packages/domain`: pure logic and shared zod schemas.

## Development

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL and BETTER_AUTH_SECRET
pnpm --filter @verifiq/api build && pnpm --filter @verifiq/api db:migrate
pnpm dev
```

The web calls the API on the same origin under `/api` (Vite proxies it to `localhost:3000`), so session cookies behave as in staging.

Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

The API integration tests boot the full Nest app against a real Postgres. They need `TEST_DATABASE_URL` pointing to a connection allowed to `CREATE DATABASE` (a local Postgres or a Neon branch); each run creates a throwaway database, applies the migrations and drops it at the end.

## Migrations

Schema in `apps/api/src/database/schema.ts`; versioned SQL migrations in `apps/api/drizzle/`. Generate them with `pnpm --filter @verifiq/api db:generate`. Backward-compatible migrations only (expand/contract). They are applied when the API starts (`pnpm start:api`); see Deployment.

## Access

There is no public sign-up. The operator invites a user from the API's environment (locally, or the Render shell):

```bash
pnpm invite lucia@example.com
```

It prints a single-use link (`APP_URL/invitation/<token>`, valid for 7 days) and emails it. The user sets a password and must set up TOTP 2FA (with recovery codes) before reaching anything else. Until 2FA is set up the password alone never opens a session: a user who abandons the set-up needs a new invitation, which resumes the account. Auth is Better Auth mounted on `/auth`, with data in our Postgres; sessions are httpOnly cookies that expire after 1 hour of inactivity and 7 days at most (a trigger on `sessions`). Sign-in, 2FA and password recovery are rate-limited per client IP.

## Version

`scripts/version.js` builds `<package.json version>+<commit>` at build time: the web receives it as `__APP_VERSION__`, and the API writes it to `dist/version.json` and serves it on `GET /health`.

## Deployment

The code is hosting-agnostic: any Node 24 host works with these `package.json` scripts, run from the repo root.

| Process | Build | Start | Variables |
|---|---|---|---|
| API | `pnpm install --frozen-lockfile && pnpm build:api` | `pnpm start:api` (migrates, then starts) | `DATABASE_URL`, `WEB_ORIGIN`, `APP_URL`, `API_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `TRUSTED_PROXIES`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `PORT` (set by the host) |
| Worker | same as the API | `pnpm start:worker` | `DATABASE_URL` |
| Web (static) | `pnpm build:web` → `apps/web/dist` | — | `VITE_API_URL=/api` (at build time) |

- Migrations run when the API starts: if they fail, the new version never starts, fails the health check (`/health`) and the host keeps the previous one. Fine with a single instance; with several (production), move migrations to a single step before the deploy.
- Staging: branch `stage`. API on Render (Frankfurt, free plan, health check `/health`), defined in the `render.yaml` Blueprint (Render syncs it from `stage`); the worker is not deployed until it has work to do. Web on Vercel with root `apps/web` (`vercel.json`) and `ENABLE_EXPERIMENTAL_COREPACK=1`.
- The web reaches the API through a same-origin rewrite (`/api/*` → the API, in `apps/web/vercel.json`), so the session cookies are first-party. The rewrite destination is the staging API; production needs its own (issue 21).
- `APP_URL` is the web app's public URL (links in emails); `API_URL` the API's own (https turns on secure cookies). `BETTER_AUTH_SECRET` signs the cookies and encrypts the TOTP secrets: changing it signs everybody out and breaks every 2FA set-up. Without `RESEND_API_KEY`, emails only go to the log. Without the `R2_*` variables (a Cloudflare R2 bucket created with EU jurisdiction), files such as logos are written to `apps/api/.storage`, which a host like Render wipes on every deploy. `TRUSTED_PROXIES` (comma-separated CIDRs) lets rate limiting read the client IP behind proxies; otherwise all clients share one bucket per endpoint.
- `WEB_ORIGIN` on the API: comma-separated web origins; `*` stands for one fragment of a host name (letters, digits and hyphens). Staging: `https://verifiq-phi.vercel.app,https://verifiq-*-javier-piqueras-martinezs-projects.vercel.app` (includes this team's Vercel previews).
- Secrets only via environment variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `R2_*`); never in the repo.

## Branches and CI

- Feature PRs go to `stage` (deploys staging); releases are a PR from `stage` to `main` (production). Both branches are protected by a ruleset: PR required, no force push or deletion.
- CI (`.github/workflows/ci.yml`) runs the `lint`, `typecheck`, `test` and `build` jobs in parallel on every PR to `stage` and `main`; all four are required checks.

## Language

Everything in the code is in English, including routes, database names and domain terms: `GLOSSARY.md` gives each Spanish domain term its English code name (Emisor → `Issuer`, Destinatario → `Recipient`, Borrador → `Draft`…). Only user-facing copy is in Spanish (the product is for Spanish freelancers). Specs, ADRs, issues and the glossary stay in Spanish.

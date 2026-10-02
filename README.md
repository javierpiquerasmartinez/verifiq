# Verifiq

pnpm + Turborepo monorepo (ADR 0003):

- `apps/web`: React + Vite (Vercel).
- `apps/api`: NestJS + Drizzle. Two processes from the same code: the API (`dist/main.js`) and the worker (`dist/worker.js`), both on Render.
- `packages/domain`: pure logic and shared zod schemas.

## Development

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL
pnpm --filter @verifiq/api build && pnpm --filter @verifiq/api db:migrate
pnpm dev
```

Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

The API integration tests boot the full Nest app against a real Postgres. They need `TEST_DATABASE_URL` pointing to a connection allowed to `CREATE DATABASE` (a local Postgres or a Neon branch); each run creates a throwaway database, applies the migrations and drops it at the end.

## Migrations

Schema in `apps/api/src/database/schema.ts`; versioned SQL migrations in `apps/api/drizzle/`. Generate them with `pnpm --filter @verifiq/api db:generate`. Backward-compatible migrations only (expand/contract). They are applied when the API starts (`pnpm start:api`); see Deployment.

## Version

`scripts/version.js` builds `<package.json version>+<commit>` at build time: the web receives it as `__APP_VERSION__`, and the API writes it to `dist/version.json` and serves it on `GET /health`.

## Deployment

The code is hosting-agnostic: any Node 24 host works with these `package.json` scripts, run from the repo root.

| Process | Build | Start | Variables |
|---|---|---|---|
| API | `pnpm install --frozen-lockfile && pnpm build:api` | `pnpm start:api` (migrates, then starts) | `DATABASE_URL`, `WEB_ORIGIN`, `PORT` (set by the host) |
| Worker | same as the API | `pnpm start:worker` | `DATABASE_URL` |
| Web (static) | `pnpm build:web` → `apps/web/dist` | — | `VITE_API_URL` (at build time) |

- Migrations run when the API starts: if they fail, the new version never starts, fails the health check (`/health`) and the host keeps the previous one. Fine with a single instance; with several (production), move migrations to a single step before the deploy.
- Staging: branch `stage`. API on Render (Frankfurt, free plan, health check `/health`), defined in the `render.yaml` Blueprint; the worker is not deployed until it has work to do. Web on Vercel with root `apps/web` (`vercel.json`) and `ENABLE_EXPERIMENTAL_COREPACK=1`.
- `WEB_ORIGIN` on the API: comma-separated web origins; `*` stands for one fragment of a host name (letters, digits and hyphens). Staging: `https://verifiq-phi.vercel.app,https://verifiq-*-javier-piqueras-martinezs-projects.vercel.app` (includes this team's Vercel previews).
- Secrets only via environment variables (`DATABASE_URL`, `WEB_ORIGIN`, `VITE_API_URL`); never in the repo.

## Branches and CI

- Feature PRs go to `stage` (deploys staging); releases are a PR from `stage` to `main` (production). Both branches are protected by a ruleset: PR required, no force push or deletion.
- CI (`.github/workflows/ci.yml`) runs the `lint`, `typecheck`, `test` and `build` jobs in parallel on every PR to `stage` and `main`; all four are required checks.

## Language

Code, comments, commits, PRs and this README are in English. Exceptions: user-facing copy is in Spanish (the product is for Spanish freelancers), and domain terms keep their Spanish names from `GLOSSARY.md` (Emisor, Destinatario, Borrador…). Specs, ADRs and issues stay in Spanish.

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

Locally the web calls the API under `/api`, which Vite proxies to `localhost:3000`; deployed, it calls the API on its own domain (see Deployment).

Commands: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

The API integration tests boot the full Nest app against a real Postgres. They need `TEST_DATABASE_URL` pointing to a connection allowed to `CREATE DATABASE` (a local Postgres or a Neon branch); each run creates a throwaway database, applies the migrations and drops it at the end.

## Migrations

Schema in `apps/api/src/database/schema.ts`; versioned SQL migrations in `apps/api/drizzle/`. Generate them with `pnpm --filter @verifiq/api db:generate`. Backward-compatible migrations only (expand/contract). They are applied when the API starts (`pnpm start:api`); see Deployment.

## Access

There is no public sign-up. Users are invited by the operator, whose account is separate: it reaches only its panel (`/operator` on the web) and never an issuer's invoices or recipients, while users never reach the panel. The operator's own account is invited once from the API's environment. Locally:

```bash
pnpm invite --operator operator@example.com
```

In the Render shell of the API, without `pnpm`: the shell shares the API's 512 MB, and `pnpm invite` (three Node processes) runs it out of memory and restarts the API:

```bash
cd apps/api && node dist/create-invitation.js --operator operator@example.com
```

From the panel the operator then invites and revokes users, and follows each issuer's Representation, invoices and open incidents, and the records the AEAT rejected, the connector blocked, or left unconfirmed for 24 h. `pnpm invite lucia@example.com` (or `node dist/create-invitation.js lucia@example.com`) still invites a user from the shell.

Each invitation is a single-use link (`APP_URL/invitation/<token>`, valid for 7 days), emailed to the invited person and shown once to the operator. The user sets a password and must set up TOTP 2FA (with recovery codes) before reaching anything else. Until 2FA is set up the password alone never opens a session: a user who abandons the set-up needs a new invitation, which resumes the account. Auth is Better Auth mounted on `/auth`, with data in our Postgres; sessions are httpOnly cookies that expire after 1 hour of inactivity and 7 days at most (a trigger on `sessions`). Sign-in, 2FA and password recovery are rate-limited per client IP.

## Version

`scripts/version.js` resolves the version at build time from the root `package.json`. Users see the release alone (`0.2.0`): the web receives it as `__APP_VERSION__` and shows it in the footer, the settings and the responsible declaration, which must identify the version of the invoicing system, so it changes only when a release bumps it (see Branches and CI). The API adds the commit (`0.2.0+aabed9b`), which names each deploy, staging's included: it writes it to `dist/version.json`, serves it on `GET /health` and the worker logs it on start.

## Deployment

The code is hosting-agnostic: any Node 24 host works with these `package.json` scripts, run from the repo root.

| Process | Build | Start | Variables |
|---|---|---|---|
| API | `pnpm install --frozen-lockfile && pnpm build:api` | `pnpm start:api` (migrates, then starts) | `DATABASE_URL`, `WEB_ORIGIN`, `APP_URL`, `API_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `CLIENT_IP_HEADER`, `TRUSTED_PROXIES`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `VERIFACTI_API_KEY`, `VERIFACTI_ENVIRONMENT`, `CONNECTOR_MASTER_KEY`, `VERIFACTI_WEBHOOK_SECRET`, `VERIFACTI_WEBHOOK_ID`, `OPERATOR_EMAIL`, `PORT` (set by the host) |
| Worker | same as the API | `pnpm start:worker` | `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (it stores the invoice PDFs and the retention archive), `VERIFACTI_API_KEY`, `VERIFACTI_ENVIRONMENT`, `CONNECTOR_MASTER_KEY` (it sends the records and polls their status), `RESEND_API_KEY`, `EMAIL_FROM`, `OPERATOR_EMAIL` (it alerts the operator) |
| Web (static) | `pnpm build:web` → `apps/web/dist` | — | `VITE_API_URL`: the API's URL (at build time) |

- Staging migrates when the API starts (`pnpm start:api`): if it fails, the new version never starts, fails the health check (`/health`) and the host keeps the previous one. Production migrates in a single step before the deploy (`pnpm migrate:api` as Render's pre-deploy command, then `pnpm serve:api`), so the worker and the running version never race a half-applied migration; migrations are backward compatible, so both keep working while it applies.
- Staging: branch `stage`. API on Render (Frankfurt, free plan, health check `/health`), defined in the `render.yaml` Blueprint (Render syncs it from `stage`). The worker runs there too, as a background worker on the cheapest paid plan (Render has no free workers); it takes its variables from the API service (`fromService`), so they are set only on the API, and changing one means redeploying the worker as well. Web on Vercel: one project with root `apps/web` (`vercel.json`) and `ENABLE_EXPERIMENTAL_COREPACK=1`, whose custom environment `staging` follows `stage` (`app.staging.verifiq.es`, `VITE_API_URL=https://api.staging.verifiq.es`). Vercel's deployment protection keeps it, and the PR previews, behind a Vercel sign-in. Emails from `Verifiq (staging) <no-reply@verifiq.es>`.
- Production: branch `main`, deployed by each release. In the same Blueprint: `verifiq-api` and `verifiq-worker` (Frankfurt, Starter plans: no cold starts, so the webhook answers within 10 s), `VERIFACTI_ENVIRONMENT=prod`. Its own Neon project (`verifiq-production`, Frankfurt), R2 bucket (`verifiq-production`, EU, with the `archive/` lock), secrets (`BETTER_AUTH_SECRET`, `CONNECTOR_MASTER_KEY`, `VERIFACTI_WEBHOOK_SECRET`) and Verifacti webhook (`entorno: prod`). Emails from `Verifiq <no-reply@verifiq.es>` (domain verified in Resend, EU). Web: the production environment of the same Vercel project, following `main` (`app.verifiq.es`, `VITE_API_URL=https://api.verifiq.es`). Never copy production data into staging unless anonymized.
- Domains (issue 22): the web and the API share the site `verifiq.es`, so the session cookies (host-only on the API, `SameSite=Lax`, `Secure`) travel with the web's cross-origin requests and no proxy stands between them. Staging: web `https://app.staging.verifiq.es`, API `https://api.staging.verifiq.es`; production: `https://app.verifiq.es` and `https://api.verifiq.es`. DNS on Cloudflare, with the records of Render and Vercel as DNS only (not proxied): a proxy of ours in front of Render would hide the client IP. Each web is built with `VITE_API_URL` set to its API. Vercel previews (`*.vercel.app`) are another site: they show the UI but cannot sign in.
- `APP_URL` is the web app's public URL (links in emails); `API_URL` the API's own (https turns on secure cookies). `BETTER_AUTH_SECRET` signs the cookies and encrypts the TOTP secrets: changing it signs everybody out and breaks every 2FA set-up. Without `RESEND_API_KEY`, emails only go to the log. Without the `R2_*` variables (a Cloudflare R2 bucket created with EU jurisdiction), files such as logos and invoice PDFs are written to `apps/api/.storage`, which a host like Render wipes on every deploy. Rate limiting and the new sign-in email need the client IP: `CLIENT_IP_HEADER` names the header in which the host in front of the API puts it, which clients cannot forge (Render: `cf-connecting-ip`, set by its Cloudflare edge, which refuses a client's own). Otherwise `TRUSTED_PROXIES` (comma-separated CIDRs) has it read from `X-Forwarded-For`, stripping those proxies; with neither, all clients share one bucket per endpoint. IPv6 clients are counted, and shown in that email, by their /64 network. `VERIFACTI_API_KEY` is the Verifacti account key (`vfn_…`) and `VERIFACTI_ENVIRONMENT` (`test` or `prod`, required with the key) picks the AEAT environment; only `prod` asks issuers to sign the Representation. Without the key an in-memory fake stands in for VeriFactu, which `prod` refuses. `CONNECTOR_MASTER_KEY` (`openssl rand -base64 32`) seals each issuer's Verifacti key in the database: losing it means fetching every key again from Verifacti. The AEAT's verdicts arrive at `POST /webhooks/verifactu`, the webhook registered at Verifacti with `VERIFACTI_WEBHOOK_SECRET` as its `secret` (deliveries with any other signature get a 401); without it they arrive only through the worker's poll every 15 minutes. The webhook is registered once per environment, by hand (`POST /webhooks` with the account key, `entorno` and that `secret`); the `id` it returns goes in `VERIFACTI_WEBHOOK_ID`, and every issuer the app registers at Verifacti is then linked to it (it requires the secret: Verifacti disables a webhook whose deliveries keep failing). Records still unconfirmed 24 h after their Issuance are emailed once to `OPERATOR_EMAIL` (only logged without it). The same address gets the operational alerts (`src/alerts/operator-alerts.ts`), from the API and the worker: a record whose submission fails for the 5th time (a couple of minutes) or is given up (31 attempts, about a day), webhook deliveries with a bad signature or that failed to process (Verifacti disables a webhook that keeps failing), a failed round of the status poll or of the retention archive, and PDF files the archive did not find. At most one email an hour of each kind (not of each record) per process, counted from the process start; they are always logged. A process that crashes or a failed deploy are Render's to report: turn on its email notifications for both services.
- `WEB_ORIGIN` on the API: comma-separated web origins; `*` stands for one fragment of a host name (letters, digits and hyphens). Staging: `https://app.staging.verifiq.es`; production: `https://app.verifiq.es`.
- Secrets only via environment variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `R2_*`, `VERIFACTI_API_KEY`, `CONNECTOR_MASTER_KEY`, `VERIFACTI_WEBHOOK_SECRET`); never in the repo.

## Retention

Issued invoices, their PDFs and the connector's answers are kept for 6 years, even after an issuer leaves (spec, story 97); an issuer leaves by hand: the operator deactivates its tax ID at Verifacti and nothing is deleted. Postgres is the primary copy: issued invoices, their records, the PDF versions, the audit log and the connector exchanges cannot be deleted there (triggers); the PDF files themselves are protected only by their copy under `archive/`.

Every day at 03:00 (Madrid) the worker copies to the R2 bucket, under `archive/`, what changed since its previous round (`archive_runs`): each changed invoice as a new JSON version (`archive/issuers/<issuer>/invoices/<invoice>/versions/`: its frozen copy and every record, with what it sent and what the AEAT answered), a copy of each new PDF (`…/pdfs/`), and the new rows of the connector exchanges, the audit log (`archive/issuers/<issuer>/connector-exchanges/`, `…/audit-events/`) and the results webhook (`archive/webhook-deliveries/`), as NDJSON. It only adds objects, never overwrites them, and a failed round is exported again by the next one. A bucket lock rule on the `archive/` prefix (Cloudflare dashboard → R2 → the bucket → Settings → Bucket lock rules, rule `archive-retention`, retention 7 years) forbids deleting or overwriting them for 7 years from their upload, even with the bucket's own keys: the 6 legal years count from the close of the financial year (Código de Comercio, art. 30), up to a year after the upload.

## Branches and CI

- Feature PRs go to `stage` (deploys staging); releases are a PR from `stage` to `main` (production). Both branches are protected by a ruleset: PR required, no force push or deletion.
- Releasing, in order:
  1. Bump `version` in the root `package.json` ([semver](https://semver.org): a minor for new features, a patch for fixes only) in a PR to `stage`, e.g. `chore: Release 0.2.0`. The app and the responsible declaration show it as it is; `/health` adds the commit.
  2. Once staging has deployed it, run the end-to-end tests (Actions → E2E → Run workflow).
  3. Open the PR from `stage` to `main` and merge it with a merge commit, never squash, so the branches never diverge.
  4. Once production has deployed, check `https://api.verifiq.es/health` shows the new version, then tag that merge and publish the release:

     ```bash
     git fetch origin && git tag -a v0.2.0 origin/main -m "v0.2.0" && git push origin v0.2.0
     gh release create v0.2.0 --verify-tag --title v0.2.0 --notes "…"
     ```

     The repository is public: the release notes say what changed for users, never accounts, tax IDs or infrastructure details.
- CI (`.github/workflows/ci.yml`) runs the `lint`, `typecheck`, `test` and `build` jobs in parallel on every PR to `stage` and `main`; all four are required checks. The `Verifacti contract` workflow runs the VeriFactu connector contract tests against the Verifacti sandbox on demand (Actions → Run workflow); it needs the `VERIFACTI_TEST_TAX_ID` and `VERIFACTI_TEST_NAME` repository secrets (the test NIF and its census name) and a key: `VERIFACTI_TEST_ISSUER_API_KEY`, the free plan's test company key (`vf_test_…`), runs the records part (submission, amendment, voiding, status); `VERIFACTI_TEST_ACCOUNT_API_KEY`, the account key (`vfn_…`, paid plan), runs the whole contract, registering issuers, Representation and census included.

## End-to-end tests

`apps/e2e` (Playwright) drives a real browser against staging (issue 29): the operator invites a freelancer, who sets up 2FA and goes through onboarding up to the terms (accepting them would register a new test tax ID at Verifacti on every run); and the e2e user issues an invoice, sees its QR, waits for the AEAT test environment to accept it and rectifies it, then issues another and voids it. Run them before each release, from GitHub: Actions → E2E → Run workflow (about 3 minutes; never on every push, as the AEAT test environment limits its volume). Locally: `E2E_BASE_URL=… pnpm --filter @verifiq/e2e e2e` with the same variables.

Its accounts are staging's: an operator (`javi+e2e-operador@verifiq.es`) and a user (`javi+e2e@verifiq.es`) who is a second member of the staging issuer (inserted by hand in `issuer_memberships`; the UI has one user per issuer), which needs at least one recipient identified in the census: the test invoices the first one. Repository secrets: `E2E_OPERATOR_EMAIL`, `E2E_OPERATOR_PASSWORD`, `E2E_OPERATOR_TOTP_SECRET`, `E2E_USER_EMAIL`, `E2E_USER_PASSWORD`, `E2E_USER_TOTP_SECRET` (the base32 key shown under the 2FA set-up QR, not the recovery codes; an `otpauth://` URI works too) and `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel → Deployment Protection → Protection Bypass for Automation: staging is behind Vercel's sign-in). Each run leaves on staging an invoice rectified, an invoice voided and an issuer with its onboarding unfinished. On failure, the run's `playwright-report` artifact has a screenshot of each failed test; there are no traces, as they would record the passwords typed.

## Language

Everything in the code is in English, including routes, database names and domain terms: `GLOSSARY.md` gives each Spanish domain term its English code name (Emisor → `Issuer`, Destinatario → `Recipient`, Borrador → `Draft`…). Only user-facing copy is in Spanish (the product is for Spanish freelancers). Specs, ADRs, issues and the glossary stay in Spanish.

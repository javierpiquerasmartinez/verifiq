# Verifiq

Monorepo pnpm + Turborepo (ADR 0003):

- `apps/web`: React + Vite (Vercel).
- `apps/api`: NestJS + Drizzle. Dos procesos del mismo código: API (`dist/main.js`) y worker (`dist/worker.js`), ambos en Render.
- `packages/domain`: lógica pura y schemas zod compartidos.

## Desarrollo

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # ajustar DATABASE_URL
pnpm --filter @verifiq/api build && pnpm --filter @verifiq/api db:migrate
pnpm dev
```

Comandos: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

Los tests de integración de la API arrancan la app Nest completa contra una Postgres real. Necesitan `TEST_DATABASE_URL` apuntando a una conexión con permiso para `CREATE DATABASE` (Postgres local o una rama de Neon); cada ejecución crea una base de datos desechable, aplica las migraciones y la borra al terminar.

## Migraciones

Esquema en `apps/api/src/database/schema.ts`; migraciones SQL versionadas en `apps/api/drizzle/`. Generar con `pnpm --filter @verifiq/api db:generate`. Solo migraciones compatibles hacia atrás (expand/contract). En Render se aplican como `preDeployCommand`; si fallan, el despliegue se aborta.

## Versión

`scripts/version.js` compone `<version de package.json>+<commit>` en el build: la web la recibe como `__APP_VERSION__` y la API la escribe en `dist/version.json` y la sirve en `GET /health`.

## Despliegue

- Staging: rama `stage`. Render Blueprint `render.yaml` (API + worker, Frankfurt). Web en Vercel con raíz `apps/web` (`vercel.json`) y `VITE_API_URL` apuntando a la API.
- Vercel: definir `ENABLE_EXPERIMENTAL_COREPACK=1` para que use el pnpm de `packageManager`. `WEB_ORIGIN` en la API debe incluir el dominio de la web (las URLs de preview no están permitidas por CORS).
- Render: `preDeployCommand` requiere una instancia de pago (`plan: starter`).
- Secretos solo por variables de entorno (`DATABASE_URL`, `WEB_ORIGIN`, `VITE_API_URL`); nunca en el repo.
- CI (`.github/workflows/ci.yml`): lint, typecheck y tests en cada PR a `stage` y `main`. Para que bloquee el merge, marcar el job `ci` como check obligatorio en la protección de ambas ramas.

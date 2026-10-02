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

El código no depende del proveedor: cualquier hosting de Node 24 sirve con estos scripts de `package.json`, ejecutados desde la raíz del repo.

| Proceso | Build | Arranque | Variables |
|---|---|---|---|
| API | `pnpm install --frozen-lockfile && pnpm build:api` | `pnpm start:api` (migra y arranca) | `DATABASE_URL`, `WEB_ORIGIN`, `PORT` (la pone el hosting) |
| Worker | igual que la API | `pnpm start:worker` | `DATABASE_URL` |
| Web (estática) | `pnpm build:web` → `apps/web/dist` | — | `VITE_API_URL` (en build) |

- Las migraciones se aplican al arrancar la API: si fallan, la versión nueva no arranca, no pasa el health check (`/health`) y el hosting mantiene la anterior. Válido con una sola instancia; con varias (producción) mover la migración a un paso único previo al despliegue.
- Staging: rama `stage`. API en Render (Frankfurt, plan free, health check `/health`) definida en el Blueprint `render.yaml`; el worker no se despliega hasta que tenga trabajo. Web en Vercel con raíz `apps/web` (`vercel.json`) y `ENABLE_EXPERIMENTAL_COREPACK=1`.
- `WEB_ORIGIN` en la API debe incluir el dominio de la web (las URLs de preview no están permitidas por CORS).
- Secretos solo por variables de entorno (`DATABASE_URL`, `WEB_ORIGIN`, `VITE_API_URL`); nunca en el repo.
- CI (`.github/workflows/ci.yml`): jobs `lint`, `typecheck`, `test` y `build` en paralelo en cada PR a `stage` y `main`; los cuatro son checks obligatorios en el ruleset de ambas ramas.

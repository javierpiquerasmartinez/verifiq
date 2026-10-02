# 01: Esqueleto funcional

Spec: `../spec.md` · ADR 0003

**What to build:** el monorepo arranca, se prueba y se despliega a staging de punta a punta. Una página web muestra la versión del software servida por la API, leída desde la base de datos de staging. Establece el harness de tests de la frontera principal (API HTTP contra una Postgres real).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] Monorepo pnpm + Turborepo con los paquetes web (React + Vite), api (NestJS) y domain (compartido)
- [ ] Drizzle configurado contra Neon con una primera migración versionada
- [x] Endpoint de salud/versión en la API que toca la base de datos; la web lo muestra
- [x] Versión del software inyectada en build y visible en web y API
- [x] Harness de tests de integración: arranca la app Nest completa contra una Postgres real de test (Docker o rama Neon), con un ejemplo de test sobre el endpoint
- [ ] CI: lint, typecheck y tests en cada PR; bloquea el merge a `stage` y `main`
- [ ] Staging desplegado: API y servicio worker (vacío) en Render (Frankfurt), web en Vercel; las migraciones se ejecutan como pre-deploy y un fallo aborta el despliegue
- [x] Secretos solo por variables de entorno; ningún secreto en el repo

## Comments

**2026-10-02 (agente):** implementado el código y la configuración. Pendiente del operador (requiere sus cuentas):
- Drizzle contra Neon: crear el proyecto Neon (Frankfurt) y poner `DATABASE_URL` en Render; el código usa `pg`, compatible con Neon. Probado contra Postgres 16 local.
- CI: crear la rama `stage` y marcar el job `ci` como check obligatorio en la protección de `stage` y `main`.
- Staging: aplicar `render.yaml` como Blueprint (API + worker, `plan: starter` para tener pre-deploy) y crear el proyecto Vercel con raíz `apps/web`, `VITE_API_URL` y `ENABLE_EXPERIMENTAL_COREPACK=1`; `WEB_ORIGIN` en Render = dominio de Vercel.
- Interpretación: la versión la sirve la API desde el build (`dist/version.json`); el endpoint `/health` toca la base de datos (`select 1`) y falla si no está accesible. La primera migración es una línea base vacía.

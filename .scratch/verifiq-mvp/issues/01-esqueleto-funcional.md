# 01: Esqueleto funcional

Spec: `../spec.md` · ADR 0003

**What to build:** el monorepo arranca, se prueba y se despliega a staging de punta a punta. Una página web muestra la versión del software servida por la API, leída desde la base de datos de staging. Establece el harness de tests de la frontera principal (API HTTP contra una Postgres real).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Monorepo pnpm + Turborepo con los paquetes web (React + Vite), api (NestJS) y domain (compartido)
- [ ] Drizzle configurado contra Neon con una primera migración versionada
- [ ] Endpoint de salud/versión en la API que toca la base de datos; la web lo muestra
- [ ] Versión del software inyectada en build y visible en web y API
- [ ] Harness de tests de integración: arranca la app Nest completa contra una Postgres real de test (Docker o rama Neon), con un ejemplo de test sobre el endpoint
- [ ] CI: lint, typecheck y tests en cada PR; bloquea el merge a `stage` y `main`
- [ ] Staging desplegado: API y servicio worker (vacío) en Render (Frankfurt), web en Vercel; las migraciones se ejecutan como pre-deploy y un fallo aborta el despliegue
- [ ] Secretos solo por variables de entorno; ningún secreto en el repo

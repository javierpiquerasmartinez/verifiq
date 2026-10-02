# 21: Preparación para producción

Spec: `../spec.md` (historias 97, 100; Further Notes)

**What to build:** Verifiq queda listo para que el primer Emisor facture en real: e2e verdes contra staging, entorno de producción desplegado, conservación garantizada y checklist legal cerrado.

**Blocked by:** 13; 14; 16; 17; 18; 19; 20

**Status:** ready-for-agent

- [ ] Tests e2e con Playwright contra staging: alta completa, crear y emitir con QR, rectificar, anular
- [ ] Producción: Neon, Render y Vercel de producción, base de datos separada, release por PR `stage` → `main`
- [ ] Exportación periódica a R2 de copias congeladas, PDFs y respuestas del conector; conservación 6 años documentada
- [ ] Alertas operativas (errores del worker, webhooks fallidos) llegan al operador
- [ ] Checklist (humano): textos legales y declaración responsable, contratos de subencargo, validación del asesor (tabla R1/R4, Anulación por no entrega, fecha de operación mensual), dudas abiertas con Verifacti, revisión de aplazamientos de VeriFactu

## Comments

**2026-10-02 (agente, desde la issue 01):** decisiones previas para montar producción (rama `main`):
- Render: servicio `verifiq-api` en `render.yaml` (`branch: main`), plan free al principio; pasar a Starter antes de emitir facturas reales (sin arranques en frío: webhook de Verifacti <10 s) y desplegar el worker (`pnpm start:worker`).
- Migraciones: con una instancia basta migrar al arrancar (`pnpm start:api`); con API + worker siempre encendidos, migrar en un paso único previo (`preDeployCommand` en plan de pago, o GitHub Action que migra y luego llama al deploy hook con auto-deploy desactivado).
- Neon: rama raíz `production` y `staging` como rama hija (el `DATABASE_URL` de staging cambia a la rama hija). Nunca resetear staging desde producción con datos reales salvo anonimizados.
- Vercel: proyecto propio siguiendo `main`, con `VITE_API_URL` de producción y `ENABLE_EXPERIMENTAL_COREPACK=1`. `WEB_ORIGIN` de producción: solo su dominio, sin previews.
- Release: PR `stage` → `main` con merge commit (no squash), para que las ramas no diverjan.

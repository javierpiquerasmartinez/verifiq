# 21: Preparación para producción

Spec: `../spec.md` (historias 97, 100; Further Notes)

**What to build:** Verifiq queda listo para que el primer Emisor facture en real: e2e verdes contra staging, entorno de producción desplegado, conservación garantizada y checklist legal cerrado.

**Blocked by:** 13; 14; 16; 17; 18; 19; 20

**Status:** done

- [ ] ~~Tests e2e con Playwright contra staging: alta completa, crear y emitir con QR, rectificar, anular~~ → issue 29
- [x] Producción: Neon, Render y Vercel de producción, base de datos separada, release por PR `stage` → `main`
- [x] Exportación periódica a R2 de copias congeladas, PDFs y respuestas del conector; conservación 6 años documentada
- [x] Alertas operativas (errores del worker, webhooks fallidos) llegan al operador
- [ ] ~~Checklist (humano): textos legales y declaración responsable, contratos de subencargo, validación del asesor (tabla R1/R4, Anulación por no entrega, fecha de operación mensual), dudas abiertas con Verifacti, revisión de aplazamientos de VeriFactu~~ → issue 30

## Comments

**2026-10-02 (agente, desde la issue 01):** decisiones previas para montar producción (rama `main`):
- Render: servicio `verifiq-api` en `render.yaml` (`branch: main`), plan free al principio; pasar a Starter antes de emitir facturas reales (sin arranques en frío: webhook de Verifacti <10 s) y desplegar el worker (`pnpm start:worker`).
- Migraciones: con una instancia basta migrar al arrancar (`pnpm start:api`); con API + worker siempre encendidos, migrar en un paso único previo (`preDeployCommand` en plan de pago, o GitHub Action que migra y luego llama al deploy hook con auto-deploy desactivado).
- Neon: rama raíz `production` y `staging` como rama hija (el `DATABASE_URL` de staging cambia a la rama hija). Nunca resetear staging desde producción con datos reales salvo anonimizados.
- Vercel: proyecto propio siguiendo `main`, con `VITE_API_URL` de producción y `ENABLE_EXPERIMENTAL_COREPACK=1`. `WEB_ORIGIN` de producción: solo su dominio, sin previews.
- Release: PR `stage` → `main` con merge commit (no squash), para que las ramas no diverjan.

**2026-10-19 (agente):** cerrada. Hecho:
- Archivo de conservación (PR #46): cada día a las 03:00 el worker copia a R2 (`archive/`) las versiones de cada factura cambiada, los PDFs nuevos, los intercambios con el conector, la auditoría y los webhooks. Bucket lock de 7 años (2555 días) en `archive/`, en staging y en producción: los 6 años legales cuentan desde el cierre del ejercicio.
- Alertas al operador por email (PR #47): Registro que falla al 5.º intento o se abandona, webhook con firma no válida o que falla, sondeo o archivo que fallan, PDF que falta. Como mucho una por hora y tipo y proceso. Caídas y despliegues fallidos: notificaciones de Render.
- Dominio propio y la IP del cliente (issue 22, PRs #48 y #49).
- Producción (PRs #50 y #51): proyecto Neon `verifiq-production`, `verifiq-api` y `verifiq-worker` en Render (Starter, migración en el paso previo al despliegue), `app.verifiq.es` en Vercel (un proyecto con un entorno `staging` que sigue `stage`, tras la protección de Vercel), bucket R2 `verifiq-production`, emails desde `no-reply@verifiq.es`, webhook de Verifacti `prod` y cuenta de operador. Primera release `stage` → `main` con merge commit.
- En el Shell de Render no se usa `pnpm invite`: con 512 MB se queda sin memoria. Se usa `cd apps/api && node dist/create-invitation.js`.
- Se mueven a otras issues los e2e (29) y el checklist legal (30).

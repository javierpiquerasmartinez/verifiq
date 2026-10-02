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

# 29: Tests e2e contra staging

Spec: `../spec.md` (Testing Decisions: «E2E») · issue 21

**What to build:** unos pocos tests con Playwright que usan Verifiq en un navegador real contra staging (`https://app.staging.verifiq.es`) y comprueban de punta a punta lo que los tests de la API no ven: web y API en dominios distintos (cookies, CORS), la configuración de Render, Vercel, Neon, R2 y Resend, y Verifacti y la AEAT de pruebas de verdad, webhook incluido.

**Blocked by:** 21

**Status:** done

Antes de empezar hay que decidir el alcance. Coste: unas horas de montaje, pasos manuales de una sola vez y mantenimiento cuando cambie la interfaz; la AEAT de pruebas puede tardar o fallar sin que haya un bug.
1. **Completo** (spec): alta, emitir con QR, rectificar y anular. Rectificar y anular exigen el veredicto de la AEAT: el test espera minutos.
2. **Mínimo:** iniciar sesión con la cuenta e2e, emitir una factura y ver el QR. Sin alta ni veredicto de la AEAT: más barato y estable.
3. **Aplazarlo:** checklist manual antes de cada release, documentada en el README.

Diseño propuesto para la opción 1 (2026-10-19):
- `alta`: un operador e2e invita a un email único (`e2e+<id>@verifiq.es`, el enlace se lee del panel) → contraseña → 2FA (secreto leído de la pantalla) → asistente con un NIF aleatorio válido → lista de facturas vacía. Al final borra el NIF de test en Verifacti (`DELETE /nifs/test/{nif}/permanent`). Sin comprobar: si Verifacti `test` acepta un NIF fuera del censo (sus docs no dicen que lo compruebe; la AEAT de pruebas no acepta NIFs inventados en los registros).
- `facturacion`: un usuario e2e fijo, segundo miembro del Emisor de staging del operador (NIF real 48413846L; el modelo admite varios usuarios por Emisor, la UI no). Contraseña + TOTP → Destinatario real del censo → emitir → QR → esperar aceptación (≤10 min) → rectificar; otra factura → veredicto → anular.
- Restricciones: un NIF solo puede tener un Emisor en Verifiq (`issuers.tax_id` único); `isRectifiable` exige `accepted`/`accepted-with-errors`; `isVoidable` excluye `pending-submission`/`submitted`.
- Ejecución manual (`workflow_dispatch`) y antes de cada release; no en cada push (límites de volumen de la AEAT de pruebas).
- Staging está tras la protección de Vercel: usar *Protection Bypass for Automation* (cabecera `x-vercel-protection-bypass`).

Pasos manuales (una vez):
- [x] Cuentas e2e en staging: operador `javi+e2e-operador@verifiq.es` y usuario `javi+e2e@verifiq.es` (subaddressing de Email Routing), guardando contraseña y secreto TOTP
- [x] `INSERT INTO issuer_memberships` del usuario e2e en el Emisor de staging (editor SQL de Neon)
- [x] Secreto de *Protection Bypass for Automation* en Vercel
- [x] Secretos de GitHub: credenciales e2e, bypass y la clave de cuenta de Verifacti
- [x] Confirmar con Verifacti (issue 30) que los NIFs de `entorno: test` creados por API no se facturan

## Comments

**2026-10-19 (agente):** hecha la opción 1, con un ajuste en el alta. Al aceptar las condiciones (`POST /onboarding/terms`), la API registra el Emisor en Verifacti, así que el test llega hasta las condiciones (las marca y comprueba que se pueden aceptar) y no las envía: no crea NIFs de test. Si Verifacti confirma que los NIFs de `test` no se facturan, basta con pulsar «Aceptar y continuar» y comprobar el paso de la Representación.
- `apps/e2e`: `onboarding.spec.ts` y `invoicing.spec.ts`. Primera ejecución verde en 2,6 min: rectificar 28 s; anular 1,9 min (la AEAT tardó en contestar); alta 14 s.
- Workflow `E2E` (manual). La protección de Vercel se salta con `x-vercel-protection-bypass`, solo en las peticiones a la web: en las de la API rompería el preflight de CORS.
- Al montarlo: los secretos TOTP guardados eran los códigos de recuperación (botón «Copiar códigos»); la clave es el texto bajo el QR. En local, las verificaciones seguidas desde una misma IP chocan con el rate limiting (5 por minuto).

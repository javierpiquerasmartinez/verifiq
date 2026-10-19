# 02: Invitación y acceso con 2FA

Spec: `../spec.md` (historias 1–12) · ADR 0003

**What to build:** el operador genera una invitación (por script en este ticket; la UI llega en 19). El Usuario abre el enlace, fija su contraseña, configura obligatoriamente 2FA TOTP con códigos de recuperación y puede iniciar y cerrar sesión, y recuperar la contraseña. No existe registro público.

**Blocked by:** 01; `design.html`

**Status:** done

- [x] Better Auth embebido; datos en nuestra Postgres; sesiones por cookie httpOnly
- [x] Invitaciones de un solo uso con caducidad; enlace caducado o usado muestra un mensaje claro
- [x] Sin 2FA configurado no se accede a nada salvo su configuración; se muestran códigos de recuperación una vez
- [x] Login con email + contraseña + código TOTP o código de recuperación
- [x] Recuperación de contraseña por email (Resend, región UE)
- [x] Email de aviso ante un nuevo inicio de sesión
- [x] Expiración por inactividad y duración máxima de sesión de 7 días
- [x] Rate limiting en login y recuperación
- [x] Tests de API: invitación válida/caducada/reutilizada, 2FA obligatorio, rate limit

## Comments

**2026-10-02 (agente):** implementado en `feat/invitation-and-2fa-access`.
- API: Better Auth montado en `/auth` (adaptador Drizzle, plugin `twoFactor`, registro público desactivado, `/two-factor/disable` desactivado, sin «confiar en este dispositivo»). Guard global en Nest: sin sesión → 401 `UNAUTHENTICATED`; sin 2FA → 403 `TWO_FACTOR_REQUIRED`. Los endpoints de Better Auth también se niegan sin 2FA, salvo su configuración, `get-session`, `sign-out` y la recuperación.
- Invitaciones: `pnpm invite <email>` (operador) imprime y envía por email el enlace `APP_URL/invitacion/<token>`; 7 días, un solo uso (reclamo atómico), solo se guarda el hash del token. `GET /invitations/:token` y `POST /invitations/:token/accept` (crea el Usuario, inicia sesión y lleva a configurar 2FA).
- Sesiones: 1 h de inactividad (decisión propia; ajustable en `INACTIVITY_TIMEOUT_SECONDS`) y máximo 7 días desde el inicio, impuesto por un trigger en `sessions`.
- Rate limiting en base de datos, por IP: login 5/min, código 2FA 5/min (más el bloqueo de cuenta del plugin: 10 fallos → 15 min), recuperación 3/15 min, cambio de contraseña 5/15 min.
- Emails (puerto `Mailer`, adaptador Resend; sin clave se escriben en el log): invitación, recuperación de contraseña (enlace 1 h, cierra todas las sesiones) y aviso de nuevo inicio de sesión (solo al completar el login, no en el paso de contraseña ni al aceptar la invitación).
- Web: TanStack Router con `/entrar`, `/invitacion/$token`, `/configurar-2fa`, `/recuperar`, `/restablecer`; estilos del design system v1 de `design.html` (no trae pantallas de acceso: se han compuesto con sus componentes).
- Cookies de primera parte: la web llama a la API por `/api` en su mismo origen (rewrite de Vercel; proxy de Vite en local). Evita el bloqueo de cookies de terceros entre `vercel.app` y `onrender.com`.
- Fuera de este ticket (historias 9 y 10): ver y revocar sesiones, regenerar códigos de recuperación (la API ya lo admite; falta la UI, p. ej. en Ajustes, issue 20).

Pendiente del operador para staging:
- Render: `BETTER_AUTH_SECRET` (el Blueprint lo genera), `APP_URL=https://verifiq-phi.vercel.app`, `API_URL=https://verifiq-api-staging.onrender.com`, `RESEND_API_KEY` y `EMAIL_FROM` con un dominio verificado en Resend en la región UE. `TRUSTED_PROXIES` si se quiere rate limiting por IP real detrás de Vercel + Render (sin él, todos los clientes comparten el contador de cada endpoint).
- Vercel: `VITE_API_URL=/api`. Comprobar que el destino del rewrite en `apps/web/vercel.json` es la URL real del servicio de Render.

**2026-10-02 (agente):** tras la revisión de código.
- Cerrado el hueco de alta a medias: una cuenta sin 2FA ya no puede iniciar sesión con la contraseña (403 `TWO_FACTOR_SETUP_INCOMPLETE`; solo con la contraseña correcta, para no revelar nada a quien no la sepa). Antes, quien tuviera la contraseña podía configurar el 2FA con su propio móvil y quedarse la cuenta. La única sesión sin 2FA es la que crea el enlace de invitación (que exige acceso al email).
- Si el Usuario abandona el alta, el operador le envía otra invitación (`pnpm invite <email>`): al aceptarla se retoma la cuenta (nombre y contraseña nuevos, sesiones anteriores cerradas). Si la cuenta ya tiene 2FA, la invitación se rechaza con `EMAIL_TAKEN` y sigue sin usarse.
- Pendiente, a decidir con datos de staging: el rate limiting comparte contador entre todos los clientes cuando la API no puede resolver la IP real detrás de Vercel + Render. Opciones: fiarse de una cabecera de Vercel (con un secreto compartido para que no se pueda llamar a Render directamente) o, en producción, un dominio propio con la API en un subdominio (issue 21).

**2026-10-02 (agente):** cierre. Verificado en staging (PR #5, versión `0.1.0+1ac1f2d`).
- Variables configuradas: en Render `BETTER_AUTH_SECRET`, `APP_URL`, `API_URL`, `RESEND_API_KEY` y `EMAIL_FROM` (Resend con el dominio `verifiq.jpdev.app`, región UE); en Vercel `VITE_API_URL=/api` en Preview y Production.
- Flujo probado por el operador en el navegador: invitación → cuenta → configuración del 2FA → códigos de recuperación → cierre de sesión → inicio con TOTP (llega el aviso de nuevo inicio de sesión) → recuperación de contraseña por email.
- Render free no tiene Shell: la invitación se generó con `pnpm invite` en local contra la base de datos de staging (`APP_URL` de staging). Hasta que exista el panel de operador (issue 19), es la forma de invitar.
- Confirmado el problema del rate limiting: el aviso de inicio de sesión muestra «Dirección IP: desconocida», así que detrás de Vercel + Render todos los clientes comparten el contador. Sigue en la issue 22.

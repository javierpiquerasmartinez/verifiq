# 02: Invitación y acceso con 2FA

Spec: `../spec.md` (historias 1–12) · ADR 0003

**What to build:** el operador genera una invitación (por script en este ticket; la UI llega en 19). El Usuario abre el enlace, fija su contraseña, configura obligatoriamente 2FA TOTP con códigos de recuperación y puede iniciar y cerrar sesión, y recuperar la contraseña. No existe registro público.

**Blocked by:** 01; `design.html`

**Status:** ready-for-agent

- [ ] Better Auth embebido; datos en nuestra Postgres; sesiones por cookie httpOnly
- [ ] Invitaciones de un solo uso con caducidad; enlace caducado o usado muestra un mensaje claro
- [ ] Sin 2FA configurado no se accede a nada salvo su configuración; se muestran códigos de recuperación una vez
- [ ] Login con email + contraseña + código TOTP o código de recuperación
- [ ] Recuperación de contraseña por email (Resend, región UE)
- [ ] Email de aviso ante un nuevo inicio de sesión
- [ ] Expiración por inactividad y duración máxima de sesión de 7 días
- [ ] Rate limiting en login y recuperación
- [ ] Tests de API: invitación válida/caducada/reutilizada, 2FA obligatorio, rate limit

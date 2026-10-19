# 20: Ajustes y declaración responsable

Spec: `../spec.md` (historias 9, 10, 87, 88, 90, 99)

**What to build:** el Usuario edita los datos y valores por defecto de su Emisor, gestiona su seguridad y consulta la declaración responsable con la versión del software.

**Blocked by:** 03; 06; `design.html`

**Status:** done

- [x] Editar datos del Emisor y valores por defecto; Serie visible y bloqueada; estado de la Representación
- [x] Seguridad: cambiar contraseña, regenerar códigos de recuperación, ver y revocar sesiones
- [x] Página de declaración responsable (texto proporcionado por el operador, SIF "Verifiq", versión inyectada en build, referencia a Verifacti) enlazada desde Ajustes y el pie
- [x] Cambiar datos del Emisor no altera facturas emitidas (test)

## Comments

- (implementación) El NIF del Emisor queda bloqueado en Ajustes igual que la Serie: la clave de Verifacti y la Representación van ligadas a él. `PUT /issuer/fiscal-data` ignora el NIF; una vez completada el alta, `PUT /onboarding/fiscal-data` y `PUT /onboarding/defaults` responden 409 `ONBOARDING_COMPLETED`.
- Cambiar la contraseña cierra siempre las demás sesiones (la API rechaza la petición si no lo pide). `freshAge: 0` en Better Auth para poder listar sesiones de más de 24 h; lo sensible (contraseña, códigos) pide la contraseña.
- Declaración responsable en `/responsible-declaration` (pública), con los campos a)–l) de la Orden HAC/1177/2024 art. 15. Productor, NIF y dirección dados por el operador; lugar Valencia, fecha 8 de octubre de 2026. Pendientes con Verifacti: código identificador del sistema (b) y versión de Verifacti (d), que se muestran como «pendiente de confirmar con Verifacti». La fecha de firma es fija: revisarla en cada versión que cambie el texto; el histórico de versiones queda en git.

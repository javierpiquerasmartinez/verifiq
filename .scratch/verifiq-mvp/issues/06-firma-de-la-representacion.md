# 06: Firma de la Representación en el alta

Spec: `../spec.md` (historias 22–26, 88)

**What to build:** el paso 5 del alta. Verifiq crea la clave del Emisor en Verifacti con la cuenta del operador e inicia la firma remota de la Representación; el Usuario firma verificándose con DNI, ve el estado (pendiente, firmada, error) y puede reenviar el enlace. Mientras no esté firmada, Emitir queda deshabilitado con un aviso persistente.

**Blocked by:** 03; 05; `design.html`

**Status:** ready-for-agent

- [ ] Al llegar al paso 5 se crea la clave del Emisor (idempotente si se reintenta)
- [ ] Botón "Firmar autorización" inicia la firma remota y abre la URL; "Reenviar enlace"
- [ ] El estado se sondea y se refleja en el asistente y en Ajustes
- [ ] El Emisor expone "puede emitir" solo con Representación correcta; aviso persistente en caso contrario
- [ ] Mientras tanto se pueden crear Destinatarios, Artículos y Borradores
- [ ] Staging usa el NIF de test, que no requiere Representación
- [ ] Tests de API con el fake: pendiente → firmada, error, reintento

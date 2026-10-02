# 19: Panel del operador

Spec: `../spec.md` (historias 1, 91–93)

**What to build:** el operador gestiona invitaciones y vigila la salud operativa: Emisores con estado de Representación, recuento de facturas y alertas de Registros atascados o rechazados, sin acceso a facturas ni Destinatarios.

**Blocked by:** 06; 11; `design.html`

**Status:** ready-for-agent

- [ ] Rol operador separado del de Usuario
- [ ] Crear y revocar invitaciones desde la UI
- [ ] Listado de Emisores: nombre, NIF, estado de Representación, nº de facturas, incidencias abiertas
- [ ] Alertas de Registros Sin confirmar o Rechazados
- [ ] Ningún endpoint del operador devuelve facturas, líneas ni Destinatarios (test)

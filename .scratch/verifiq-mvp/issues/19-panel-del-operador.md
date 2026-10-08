# 19: Panel del operador

Spec: `../spec.md` (historias 1, 91–93)

**What to build:** el operador gestiona invitaciones y vigila la salud operativa: Emisores con estado de Representación, recuento de facturas y alertas de Registros atascados o rechazados, sin acceso a facturas ni Destinatarios.

**Blocked by:** 06; 11; `design.html`

**Status:** done

- [x] Rol operador separado del de Usuario
- [x] Crear y revocar invitaciones desde la UI
- [x] Listado de Emisores: nombre, NIF, estado de Representación, nº de facturas, incidencias abiertas
- [x] Alertas de Registros Sin confirmar o Rechazados
- [x] Ningún endpoint del operador devuelve facturas, líneas ni Destinatarios (test)

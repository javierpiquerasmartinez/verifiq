# 14: Listado de facturas

Spec: `../spec.md` (historias 81–84, 86)

**What to build:** la pantalla principal: todas las facturas y Borradores ordenados por fecha, con búsqueda, filtros por estado e incidencias destacadas arriba.

**Blocked by:** 11; `design.html`

**Status:** ready-for-agent

- [ ] Columnas: número, fecha, Destinatario, Importe total, Total a pagar, estado
- [ ] Búsqueda por número, Destinatario o importe
- [ ] Filtros: Borradores, Pendientes, Aceptadas, Con incidencias, Rectificadas, Anuladas
- [ ] Incidencias (Bloqueado, Rechazado, Aceptado con errores, Sin confirmar, Representación sin firmar) destacadas arriba con llamada a la acción
- [ ] Estado vacío con acceso a "Nueva factura"
- [ ] Paginación en servidor; tests de API de filtros y búsqueda

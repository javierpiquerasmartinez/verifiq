# 14: Listado de facturas

Spec: `../spec.md` (historias 81–84, 86)

**What to build:** la pantalla principal: todas las facturas y Borradores ordenados por fecha, con búsqueda, filtros por estado e incidencias destacadas arriba.

**Blocked by:** 11; `design.html`

**Status:** ready-for-agent

- [ ] Columnas: número, fecha, Destinatario, Importe total, Total a pagar, estado
- [ ] Búsqueda por número, Destinatario o importe
- [ ] Filtros: Borradores, Pendientes, Aceptadas, Con incidencias, Rectificadas, Anuladas
- [ ] Incidencias (Bloqueado, Rechazado, Aceptado con errores, Sin confirmar, Representación sin firmar) destacadas arriba con llamada a la acción
- [ ] Pulsar en cualquier parte de la fila abre el Borrador (su editor, `/drafts/:id`) o la factura emitida (su detalle), no solo un enlace en una columna; también con teclado
- [ ] Estado vacío con acceso a "Nueva factura"
- [ ] Sustituye la lista provisional de Borradores de la pantalla «Facturas» (issue 08)
- [ ] Paginación en servidor; tests de API de filtros y búsqueda

# 14: Listado de facturas

Spec: `../spec.md` (historias 81–84, 86)

**What to build:** la pantalla principal: todas las facturas y Borradores ordenados por fecha, con búsqueda, filtros por estado e incidencias destacadas arriba.

**Blocked by:** 11; `design.html`

**Status:** ready-for-agent

- [x] Columnas: número, fecha, Destinatario, Importe total, Total a pagar, estado
- [x] Búsqueda por número, Destinatario o importe
- [x] Filtros: Borradores, Pendientes, Aceptadas, Con incidencias, Rectificadas, Anuladas
- [x] Incidencias (Bloqueado, Rechazado, Aceptado con errores, Sin confirmar, Representación sin firmar) destacadas arriba con llamada a la acción
- [x] Pulsar en cualquier parte de la fila abre el Borrador (su editor, `/drafts/:id`) o la factura emitida (su detalle), no solo un enlace en una columna; también con teclado
- [x] Estado vacío con acceso a "Nueva factura"
- [x] Sustituye la lista provisional de Borradores de la pantalla «Facturas» (issue 08)
- [x] Paginación en servidor; tests de API de filtros y búsqueda

## Comments

- (implementación) `GET /invoices` devuelve Borradores y facturas juntos, de más reciente a más antiguo (el Borrador por su última edición, la factura por su Emisión), con paginación por cursor («Cargar más», como en `design.html`) y el recuento de cada filtro con la búsqueda aplicada. Las facturas se buscan, filtran y paginan en la base de datos; los Borradores, pocos y cuyos importes solo calcula el dominio, en memoria. Cada factura cae en un único filtro: Anulada, Rectificada, Con incidencias (Registro Bloqueado, Rechazado, Aceptado con errores o sin confirmar >24 h), Pendiente o Aceptada. `GET /invoices/incidents` alimenta la tarjeta de incidencias; su llamada a la acción lleva al detalle de la factura, donde la issue 13 pondrá «Corregir y reintentar» / «Corregir y reenviar» / «Subsanar». «Representación sin firmar» ya la avisa el banner fijo de la cabecera (`AppShell`). Los estados de factura `rectified` y `voided` se añaden al dominio para el filtro; los pondrán las issues 15 y 16.

# 13: Incidencias del Registro

Spec: `../spec.md` (historias 60, 62, 63)

**What to build:** cuando el envío falla, el Usuario entiende por qué y lo resuelve: un Registro Bloqueado (error de validación síncrono) se corrige y reintenta con el mismo número; uno Rechazado por la AEAT se corrige y reenvía como Subsanación; uno Aceptado con errores ofrece Subsanar o Rectificar.

**Blocked by:** 11; `design.html`

**Status:** done

- [x] Bloqueado: mensaje claro traducido del código; "Corregir y reintentar" permite editar los datos de la copia y reenviar con el mismo número; nunca se libera el número
- [x] Rechazado: motivo AEAT visible; "Corregir y reenviar" envía Subsanación con rechazo previo
- [x] Aceptado con errores: opciones Subsanar o Rectificar (enlaza al flujo del ticket 15 cuando exista)
- [x] Auditoría de cada corrección y reenvío
- [x] Tests de API con el fake para los tres casos

## Comments

- (implementación, PR #27) Un solo endpoint, `POST /invoices/:id/resubmission` (Reenvío → `Resubmission`, añadido al glosario), cubre los tres casos; cada Reenvío crea un Registro nuevo con su propia copia de la factura y clave de idempotencia, y genera una versión nueva del PDF cuando tiene QR.
- Qué se corrige: Bloqueado o Rechazado, los datos del Destinatario (se releen de su ficha, donde el Usuario los corrige; su NIF debe estar confirmado en el censo) y la Descripción de la operación. Aceptado con errores, solo la descripción: la factura ya existe en la AEAT y un error del Destinatario, importes o IVA se corrige con rectificativa (decisión del Usuario, research §10). El trigger de la base de datos lo impone.
- Bloqueado se reintenta como se envió (alta o Subsanación) y, si es un alta, solo el día de su fecha de expedición (la AEAT exige que un alta nueva sea de hoy). Pasado ese día la API lo rechaza y la interfaz explica que hay que anularla y emitir una nueva: ese flujo es de la issue 16.
- `rechazo_previo`: Rechazado → `record` (X), salvo tras una Subsanación rechazada de una factura que llegó a la AEAT → `amendment` (S); Aceptado con errores → `none` (N).
- Los códigos de rechazo síncrono son ahora códigos estables del dominio (`RECORD_REJECTION_CODES`), traducidos desde los de Verifacti en el adaptador y explicados en lenguaje llano; un código desconocido muestra el mensaje del conector.
- "Rectificar" en Aceptado con errores se muestra desactivado hasta la issue 15.
- Sin verificar en navegador ni contra el sandbox de Verifacti (la Subsanación real con `PUT /modify` no se ha probado nunca).

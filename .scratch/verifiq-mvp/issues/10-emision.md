# 10: Emisión (flujo feliz)

Spec: `../spec.md` (historias 53–59, 65, 94) · ADR 0001, 0002

**What to build:** el Usuario pulsa Emitir, confirma, y la factura recibe su número correlativo, queda congelada y se envía a VeriFactu a través del outbox y el worker. En segundos ve el QR y el detalle de la factura emitida con su estado de Factura y de Registro.

**Blocked by:** 05; 06; 08; `design.html`

**Status:** ready-for-agent

- [x] Confirmación con Destinatario, Total a pagar, número a asignar y aviso de irreversibilidad
- [x] Precondiciones: Representación correcta, Destinatario validado, Borrador válido
- [x] Una transacción: bloqueo de la Serie, siguiente número, copia congelada (Emisor, Destinatario, líneas, desglose), Registro `pendiente_envio`, trabajo encolado (pg-boss)
- [x] Emisiones concurrentes en la misma Serie: sin huecos ni duplicados (test)
- [x] Worker en servicio separado: envía con clave de idempotencia, guarda huella, QR, URL y respuesta; reintenta errores transitorios con backoff sin duplicar (test)
- [x] Factura `emitida`; Registro `enviado` tras el 200
- [x] Detalle de la factura emitida: número, fecha, Destinatario, Total a pagar, ambos estados, QR
- [x] Auditoría append-only de la Emisión (quién, cuándo, qué)
- [x] La copia congelada no admite modificaciones salvo las previstas en la spec

## Comments

- (issue 07) Un Destinatario puede quedar guardado con `censusStatus: 'unchecked'` cuando el censo no respondió al guardarlo. La precondición «Destinatario validado» debe bloquear la Emisión para esos Destinatarios (o volver a consultar el censo antes de emitir); la ficha del cliente ya avisa de que no se le podrá facturar hasta comprobarlo. La tabla `invoices` existe solo con `issuer_id` y `recipient_id` (FK `restrict`, que impide borrar Destinatarios con facturas): esta issue la completa.
- (issue 08) Los Borradores viven en su propia tabla `drafts`. La precondición «Borrador válido» es que `findDraftProblems` (dominio) no devuelva nada para la fecha de expedición: ya cubre cliente ausente, archivado o sin comprobar en el censo, periodo que aún no ha terminado, descripción vacía, sin líneas y líneas sin concepto. La respuesta de `GET /drafts/:id` ya trae `problems` y el `breakdown` calculado en servidor. El editor deja hueco para el botón Emitir en la columna del resumen.

- (implementación) `POST /invoices { draftId }` emite y borra el Borrador en la misma transacción; `GET /invoices/:id` y `GET /invoices/next-number`. Estados en código: Factura `issued`; Registro `pending-submission` → `submitted`, y `blocked` con `rejection` si el conector rechaza en síncrono (la UI de corregir y reintentar es de la issue 13). El trigger `freeze_issued_invoice` congela `snapshot` sin excepciones y `freeze_record_evidence` congela clave, huella, QR y URL: la 13 tendrá que relajarlos para corregir en `bloqueado`/`rechazado`. Tras `retryLimit` (≈1 día) el trabajo de pg-boss muere y el Registro queda `pending-submission`: lo debe vigilar el aviso de >24 h de la issue 11. Sin `VERIFACTI_API_KEY` la API ejecuta el worker en su propio proceso (el fake vive en memoria).
- (revisión con `design.html`) La issue se hizo sin el diseño; ajustes posteriores: candado en «Emitir factura» (editor, `btn-lg`), en la etiqueta «No se puede deshacer», en el aviso y en el botón de la confirmación; «Enviando…» con el icono giratorio y solo la píldora AEAT; «emitida» con «El PDF ya es válido…» y pie «Ver factura» + «Descargar PDF»; píldoras AEAT con icono. El detalle sigue el diseño: «Descargar PDF» en la cabecera, Cliente enlazado a su ficha (`recipientId` en `GET /invoices/:id`), tarjeta «Documento» con el PDF almacenado y tarjeta «Registro en la AEAT» (de momento solo Estado). Quedan para otras issues: Historial y los campos Confirmado / Código de registro (11), detalle de Registro rechazado (13), menú «Corregir» y aviso de rectificativa (15–17).

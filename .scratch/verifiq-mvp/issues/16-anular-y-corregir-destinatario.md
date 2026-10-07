# 16: Anular y Corregir destinatario

Spec: `../spec.md` (historias 76, 78–80) · ADR 0005

**What to build:** el Usuario puede Anular una factura que nunca debió existir (confirmación reforzada, número quemado) y corregir un Destinatario equivocado con un flujo de una pregunta que termina en un Borrador nuevo precargado.

**Blocked by:** 15; `design.html`

**Status:** done

- [x] Anular: acción de peligro, confirmación escribiendo el número, texto explicativo; envía registro de Anulación; factura Anulada, solo lectura, atenuada
- [x] El número anulado nunca se reutiliza (test)
- [x] Corregir destinatario: "¿Has enviado ya esta factura?" No → Anulación; Sí → rectificativa total R4; en ambos casos Borrador nuevo precargado con otro Destinatario
- [x] Prohibido combinar Anulación y rectificativa sobre la misma factura (test en ambos sentidos)
- [x] Auditoría de ambas acciones

## Comments

- (issue 13) Un Registro bloqueado (alta rechazada de forma síncrona) solo se puede reintentar el día de su fecha de expedición; pasado ese día la API responde `INVOICE_RETRY_DAY_OVER` y la interfaz dice que hay que anularla y emitir una nueva, sin acción. Esta issue debería ofrecer ahí «Anular y volver a emitir»: Anulación con `sin_registro_previo` (`VoidingSubmission.notRegistered`) y Borrador nuevo precargado.
- (issue 15) «Rectificar totalmente» ya existe: `POST /invoices/:id/corrective-draft` con `total: true` (motivo `amounts_or_data_error` → R4) da el Borrador con las líneas negadas. Al anular, hay que rechazar una factura con rectificativas (`invoices.corrected_invoice_id` apunta a ella) o con un Borrador de rectificativa abierto; `isRectifiable` ya rechaza las anuladas. El menú «Corregir» de `apps/web/src/pages/Invoice.tsx` espera sus entradas «Corregir destinatario» y «Anular».

- (implementación) `POST /invoices/:id/voiding` (`{ reissue? }`) anula: la factura pasa a Anulada al instante y se encola un InvoiceRecord nuevo con `operation = 'voiding'` (sin QR, conserva el PDF de la factura). Con `reissue`, en la misma transacción, un Borrador nuevo con su contenido y su Destinatario («Anular y volver a emitir», en la incidencia de un bloqueo pasado su día). Sobre una factura Anulada cuya Anulación quedó bloqueada o rechazada, el mismo endpoint la reenvía (auditado como `invoice-record-resubmitted`, `operation: 'voiding'`); hasta entonces aparece en Incidencias.
- `POST /invoices/:id/recipient-correction` (`{ sent }`), en una sola transacción: No enviada → Anulación; Enviada → emite ya la rectificativa total R4 (motivo `amounts_or_data_error`, nota «Destinatario equivocado: …»). En ambos casos, Borrador nuevo con el contenido y sin Destinatario. Auditado como `invoice-recipient-corrected` (más `invoice-voided` o `invoice-rectified`).
- Flags de la Anulación, calculados al enviarla desde los registros anteriores (`voidingFlagsOf`): `sin_registro_previo` si la AEAT nunca aceptó un alta de la factura; `rechazo_previo` si rechazó la última Anulación que recibió (una bloqueada no llegó). Una Anulación aceptada (`Anulado`) deja el registro en Aceptada.
- Se anula (`isVoidable`) una factura Emitida, no rectificativa, sin Borrador de rectificativa abierto y con veredicto (aceptada, con errores, rechazada o bloqueada). Crear un Borrador de rectificativa ahora bloquea la factura, así que no compite con una Anulación.
- La confirmación escribiendo el número es solo de la interfaz. «Corregir destinatario» solo aparece si caben las dos respuestas (la AEAT tiene la factura y se puede anular).
- Pendiente: una factura rechazada o bloqueada que nunca llegó al cliente no ofrece «Corregir destinatario» (solo Anular, o reenviarla corregida). Una rectificativa no se puede anular. Si el alta acabó en `duplicate`, se trata como no registrada (`sin_registro_previo = S`); revisar con un caso real. Los criterios siguen pendientes de validar con el asesor fiscal (ADR 0005).
- Probado en navegador contra una copia de la base local con el conector falso; no contra el sandbox de Verifacti.

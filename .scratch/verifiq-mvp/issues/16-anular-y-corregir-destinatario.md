# 16: Anular y Corregir destinatario

Spec: `../spec.md` (historias 76, 78–80) · ADR 0005

**What to build:** el Usuario puede Anular una factura que nunca debió existir (confirmación reforzada, número quemado) y corregir un Destinatario equivocado con un flujo de una pregunta que termina en un Borrador nuevo precargado.

**Blocked by:** 15; `design.html`

**Status:** ready-for-agent

- [ ] Anular: acción de peligro, confirmación escribiendo el número, texto explicativo; envía registro de Anulación; factura Anulada, solo lectura, atenuada
- [ ] El número anulado nunca se reutiliza (test)
- [ ] Corregir destinatario: "¿Has enviado ya esta factura?" No → Anulación; Sí → rectificativa total R4; en ambos casos Borrador nuevo precargado con otro Destinatario
- [ ] Prohibido combinar Anulación y rectificativa sobre la misma factura (test en ambos sentidos)
- [ ] Auditoría de ambas acciones

## Comments

- (issue 13) Un Registro bloqueado (alta rechazada de forma síncrona) solo se puede reintentar el día de su fecha de expedición; pasado ese día la API responde `INVOICE_RETRY_DAY_OVER` y la interfaz dice que hay que anularla y emitir una nueva, sin acción. Esta issue debería ofrecer ahí «Anular y volver a emitir»: Anulación con `sin_registro_previo` (`VoidingSubmission.notRegistered`) y Borrador nuevo precargado.
- (issue 15) «Rectificar totalmente» ya existe: `POST /invoices/:id/corrective-draft` con `total: true` (motivo `amounts_or_data_error` → R4) da el Borrador con las líneas negadas. Al anular, hay que rechazar una factura con rectificativas (`invoices.corrected_invoice_id` apunta a ella) o con un Borrador de rectificativa abierto; `isRectifiable` ya rechaza las anuladas. El menú «Corregir» de `apps/web/src/pages/Invoice.tsx` espera sus entradas «Corregir destinatario» y «Anular».

# 10: Emisión (flujo feliz)

Spec: `../spec.md` (historias 53–59, 65, 94) · ADR 0001, 0002

**What to build:** el Usuario pulsa Emitir, confirma, y la factura recibe su número correlativo, queda congelada y se envía a VeriFactu a través del outbox y el worker. En segundos ve el QR y el detalle de la factura emitida con su estado de Factura y de Registro.

**Blocked by:** 05; 06; 08; `design.html`

**Status:** ready-for-agent

- [ ] Confirmación con Destinatario, Total a pagar, número a asignar y aviso de irreversibilidad
- [ ] Precondiciones: Representación correcta, Destinatario validado, Borrador válido
- [ ] Una transacción: bloqueo de la Serie, siguiente número, copia congelada (Emisor, Destinatario, líneas, desglose), Registro `pendiente_envio`, trabajo encolado (pg-boss)
- [ ] Emisiones concurrentes en la misma Serie: sin huecos ni duplicados (test)
- [ ] Worker en servicio separado: envía con clave de idempotencia, guarda huella, QR, URL y respuesta; reintenta errores transitorios con backoff sin duplicar (test)
- [ ] Factura `emitida`; Registro `enviado` tras el 200
- [ ] Detalle de la factura emitida: número, fecha, Destinatario, Total a pagar, ambos estados, QR
- [ ] Auditoría append-only de la Emisión (quién, cuándo, qué)
- [ ] La copia congelada no admite modificaciones salvo las previstas en la spec

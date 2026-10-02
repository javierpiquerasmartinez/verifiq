# 11: Confirmación de la AEAT

Spec: `../spec.md` (historias 61, 64, 70)

**What to build:** el resultado de Hacienda llega solo: un webhook firmado actualiza el Registro a Aceptado, Aceptado con errores o Rechazado, con una consulta periódica de respaldo. Los Registros sin confirmar más de 24 h avisan al Usuario y alertan al operador. El detalle muestra una línea de tiempo de eventos.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] Endpoint de webhook: verifica HMAC-SHA256, rechaza firmas inválidas, deduplica por id de webhook, responde en <10 s
- [ ] Tarea cada 15 min consulta el estado de Registros enviados hace >10 min
- [ ] Estados Aceptado, Aceptado con errores (con mensaje), Rechazado (con motivo AEAT)
- [ ] >24 h sin confirmar: aviso visible al Usuario y alerta (email) al operador
- [ ] Línea de tiempo de eventos de la factura con fecha, hora y actor
- [ ] Tests de API con el fake: cada resultado, webhook duplicado, firma inválida, respaldo por sondeo

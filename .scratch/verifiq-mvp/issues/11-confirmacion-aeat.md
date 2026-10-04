# 11: Confirmación de la AEAT

Spec: `../spec.md` (historias 61, 64, 70)

**What to build:** el resultado de Hacienda llega solo: un webhook firmado actualiza el Registro a Aceptado, Aceptado con errores o Rechazado, con una consulta periódica de respaldo. Los Registros sin confirmar más de 24 h avisan al Usuario y alertan al operador. El detalle muestra una línea de tiempo de eventos.

**Blocked by:** 10

**Status:** ready-for-agent

- [x] Endpoint de webhook: verifica HMAC-SHA256, rechaza firmas inválidas, deduplica por id de webhook, responde en <10 s
- [x] Tarea cada 15 min consulta el estado de Registros enviados hace >10 min
- [x] Estados Aceptado, Aceptado con errores (con mensaje), Rechazado (con motivo AEAT)
- [x] >24 h sin confirmar: aviso visible al Usuario y alerta (email) al operador
- [x] Línea de tiempo de eventos de la factura con fecha, hora y actor
- [x] Tests de API con el fake: cada resultado, webhook duplicado, firma inválida, respaldo por sondeo

## Comments

- (revisión de la 10 con `design.html`) En el detalle de la factura, la línea de tiempo es la tarjeta «Historial» del lateral (por encima de «Registro en la AEAT»), con fecha · hora · actor («Sistema» si actuó el sistema) y punto verde para Aceptada. La tarjeta «Registro en la AEAT» ya existe con Estado; esta issue añade «Confirmado» (fecha y hora) y «Código de registro» (CSV de la AEAT).
- (implementación) Verifacti no documenta la forma del cuerpo del webhook más allá de «array con la forma de `GET /status`», que no trae `uuid`: el adaptador identifica cada resultado por NIF del Emisor + serie + número + fecha de expedición y se aplica al Registro `enviado` de esa factura. Tampoco documenta que pase el CSV de la AEAT, así que «Código de registro» solo aparece si el conector lo da (hoy, el fake). Falta enlazar cada NIF nuevo al webhook en Verifacti (`POST /webhooks/{id}/nifs/{nif}` al dar de alta al Emisor); mientras tanto, el sondeo cada 15 min trae los veredictos. `Duplicado` se trata como Rechazado. Las acciones sobre Aceptada con errores / Rechazada (Subsanar, Rectificar) quedan para la issue 13.

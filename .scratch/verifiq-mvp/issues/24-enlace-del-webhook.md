# 24: Enlazar cada Emisor al webhook de resultados

Spec: `../spec.md` (historia 61) · issue 11 · ADR 0001

**What to build:** cada NIF que la app da de alta en Verifacti queda enlazado al webhook de resultados, sin pasos a mano. Hoy el webhook se registra una vez por entorno (`POST /webhooks`, al desplegar), pero los NIF nuevos no se le asocian: los veredictos de la AEAT de esos Emisores solo llegan por el sondeo cada 15 min. Lo dejó anotado la issue 11.

**Blocked by:** 11

**Status:** ready-for-agent

- [x] `VERIFACTI_WEBHOOK_ID` (el `id` que devolvió `POST /webhooks`) configura el webhook; exige `VERIFACTI_WEBHOOK_SECRET` (sin secreto cada entrega da 401 y Verifacti acaba desactivando el webhook)
- [x] Al dar de alta el Emisor, `POST /nifs` lleva `webhooks: [VERIFACTI_WEBHOOK_ID]`
- [x] Si el NIF ya existía (409), se enlaza con `POST /webhooks/{id}/nifs/{nif}`; si eso falla, el alta no se da por hecha y se reintenta como cualquier fallo del conector
- [x] Sin `VERIFACTI_WEBHOOK_ID` todo sigue como hoy
- [x] Tests del adaptador con el stub de Verifacti

## Comments

- (despliegue del worker, 2026-10-07) Webhook de staging registrado a mano: entorno `test`, enlazado al NIF del único Emisor de staging. Su `id` va en `VERIFACTI_WEBHOOK_ID` de `verifiq-api-staging`.

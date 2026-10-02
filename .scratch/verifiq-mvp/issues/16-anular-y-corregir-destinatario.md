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

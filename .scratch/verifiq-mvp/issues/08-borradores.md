# 08: Borradores

Spec: `../spec.md` (historias 38–52) · ADR 0002

**What to build:** el Usuario crea, edita, previsualiza y borra Borradores sin número: Destinatario (con alta en línea), varias líneas con IVA por línea (incluida Exenta con Supuesto), Retención de IRPF por factura, Periodo facturado que rellena la Descripción de la operación, y un resumen en vivo calculado con el dominio de importes.

**Blocked by:** 04; 07; `design.html`

**Status:** ready-for-agent

- [ ] Borrador sin número; guardar, editar y borrar libremente
- [ ] Selector de Destinatario con búsqueda y alta en línea
- [ ] Líneas: concepto, cantidad, precio, descuento %, IVA (21/10/4/0/Exenta + supuesto), importe; valores por defecto del Emisor
- [ ] Retención de IRPF por factura (15/7/sin), por defecto la del Emisor
- [ ] Periodo facturado opcional → fecha de operación = último día; Descripción de la operación prerellenada y editable, con aviso de no incluir datos de pacientes
- [ ] Resumen en vivo: bases por tipo, cuotas, exentas con mención, Importe total, retención, Total a pagar (destacado)
- [ ] La API recalcula con el mismo dominio y rechaza incoherencias; validación en línea
- [ ] Fecha de expedición = hoy, no editable
- [ ] Vista previa HTML del borrador
- [ ] Tests de API: CRUD, validaciones, cálculo coincide con el dominio

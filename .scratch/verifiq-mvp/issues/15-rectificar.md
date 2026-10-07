# 15: Rectificar

Spec: `../spec.md` (historias 71–75) · ADR 0005 · `docs/research/rectificativas-y-fechas.md`

**What to build:** desde una factura emitida, el Usuario elige un motivo en lenguaje llano y un texto libre, y obtiene un Borrador de Factura rectificativa por diferencias en la Serie R enlazado a la original, que emite como cualquier factura. Atajo "Rectificar totalmente".

**Blocked by:** 11; 12; `design.html`

**Status:** ready-for-agent

- [ ] Motivos en lenguaje llano → R1/R4 según la tabla del dominio
- [ ] Borrador en Serie R, enlazado a la original, con fecha de operación de la original; importes negativos permitidos
- [ ] "Rectificar totalmente" precarga todas las líneas en negativo
- [ ] Emisión como rectificativa por diferencias con referencia a la factura rectificada
- [ ] PDF de rectificativa con número y fecha de la rectificada y motivo
- [ ] Factura original pasa a Rectificada; enlaces cruzados en ambos detalles
- [ ] Tests de API: cada motivo → tipo correcto, rectificar totalmente, numeración en Serie R

## Comments

- (issue 13) En el detalle de una factura Aceptada con errores, el panel de incidencia muestra un botón «Rectificar» desactivado (`apps/web/src/ui/RecordIncident.tsx`): esta issue debe activarlo y llevarlo al flujo de rectificación. Es la vía para corregir errores del Destinatario, importes o IVA de una factura que ya existe en la AEAT.

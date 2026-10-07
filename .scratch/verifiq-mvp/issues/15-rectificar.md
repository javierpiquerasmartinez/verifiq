# 15: Rectificar

Spec: `../spec.md` (historias 71–75) · ADR 0005 · `docs/research/rectificativas-y-fechas.md`

**What to build:** desde una factura emitida, el Usuario elige un motivo en lenguaje llano y un texto libre, y obtiene un Borrador de Factura rectificativa por diferencias en la Serie R enlazado a la original, que emite como cualquier factura. Atajo "Rectificar totalmente".

**Blocked by:** 11; 12; `design.html`

**Status:** done

- [x] Motivos en lenguaje llano → R1/R4 según la tabla del dominio
- [x] Borrador en Serie R, enlazado a la original, con fecha de operación de la original; importes negativos permitidos
- [x] "Rectificar totalmente" precarga todas las líneas en negativo
- [x] Emisión como rectificativa por diferencias con referencia a la factura rectificada
- [x] PDF de rectificativa con número y fecha de la rectificada y motivo
- [x] Factura original pasa a Rectificada; enlaces cruzados en ambos detalles
- [x] Tests de API: cada motivo → tipo correcto, rectificar totalmente, numeración en Serie R

## Comments

- (issue 13) En el detalle de una factura Aceptada con errores, el panel de incidencia muestra un botón «Rectificar» desactivado (`apps/web/src/ui/RecordIncident.tsx`): esta issue debe activarlo y llevarlo al flujo de rectificación. Es la vía para corregir errores del Destinatario, importes o IVA de una factura que ya existe en la AEAT.

- (implementación) `POST /invoices/:id/corrective-draft` (`{ reason, note, total }`) crea el Borrador de rectificativa; se emite con el `POST /invoices` de siempre. El Borrador guarda la factura que corrige, el motivo y la nota (`drafts.corrected_invoice_id`, `correction_reason`, `correction_note`); la factura emitida guarda la corrección en su copia (`snapshot.correction`) y en `invoices.corrected_invoice_id`, congelado por el trigger.
- Se puede rectificar una factura que la AEAT tiene (aceptada o aceptada con errores), emitida o ya rectificada; nunca una anulada ni una rectificativa (se vuelve a rectificar la original). Se comprueba al crear el Borrador y otra vez al emitir, con la original bloqueada.
- El Borrador de rectificativa conserva el Destinatario, el Periodo facturado y la Retención de la original (la API ignora los que se envíen); solo cambian la descripción, precargada con «Rectificación de F…: …», y las líneas, que admiten negativos. Fecha de operación: la de la original, o su fecha de expedición si no tenía. Un Destinatario archivado no impide emitirla.
- La original pasa a Rectificada al emitir la rectificativa (no espera al veredicto de la AEAT). Rectificada y aceptada con errores, aún se puede Subsanar su descripción.
- Rectificar totalmente niega la cantidad de cada línea; el redondeo es simétrico, así que todos los importes salen exactamente negados.
- El diálogo del motivo no está en `design.html`: sigue el estilo de los demás. El menú «Corregir» solo tiene «Rectificar» hasta las issues 16 y 17.
- Probado en navegador contra la API local con el conector falso (con el Registro aceptado a mano en la base de datos); no contra el sandbox de Verifacti.

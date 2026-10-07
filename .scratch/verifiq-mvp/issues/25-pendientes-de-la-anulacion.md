# 25: Pendientes de la Anulación

Spec: `../spec.md` (historias 76, 78–80) · issue 16 · ADR 0005

**What to build:** cerrar tres casos que la issue 16 dejó fuera porque falta un criterio (fiscal o de producto) o información de Verifacti. Primero se investiga y se decide cada uno; luego se implementa lo que se decida.

**Blocked by:** 16

**Status:** needs-info

## 1. Anular una Factura rectificativa

Hoy no se puede: `isVoidable` rechaza las rectificativas (`packages/domain/src/voiding.ts`), y la issue y el ADR 0005 no dicen nada.

- [ ] Preguntar al asesor fiscal: una rectificativa emitida por error (por ejemplo, la R4 de «Corregir destinatario» respondiendo «Sí» por equivocación), ¿se anula o se corrige con otra rectificativa?
- [ ] Si se anula: ¿qué estado toma la factura original cuando se anula su única rectificativa? Hoy pasaría a no tener rectificativas con efecto pero seguiría Rectificada. ¿Vuelve a Emitida? ¿Y si tiene varias?
- [ ] Decidir y, si procede, implementarlo, junto con la regla de «nunca se combinan» aplicada a la original.

## 2. Marca «ANULADA» en el PDF de una factura anulada

La historia 80 pide que la factura anulada siga visible, en solo lectura y atenuada en la app, y así está. Pero su PDF, con el QR, se sigue mostrando y descargando sin ninguna marca, así que alguien podría entregarle al cliente una factura que parece válida.

- [ ] Decidir el producto: ¿marca en el PDF o solo en la app? ¿Se puede seguir descargando?
- [ ] Si va en el PDF: las versiones del PDF son inmutables (`invoice_pdfs`, migración 0009). ¿Versión nueva con la marca, que conserva la anterior (como «Corregir retención», issue 17)? ¿O una marca superpuesta solo en la web y en la descarga, sin tocar el fichero guardado?
- [ ] Preguntar al asesor si la factura anulada debe conservarse o entregarse con alguna mención concreta.

## 3. Anulación de una factura cuya alta acabó en `duplicate`

`record-verdicts.ts` traduce el estado `Duplicado` de Verifacti a `rejected`. Al anular, `voidingFlagsOf` la considera nunca registrada y envía `sin_registro_previo = S`. Pero `Duplicado` significa que la AEAT ya tenía un registro con la misma serie, número y fecha: puede ser de esta misma factura (un reintento que sí llegó) o de otro sistema.

- [ ] Investigar con la documentación o el soporte de Verifacti (y con un caso en el sandbox) qué hay en la AEAT tras un `Duplicado`, y qué `sin_registro_previo` y `rechazo_previo` espera una Anulación en ese caso.
- [ ] Ajustar `voidingFlagsOf`, o el veredicto `duplicate`, según lo que salga, con su test.

## Comments

# Corrección de facturas emitidas: rectificativa por diferencias, Anulación solo si no se entregó

Una factura emitida nunca se borra ni se edita. Toda corrección de contenido es una Factura rectificativa por diferencias (R1 o R4, derivado de un motivo en lenguaje llano), en Serie propia; no soportamos rectificativas por sustitución. La Anulación queda reservada a facturas que nunca debieron existir y, para un Destinatario equivocado, solo si la factura no llegó a entregarse; si ya se entregó, rectificativa total R4. Nunca se combinan Anulación y rectificativa sobre la misma factura.

## Consequences

- Única excepción a la inmutabilidad: un error solo en la Retención de IRPF (que no forma parte del Registro de facturación) se corrige generando una nueva versión del PDF con el mismo número, conservando la anterior y auditando el cambio (DGT V1269-25).
- La tabla motivo → R1/R4 y el criterio de Anulación por no entrega están pendientes de validación por un asesor fiscal.

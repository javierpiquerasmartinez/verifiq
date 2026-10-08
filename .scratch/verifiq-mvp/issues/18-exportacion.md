# 18: Exportación

Spec: `../spec.md` (historia 85)

**What to build:** el Usuario descarga todas sus facturas en un ZIP con los PDF vigentes y un CSV resumen.

**Blocked by:** 12; `design.html`

**Status:** done

- [x] ZIP con el PDF vigente de cada factura emitida y un CSV (número, fecha, Destinatario, NIF, bases, cuotas, Importe total, retención, Total a pagar, estados)
- [x] Generación sin bloquear la API para volúmenes grandes (trabajo en worker si hace falta)
- [x] Solo datos del Emisor de la sesión (test)

## Comments

**2026-10-07 (agente, desde la issue 17):** tras «Corregir retención» una factura puede tener varias versiones de PDF (las anteriores siguen descargables con `?version=N`).
- «PDF vigente» es la última versión: `InvoicePdfsService.file(issuerId, invoiceId)` sin `version`, nunca la versión 1.
- En el CSV, la retención y el Total a pagar salen de la copia actual de la factura (`invoices.snapshot`), que ya refleja la corrección; no de la copia de su Registro (`invoice_records.snapshot`), que conserva la que se envió.

**2026-10-08 (agente):** hecho en `feat/export`. `GET /invoices/export` da un ZIP en streaming: `facturas.csv` y `<número>.pdf` con la última versión de cada factura que tenga PDF (las bloqueadas solo salen en el CSV). No hace falta worker: no se genera nada, se leen los PDF almacenados de uno en uno y se espera a que el cliente los consuma, así que una exportación grande ocupa un PDF en memoria. El CSV (UTF-8 con BOM, `;`, coma decimal) lleva bases y cuotas por tipo de IVA, base exenta, la factura que rectifica y los estados de la factura y de su último Registro. En la web, botón «Exportar todo» en Facturas. Límite: fflate no escribe ZIP64 (≥ 4 GB o ≥ 65 535 ficheros).

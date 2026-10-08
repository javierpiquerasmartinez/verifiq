# 18: Exportación

Spec: `../spec.md` (historia 85)

**What to build:** el Usuario descarga todas sus facturas en un ZIP con los PDF vigentes y un CSV resumen.

**Blocked by:** 12; `design.html`

**Status:** ready-for-agent

- [ ] ZIP con el PDF vigente de cada factura emitida y un CSV (número, fecha, Destinatario, NIF, bases, cuotas, Importe total, retención, Total a pagar, estados)
- [ ] Generación sin bloquear la API para volúmenes grandes (trabajo en worker si hace falta)
- [ ] Solo datos del Emisor de la sesión (test)

## Comments

**2026-10-07 (agente, desde la issue 17):** tras «Corregir retención» una factura puede tener varias versiones de PDF (las anteriores siguen descargables con `?version=N`).
- «PDF vigente» es la última versión: `InvoicePdfsService.file(issuerId, invoiceId)` sin `version`, nunca la versión 1.
- En el CSV, la retención y el Total a pagar salen de la copia actual de la factura (`invoices.snapshot`), que ya refleja la corrección; no de la copia de su Registro (`invoice_records.snapshot`), que conserva la que se envió.

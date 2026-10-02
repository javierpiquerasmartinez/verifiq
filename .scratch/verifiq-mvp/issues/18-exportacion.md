# 18: Exportación

Spec: `../spec.md` (historia 85)

**What to build:** el Usuario descarga todas sus facturas en un ZIP con los PDF vigentes y un CSV resumen.

**Blocked by:** 12; `design.html`

**Status:** ready-for-agent

- [ ] ZIP con el PDF vigente de cada factura emitida y un CSV (número, fecha, Destinatario, NIF, bases, cuotas, Importe total, retención, Total a pagar, estados)
- [ ] Generación sin bloquear la API para volúmenes grandes (trabajo en worker si hace falta)
- [ ] Solo datos del Emisor de la sesión (test)

# 17: Corregir retención

Spec: `../spec.md` (historia 77) · ADR 0005

**What to build:** si solo la Retención de IRPF era incorrecta, el Usuario la cambia en la factura emitida y obtiene una nueva versión del PDF con el mismo número, sin nuevo Registro; la versión anterior queda en el historial.

**Blocked by:** 12; `design.html`

**Status:** done

- [x] Solo modifica el % de IRPF; recalcula Total a pagar; no toca el Registro de facturación
- [x] Nueva versión de PDF almacenada; las anteriores siguen accesibles en el historial
- [x] Evento en la línea de tiempo y auditoría
- [x] Tests de API: ningún envío al conector, versionado correcto

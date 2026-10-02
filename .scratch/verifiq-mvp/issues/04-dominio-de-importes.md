# 04: Dominio de importes e identificadores

Spec: `../spec.md` (historias 42, 47, 48, 72) · `docs/research/dentista.md`, `docs/research/rectificativas-y-fechas.md`

**What to build:** el paquete compartido de lógica pura que web y api usarán como fuente única de verdad para importes y reglas fiscales. Prefactor desarrollado con TDD.

**Blocked by:** 01

**Status:** done

- [x] Cálculo de desglose: dadas líneas (cantidad hasta 2 decimales, precio hasta 4, descuento %, tratamiento de IVA) y Retención de IRPF, devuelve bases por tipo, cuotas, bases exentas por Supuesto de exención, Importe total, retención y Total a pagar
- [x] Aritmética decimal exacta (nunca float); base de línea a 2 decimales; cuota por tipo sobre la suma de bases del tipo, half-up a 2 decimales; IRPF sobre la base total
- [x] Soporta importes negativos (rectificativas por diferencias)
- [x] Validación de NIF, NIE y CIF españoles (formato y dígito de control)
- [x] Catálogo cerrado de Supuestos de exención con su mención legal (al menos odontología, art. 20.Uno.5º LIVA), codificados como E1
- [x] Tabla motivo de rectificación → R1/R4 según la spec, aislada como configuración
- [x] Schemas zod compartidos para las entradas
- [x] Tests con tablas de casos exhaustivas (redondeos límite, varios tipos, exentas, descuentos, 15/7/0 %, negativos)

## Comments

**2026-10-02 (agente):** cierre. Implementado en `packages/domain` con TDD (106 tests).
- `computeBreakdown` (`amounts.ts`): aritmética exacta con `big.js` e importes como strings. Redondeo half-up alejándose de cero, así que negar todas las líneas niega todos los importes (rectificativa total exacta) y nunca sale `-0.00`. Cada base exenta lleva su mención legal.
- `parseTaxId` / `taxIdSchema` (`tax-id.ts`): NIF (incluidos K/L/M), NIE y CIF; normaliza mayúsculas, espacios, puntos y guiones.
- `exemptions.ts`: catálogo cerrado, de momento solo odontología (art. 20.Uno.5º), E1.
- `rectificativa.ts`: tabla motivo → R1/R4 de la spec, aislada como configuración.
- Para el asesor fiscal: la spec mapea «error al aplicar el IVA» siempre a R1, pero `docs/research/rectificativas-y-fechas.md` indica R4 si fue un despiste y no un error fundado de derecho. El código sigue la spec; si cambia, solo se toca la tabla.

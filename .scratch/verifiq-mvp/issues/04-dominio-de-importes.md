# 04: Dominio de importes e identificadores

Spec: `../spec.md` (historias 42, 47, 48, 72) · `docs/research/dentista.md`, `docs/research/rectificativas-y-fechas.md`

**What to build:** el paquete compartido de lógica pura que web y api usarán como fuente única de verdad para importes y reglas fiscales. Prefactor desarrollado con TDD.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Cálculo de desglose: dadas líneas (cantidad hasta 2 decimales, precio hasta 4, descuento %, tratamiento de IVA) y Retención de IRPF, devuelve bases por tipo, cuotas, bases exentas por Supuesto de exención, Importe total, retención y Total a pagar
- [ ] Aritmética decimal exacta (nunca float); base de línea a 2 decimales; cuota por tipo sobre la suma de bases del tipo, half-up a 2 decimales; IRPF sobre la base total
- [ ] Soporta importes negativos (rectificativas por diferencias)
- [ ] Validación de NIF, NIE y CIF españoles (formato y dígito de control)
- [ ] Catálogo cerrado de Supuestos de exención con su mención legal (al menos odontología, art. 20.Uno.5º LIVA), codificados como E1
- [ ] Tabla motivo de rectificación → R1/R4 según la spec, aislada como configuración
- [ ] Schemas zod compartidos para las entradas
- [ ] Tests con tablas de casos exhaustivas (redondeos límite, varios tipos, exentas, descuentos, 15/7/0 %, negativos)

# 03: Alta del Emisor (datos, valores por defecto, Serie y términos)

Spec: `../spec.md` (historias 13–21, 89, 98) · ADR 0004

**What to build:** tras el primer acceso, un asistente reanudable guía al Usuario por los pasos 1–4 del alta: datos fiscales del Emisor, valores por defecto (Retención de IRPF, IVA o Exenta + Supuesto de exención), prefijo de Serie (una sola vez, numeración desde 1) y aceptación de términos y contrato de encargo. El Emisor queda creado como unidad de aislamiento y su nombre y NIF se ven siempre en la cabecera.

**Blocked by:** 02; 04 (validación de NIF y Supuestos de exención); `design.html`

**Status:** ready-for-agent

- [ ] Modelo Emisor + membresía Usuario–Emisor (el MVP crea exactamente una)
- [ ] Capa común de aislamiento: toda consulta de negocio se filtra por el Emisor de la sesión; test que demuestra que un Usuario no puede leer ni modificar datos de otro Emisor
- [ ] Paso 1: nombre, NIF (validado), domicilio fiscal; opcionales email, teléfono, IBAN, logo (subido a R2)
- [ ] Paso 2: IRPF por defecto (15/7/ninguna) e IVA por defecto (21/10/4/0 o Exenta + supuesto)
- [ ] Paso 3: prefijo de Serie ordinaria y de rectificativas con año, aviso de no coincidir con series de otro software; inmutable tras confirmar
- [ ] Paso 4: aceptación de términos y contrato de encargo con versión y fecha registradas
- [ ] El asistente se puede abandonar y retomar en el mismo paso
- [ ] Cabecera con nombre y NIF del Emisor activo

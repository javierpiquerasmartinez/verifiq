# 13: Incidencias del Registro

Spec: `../spec.md` (historias 60, 62, 63)

**What to build:** cuando el envío falla, el Usuario entiende por qué y lo resuelve: un Registro Bloqueado (error de validación síncrono) se corrige y reintenta con el mismo número; uno Rechazado por la AEAT se corrige y reenvía como Subsanación; uno Aceptado con errores ofrece Subsanar o Rectificar.

**Blocked by:** 11; `design.html`

**Status:** ready-for-agent

- [ ] Bloqueado: mensaje claro traducido del código; "Corregir y reintentar" permite editar los datos de la copia y reenviar con el mismo número; nunca se libera el número
- [ ] Rechazado: motivo AEAT visible; "Corregir y reenviar" envía Subsanación con rechazo previo
- [ ] Aceptado con errores: opciones Subsanar o Rectificar (enlaza al flujo del ticket 15 cuando exista)
- [ ] Auditoría de cada corrección y reenvío
- [ ] Tests de API con el fake para los tres casos

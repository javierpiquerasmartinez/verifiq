# 09: Artículos

Spec: `../spec.md` (historias 35–37)

**What to build:** el Usuario mantiene un catálogo de Artículos y puede añadir una línea al Borrador desde un Artículo; la línea copia sus valores sin referencia viva.

**Blocked by:** 03; 08; `design.html`

**Status:** ready-for-agent

- [ ] Crear, editar, borrar Artículos: nombre, precio por defecto, IVA por defecto y Supuesto de exención
- [ ] "Añadir línea desde Artículo" en el editor de Borradores
- [ ] Editar o borrar un Artículo no altera Borradores ni facturas existentes
- [ ] Tests de API: CRUD, copia de valores, aislamiento por Emisor

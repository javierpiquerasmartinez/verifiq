# 09: Artículos

Spec: `../spec.md` (historias 35–37)

**What to build:** el Usuario mantiene un catálogo de Artículos y puede añadir una línea al Borrador desde un Artículo; la línea copia sus valores sin referencia viva.

**Blocked by:** 03; 08; `design.html`

**Status:** done

- [x] Crear, editar, borrar Artículos: nombre, precio por defecto, IVA por defecto y Supuesto de exención
- [x] "Añadir línea desde Artículo" en el editor de Borradores
- [x] Editar o borrar un Artículo no altera Borradores ni facturas existentes
- [x] Tests de API: CRUD, copia de valores, aislamiento por Emisor

## Comments

**2026-10-04 (agente):** implementado, con tests en la frontera HTTP (`test/catalog-items.test.ts`, Postgres real) y en el dominio (`catalog-item.test.ts`).
- Dominio (`packages/domain/src/catalog-item.ts`): `catalogItemDataSchema` (nombre, que será el concepto de la línea, hasta 500; `defaultUnitPrice` con las mismas reglas que el precio de una línea; `defaultVat`, un tipo o Exenta con Supuesto de exención) y `draftLineFromCatalogItem`, que crea una línea de 1 unidad con copia de los valores.
- API: tabla `catalog_items` (migración 0007); el precio se guarda como texto decimal, igual que viaja. `GET /catalog-items` (por nombre), `POST /catalog-items`, `GET|PUT|DELETE /catalog-items/:id`; uno ajeno → 404 `CATALOG_ITEM_NOT_FOUND`. Se borra siempre: ninguna línea lo referencia. Accesible antes de firmar la Representación.
- Web: «Artículos» en la cabecera (entre Clientes y Ajustes, como en `design.html`), `/catalog-items`, `/catalog-items/new` (IVA por defecto del Emisor) y `/catalog-items/:id` (editar y borrar). `design.html` no trae pantalla de Artículos: sigue el patrón de Clientes. En el editor, «Añadir desde artículos» abre un buscador; la línea elegida sustituye a la línea en blanco con la que empieza un Borrador nuevo.

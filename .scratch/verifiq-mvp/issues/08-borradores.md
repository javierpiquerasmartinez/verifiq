# 08: Borradores

Spec: `../spec.md` (historias 38–52) · ADR 0002

**What to build:** el Usuario crea, edita, previsualiza y borra Borradores sin número: Destinatario (con alta en línea), varias líneas con IVA por línea (incluida Exenta con Supuesto), Retención de IRPF por factura, Periodo facturado que rellena la Descripción de la operación, y un resumen en vivo calculado con el dominio de importes.

**Blocked by:** 04; 07; `design.html`

**Status:** done

- [x] Borrador sin número; guardar, editar y borrar libremente
- [x] Selector de Destinatario con búsqueda y alta en línea
- [x] Líneas: concepto, cantidad, precio, descuento %, IVA (21/10/4/0/Exenta + supuesto), importe; valores por defecto del Emisor
- [x] Retención de IRPF por factura (15/7/sin), por defecto la del Emisor
- [x] Periodo facturado opcional → fecha de operación = último día; Descripción de la operación prerellenada y editable, con aviso de no incluir datos de pacientes
- [x] Resumen en vivo: bases por tipo, cuotas, exentas con mención, Importe total, retención, Total a pagar (destacado)
- [x] La API recalcula con el mismo dominio y rechaza incoherencias; validación en línea
- [x] Fecha de expedición = hoy, no editable
- [x] Vista previa HTML del borrador
- [x] Tests de API: CRUD, validaciones, cálculo coincide con el dominio

## Comments

**2026-10-04 (agente):** implementado en `stage`, con tests en la frontera HTTP (Postgres real y el fake del conector, `test/drafts.test.ts`) y en el dominio (`draft.test.ts`).
- Dominio (`packages/domain/src/draft.ts`): `draftDataSchema` (cuerpo de la API; nunca lleva importes), `draftSchema` (respuesta, con `breakdown` calculado, `operationDate`, `issueDate` y `problems`), `defaultOperationDescription` («Servicios odontológicos septiembre 2026» si el periodo es un mes natural; si no, «del dd/mm/aaaa al dd/mm/aaaa»; los servicios se nombran por el IVA por defecto del Emisor) y `findDraftProblems`, compartida por la web (en línea) y la API. `todayInSpain` pasa al dominio.
- Problemas que impiden emitir (no impiden guardar): sin cliente, cliente archivado, NIF sin comprobar en el censo, periodo que aún no ha terminado (la AEAT rechaza una fecha de operación posterior a la de expedición), sin descripción, sin líneas, línea sin concepto.
- API: tabla `drafts` propia (migración 0006), no `invoices`, para que un Borrador no cuente como «factura» de su Destinatario; las líneas van en jsonb. Borrar un Destinatario deja sus Borradores sin cliente (`ON DELETE SET NULL`). `GET /drafts` (más reciente primero), `POST /drafts`, `GET|PUT|DELETE /drafts/:id`. Un Destinatario de otro Emisor → 422 `DRAFT_RECIPIENT_NOT_FOUND`; un Borrador ajeno → 404. Incoherencias (periodo invertido, fecha imposible, IVA o supuesto inexistente, importes negativos o con más decimales, descuento > 100 %, retención inexistente, descripción > 500) → 400. Los importes que mande la web se ignoran: la API siempre los calcula con `computeBreakdown`.
- Líneas de Borradores ordinarios sin importes negativos; las rectificativas (issue 15) tendrán que relajarlo.
- Web: `/drafts/new`, `/drafts/:id` (editor según `design.html`) y `/drafts/:id/preview` (vista previa HTML, imprimible; guarda antes de abrirla). Selector de cliente con búsqueda (solo activos) y alta en línea con `RecipientForm`. «Nueva factura» en la cabecera y lista de Borradores en «Facturas» hasta la issue 14. Quedan fuera el botón Emitir (issue 10) y «Añadir desde artículos» (issue 09).


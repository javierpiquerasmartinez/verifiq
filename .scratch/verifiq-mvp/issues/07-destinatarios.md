# 07: Destinatarios

Spec: `../spec.md` (historias 27–34)

**What to build:** el Usuario gestiona sus Destinatarios ("Clientes" en la UI): alta con validación del NIF contra el censo de la AEAT, edición, búsqueda, archivado de los que tienen facturas y borrado de los que no.

**Blocked by:** 03; 04; 05; `design.html`

**Status:** done

- [x] Campos: nombre o razón social, NIF/CIF, dirección, CP, municipio, provincia; solo identificadores españoles
- [x] Validación de formato local y comprobación contra el censo al guardar; resultado guardado; mensaje claro si no figura
- [x] Edición con aviso de que no altera facturas emitidas
- [x] Destinatario con facturas emitidas: solo archivar (desaparece de selectores); sin facturas: borrar
- [x] Listado con búsqueda
- [x] Tests de API: censo OK/KO con el fake, archivado vs borrado, aislamiento por Emisor

## Comments

**2026-10-04 (agente):** implementado en `stage`, con tests en la frontera HTTP (Postgres real y el fake del conector, `test/recipients.test.ts`).
- API: `RecipientsService` (`apps/api/src/recipients/`), migración 0005 (`recipients` y una tabla `invoices` mínima). `GET /recipients?q=&status=active|archived`, `POST /recipients`, `GET|PUT|DELETE /recipients/:id`, `POST /recipients/:id/archive` y `/restore`. Todo filtrado por el Emisor de la sesión; un id ajeno o inválido responde 404.
- Censo al guardar (alta, o edición que cambia NIF o nombre): no figura → 422 `TAX_ID_NOT_IN_CENSUS`; de baja o revocado → 422 `TAX_ID_INACTIVE`; con otro nombre → 422 `CENSUS_NAME_MISMATCH` (con `censusName` si el censo lo da); el conector rechaza la consulta → 422 `CENSUS_REJECTED`. Si el censo no responde, se guarda como `unchecked` y se vuelve a consultar en el siguiente guardado (ver comentario en la issue 10).
- Borrar con facturas → 409 `RECIPIENT_HAS_INVOICES` (FK `restrict`). Archivar se permite a cualquiera por API; la web solo lo ofrece si tiene facturas. Se añadió recuperar un archivado, que la spec no pedía.
- Búsqueda por nombre (sin acentos ni mayúsculas), NIF o municipio.
- Web: «Clientes» en la navegación, `/recipients`, `/recipients/new`, `/recipients/:id`; `RecipientForm` reutilizable para el alta en línea de la issue 08.

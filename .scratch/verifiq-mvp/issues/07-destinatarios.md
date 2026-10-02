# 07: Destinatarios

Spec: `../spec.md` (historias 27–34)

**What to build:** el Usuario gestiona sus Destinatarios ("Clientes" en la UI): alta con validación del NIF contra el censo de la AEAT, edición, búsqueda, archivado de los que tienen facturas y borrado de los que no.

**Blocked by:** 03; 04; 05; `design.html`

**Status:** ready-for-agent

- [ ] Campos: nombre o razón social, NIF/CIF, dirección, CP, municipio, provincia; solo identificadores españoles
- [ ] Validación de formato local y comprobación contra el censo al guardar; resultado guardado; mensaje claro si no figura
- [ ] Edición con aviso de que no altera facturas emitidas
- [ ] Destinatario con facturas emitidas: solo archivar (desaparece de selectores); sin facturas: borrar
- [ ] Listado con búsqueda
- [ ] Tests de API: censo OK/KO con el fake, archivado vs borrado, aislamiento por Emisor

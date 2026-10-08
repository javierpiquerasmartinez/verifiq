# 28: Ampliar el catálogo de Supuestos de exención

Spec: `../spec.md` (historias 18, 35, 41, 42, 47, 67; módulo «Supuestos de exención») · issue 04 · `docs/research/dentista.md` §1

**What to build:** hoy el catálogo de Supuestos de exención solo tiene odontología (art. 20.Uno.5º). Un autónomo exento que no sea dentista imprimiría en su factura una mención con un artículo que no le corresponde. Hay que ampliar el catálogo para que Verifiq se pueda ofrecer a cualquier autónomo que facture en España con IVA o con una exención del art. 20, y como mínimo a todos los sanitarios.

**Blocked by:** —

**Status:** ready-for-agent

## Decisiones (grilling del 2026-10-08)

- La mención de exención es obligatoria (ROF art. 6.1.j), pero puede limitarse a indicar que la operación está exenta sin citar el precepto. Por eso cabe un supuesto genérico.
- Catálogo cerrado, mantenido por nosotros, con estos supuestos y todos codificados como E1:

  | Apartado art. 20.Uno | Etiqueta (orientativa) | Descripción de la operación |
  |---|---|---|
  | 3º | Asistencia sanitaria (médicos, fisioterapeutas, psicólogos sanitarios, enfermería, ópticos-optometristas, podólogos, logopedas…) | Servicios sanitarios |
  | 5º | Odontología (el actual `dentistry`) | Servicios odontológicos |
  | 9º | Enseñanza reglada | Servicios de enseñanza |
  | 10º | Clases particulares | Clases particulares |
  | 16º | Mediación de seguros | Servicios de mediación de seguros |
  | 26º | Autores, artistas y colaboradores literarios | Servicios profesionales |
  | — | Otra exención del art. 20 LIVA | Servicios profesionales |

- Un único supuesto para el 3º, no uno por profesión: comparten la mención y la Descripción de la operación es editable.
- El supuesto genérico imprime una mención que solo dice que la operación está exenta conforme al art. 20 de la Ley 37/1992, sin apartado. Debajo del selector, cuando está elegido, se muestra una ayuda: «Solo para exenciones del artículo 20. Las facturas a clientes extranjeros todavía no están disponibles en Verifiq.»
- Sin preselección en el Alta del Emisor ni en el formulario de Artículo: al elegir «Exenta» el Usuario tiene que escoger el supuesto a propósito. En las líneas del Borrador se sigue heredando del Artículo o del Emisor como hasta ahora.
- Los Emisores, Artículos y Borradores que ya tienen `dentistry` se quedan igual: el id no cambia y no hace falta migración.
- Siguen fuera de alcance las exenciones E2–E6 y las operaciones no sujetas (clientes extranjeros, intracomunitarias). Cada supuesto del catálogo debe poder llevar su propio código VeriFactu para que añadirlas más adelante no obligue a migrar, aunque por ahora todos sean E1.

## Acceptance criteria

- [ ] **Primero:** verificar contra el texto vigente de la LIVA en el BOE (https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740, art. 20) el alcance de los apartados 3º, 9º, 10º, 16º y 26º, y redactar su mención y su etiqueta. Dejar las fuentes y cualquier duda (p. ej. qué profesiones cubre el 3º, requisitos del 10º) como comentario en esta issue. Si un apartado resulta dudoso, quitarlo del catálogo: lo cubre el supuesto genérico.
- [ ] `EXEMPTION_GROUND_IDS` incluye los siete supuestos, con ids en inglés (p. ej. `healthcare`, `dentistry`, `education`, `privateTuition`, `insuranceMediation`, `authorsAndArtists`, `otherArticle20`). Cada uno tiene etiqueta, mención, texto de servicios y código VeriFactu.
- [ ] Los tests de `exemptions.test.ts` cubren el catálogo completo, incluida la mención del supuesto genérico.
- [ ] Una factura con líneas exentas por supuestos distintos muestra una base exenta y una mención por supuesto, en el resumen en vivo y en el PDF.
- [ ] `defaultOperationDescription` usa el texto de servicios de cada supuesto («Servicios sanitarios septiembre 2026»…).
- [ ] En el Alta del Emisor (`DefaultsForm`) y en `CatalogItemForm`, al elegir «Exenta» no hay supuesto preseleccionado y no se puede guardar sin escogerlo. El mensaje de validación está en español.
- [ ] En las líneas (`DraftLineRow`) el selector aparece con todos los supuestos y el valor heredado del Artículo o del Emisor.
- [ ] La ayuda del supuesto genérico aparece en todos los selectores cuando está elegido.
- [ ] El Registro de facturación sigue enviando `operacion_exenta: "E1"` para cualquier supuesto.
- [ ] Un Emisor con `dentistry` guardado antes del cambio sigue funcionando sin migración.

## Out of scope

- Exenciones E2–E6, operaciones no sujetas (N1/N2), clientes extranjeros, inversión del sujeto pasivo.
- Mención en texto libre escrita por el Usuario.
- Clasificar automáticamente qué servicios están exentos.

## Comments

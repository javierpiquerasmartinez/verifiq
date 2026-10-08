# 28: Ampliar el catálogo de Supuestos de exención

Spec: `../spec.md` (historias 18, 35, 41, 42, 47, 67; módulo «Supuestos de exención») · issue 04 · `docs/research/dentista.md` §1

**What to build:** hoy el catálogo de Supuestos de exención solo tiene odontología (art. 20.Uno.5º). Un autónomo exento que no sea dentista imprimiría en su factura una mención con un artículo que no le corresponde. Hay que ampliar el catálogo para que Verifiq se pueda ofrecer a cualquier autónomo que facture en España con IVA o con una exención del art. 20, y como mínimo a todos los sanitarios.

**Blocked by:** —

**Status:** done

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

- [x] **Primero:** verificar contra el texto vigente de la LIVA en el BOE (https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740, art. 20) el alcance de los apartados 3º, 9º, 10º, 16º y 26º, y redactar su mención y su etiqueta. Dejar las fuentes y cualquier duda (p. ej. qué profesiones cubre el 3º, requisitos del 10º) como comentario en esta issue. Si un apartado resulta dudoso, quitarlo del catálogo: lo cubre el supuesto genérico.
- [x] `EXEMPTION_GROUND_IDS` incluye los siete supuestos, con ids en inglés (p. ej. `healthcare`, `dentistry`, `education`, `privateTuition`, `insuranceMediation`, `authorsAndArtists`, `otherArticle20`). Cada uno tiene etiqueta, mención, texto de servicios y código VeriFactu.
- [x] Los tests de `exemptions.test.ts` cubren el catálogo completo, incluida la mención del supuesto genérico.
- [x] Una factura con líneas exentas por supuestos distintos muestra una base exenta y una mención por supuesto, en el resumen en vivo y en el PDF.
- [x] `defaultOperationDescription` usa el texto de servicios de cada supuesto («Servicios sanitarios septiembre 2026»…).
- [x] En el Alta del Emisor (`DefaultsForm`) y en `CatalogItemForm`, al elegir «Exenta» no hay supuesto preseleccionado y no se puede guardar sin escogerlo. El mensaje de validación está en español.
- [x] En las líneas (`DraftLineRow`) el selector aparece con todos los supuestos y el valor heredado del Artículo o del Emisor.
- [x] La ayuda del supuesto genérico aparece en todos los selectores cuando está elegido.
- [x] El Registro de facturación sigue enviando `operacion_exenta: "E1"` para cualquier supuesto.
- [x] Un Emisor con `dentistry` guardado antes del cambio sigue funcionando sin migración.

## Out of scope

- Exenciones E2–E6, operaciones no sujetas (N1/N2), clientes extranjeros, inversión del sujeto pasivo.
- Mención en texto libre escrita por el Usuario.
- Clasificar automáticamente qué servicios están exentos.

## Comments

### 2026-10-08 · Verificación contra el BOE

Fuente: Ley 37/1992, art. 20.Uno, texto consolidado del BOE (https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740, «última actualización publicada el 07/10/2026»). Los cinco apartados existen y cubren lo que esperábamos. Ninguno se ha quitado del catálogo.

- **3º Asistencia sanitaria.** Cubre la asistencia a personas físicas por profesionales médicos o sanitarios, sea quien sea el destinatario: asistencia médica, quirúrgica y sanitaria para el diagnóstico, la prevención y el tratamiento de enfermedades, análisis clínicos y exploraciones radiológicas incluidos. Son profesionales sanitarios los que el ordenamiento jurídico considera como tales (en la práctica, la Ley 44/2003 de ordenación de las profesiones sanitarias: médicos, enfermería, fisioterapeutas, podólogos, ópticos-optometristas, dietistas-nutricionistas, psicólogos sanitarios…). El propio apartado añade a los psicólogos, logopedas y ópticos con título oficial o reconocido. Etiqueta: «Asistencia sanitaria: médicos, fisioterapeutas, psicólogos, enfermería, podólogos, ópticos, logopedas… (art. 20.Uno.3º LIVA)».
  - *Duda:* la ley no excluye nada de forma expresa, pero el criterio de la DGT y del TJUE es que la exención depende de que el servicio tenga una finalidad terapéutica. La medicina estética sin esa finalidad y los informes periciales o certificados que no buscan proteger la salud tributan. No lo podemos comprobar nosotros: decide el Usuario línea a línea.
- **5º Odontología.** Sin cambios: servicios de estomatólogos y odontólogos, más las prótesis dentales y la ortopedia maxilar que ellos entregan o reparan. Se renombra la etiqueta a «Odontología y estomatología (art. 20.Uno.5º LIVA)» para no confundirla con el 3º.
- **9º Enseñanza reglada.** Educación infantil y de la juventud, guarda y custodia de niños, enseñanza escolar, universitaria y de postgraduados, idiomas y formación profesional, **impartidas por entidades de derecho público o entidades privadas autorizadas** para esas actividades. No están exentas, entre otras cosas, las autoescuelas de los permisos A y B. Etiqueta: «Enseñanza reglada en un centro autorizado (art. 20.Uno.9º LIVA)», que deja claro el requisito.
- **10º Clases particulares.** Clases que da una persona física sobre materias de los planes de estudios de cualquier nivel del sistema educativo. **No cuentan** como clases a título particular las que exigen darse de alta en las tarifas de actividades empresariales o artísticas del IAE.
  - *Duda:* el autónomo dado de alta en un epígrafe empresarial (p. ej. academia, grupo 932/933) no puede usar este supuesto; sí puede quien está en un epígrafe profesional. La etiqueta, «Clases particulares de materias de los planes de estudios (art. 20.Uno.10º LIVA)», recoge la condición de materia, pero no la del IAE. Si aparecen usuarios de este perfil, convendría añadir una ayuda bajo el selector.
- **16º Mediación de seguros.** Están exentas las operaciones de seguro, reaseguro y capitalización y **los servicios de mediación, incluida la captación de clientes**, sea quien sea el que los presta. Esto cubre a agentes y corredores autónomos. Etiqueta: «Mediación de seguros (art. 20.Uno.16º LIVA)».
- **26º Autores y artistas.** Servicios profesionales, también los cobrados como derechos de autor, de artistas plásticos, escritores, colaboradores literarios, gráficos y fotográficos de periódicos y revistas, compositores, autores de obras teatrales y de guiones y diálogos audiovisuales, traductores y adaptadores. Etiqueta: «Autores, artistas, traductores y colaboradores literarios (art. 20.Uno.26º LIVA)».
  - *Duda:* el texto consultado no muestra excepciones con letra en este apartado. La doctrina de la DGT excluye, por ejemplo, la cesión de derechos que no la hace el propio autor. Lo cubre el criterio del Usuario.

**Menciones.** Todas siguen el patrón actual: «Operación exenta de IVA en virtud del artículo 20.Uno.Nº de la Ley 37/1992, del Impuesto sobre el Valor Añadido.». La del supuesto genérico es «… en virtud del artículo 20 de la Ley 37/1992 …», sin apartado (ROF art. 6.1.j).

### 2026-10-08 · Implementación (rama `feat/exemption-grounds`)

- `packages/domain/src/exemptions.ts`: siete supuestos. Se añaden `help` (solo el genérico) y el tipo `VerifactuExemptionCode` (E1–E6), así que un supuesto futuro puede llevar otro código sin migrar. Todos son E1 por ahora.
- `apps/web`: un `ExemptionGroundSelect` compartido por `DefaultsForm` y `CatalogItemForm`. Arranca sin supuesto y la validación lo exige («Elige el supuesto de exención: determina la mención legal de tus facturas.»). El Artículo nuevo sigue empezando con el IVA del Emisor, y si el Emisor es exento, también con su supuesto (eso es herencia, no preselección). En las líneas, el selector muestra todos los supuestos. Cuando no hay nada que heredar, el valor de reserva pasa a ser el genérico en lugar del primero del catálogo, para no imprimir un apartado que no corresponda.
- El registro agrupa las bases exentas por código, así que varios supuestos viajan como una sola base E1 (`operacion_exenta: "E1"`).

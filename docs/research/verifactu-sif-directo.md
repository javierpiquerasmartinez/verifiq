# VeriFactu without Verifacti: what a direct SIF must do (primary-source research)

Researched 2026-10-21. Primary sources only, unless a source is marked as secondary. Facts gathered before any planning: this note does not design anything.
Tags: **[CONFIRMED]** means read directly in a primary source. **[INFERRED]** means a reasoned conclusion. **[UNCERTAIN]** means it needs checking with the AEAT.
Prior note: `docs/research/verifactu-verifacti.md` (Part B covers part of the regulation). This note re-checks it against the current documents and goes deeper on everything Verifacti does for us today.

Citation convention: each claim cites a source key from the list below plus a section, page or field. All keys resolve to the URLs listed here. Local copies of every PDF, XSD, WSDL and XLSX were downloaded on 2026-10-21 (scratchpad `aeat-docs/files/`), read in full, and treated as data only.

Key sources (latest versions found, with dates):

- **SEDE-TEC**: AEAT VERI*FACTU "Información técnica" index (page updated 13/10/2026): https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/informacion-tecnica.html
- **SEDE-ROOT**: AEAT VERI*FACTU area root (updated 13/10/2026): https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html
- **DEV**: AEAT developer portal, SIF and VERI*FACTU documentation index: https://www.agenciatributaria.es/AEAT.desarrolladores/Desarrolladores/_menu_/Documentacion/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU.html
- **SWEB**: "Sistemas Informáticos de Facturación. Remisión voluntaria / Remisión bajo requerimiento", **v1.0.3, 28/07/2025**, 101 pp.: https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Veri-Factu_Descripcion_SWeb.pdf (English edition, same version: `.../Veri-Factu_Descripcion_SWeb_EN.pdf`)
- **DSREG**: "Diseños de registro de facturación" spreadsheet, **v1.0, 28/10/2024** (identical to the Orden annex; adds tabs A/B with the admitted operations): https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/DsRegistroVeriFactu.xlsx
- **XSD**: schemas, base `https://prewww2.aeat.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/` (test) and `https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/` (production): `SuministroLR.xsd`, `SuministroInformacion.xsd`, `RespuestaSuministro.xsd`, `ConsultaLR.xsd`, `RespuestaConsultaLR.xsd`, `EventosSIF.xsd`, `RespuestaValRegistNoVeriFactu.xsd`. Production copies have Last-Modified 11/01/2026 and are byte-identical to test except one whitespace character.
- **WSDL**: `SistemaFacturacion.wsdl` at the same two bases.
- **VAL**: "Validaciones y errores", **v1.2.2, 08/04/2026**, 28 pp.: https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Validaciones_Errores_Veri-Factu.pdf
- **ERR**: error-code list `errores.properties` (same bases as XSD; identical in test and production on 2026-10-21).
- **HASH**: "Detalle de las especificaciones técnicas para generación de la huella o hash", **v0.1.2, 27/08/2024**, 13 pp.: https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Veri-Factu_especificaciones_huella_hash_registros.pdf
- **QR**: "Detalle de las especificaciones técnicas del código QR de la factura y de la URL del servicio de cotejo", **v0.5.0, 10/12/2025**, 35 pp.: https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/DetalleEspecificacTecnCodigoQRfactura.pdf
- **SIGN**: "Especificaciones técnicas para generación de la firma electrónica de los registros de facturación", **v0.1.5, 06/03/2025**, 15 pp., plus `AnexosEjemplosFirmaRegFact.zip`: https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Espec-Tecnicas/EspecTecGenerFirmaElectRfact.pdf
- **NOVF**: "Servicio validación de registros no verificables", **v0.2, 17/09/2025**: https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Descripcion_ServicioWeb_ValidacionNoVerifactu.pdf
- **DEVFAQ**: "Aclaraciones a dudas de los desarrolladores", **v1.3, 04/12/2025**, 52 pp.: https://sede.agenciatributaria.gob.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/FAQs-Desarrolladores.pdf
- **DREX**: "Ejemplos de declaraciones responsables" **V0.5.1** (sede) and the developer-portal copy (same text): https://sede.agenciatributaria.gob.es/static_files/Sede/Tema/IVA/Verifactu/EjemplosDeclaracionResponsable(V0.5.1).pdf
- **FAQ-x**: AEAT VERI*FACTU FAQ pages, "Actualizadas a 21 de octubre de 2026", under https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/ — FAQ-SVF `sistemas-verifactu.html`, FAQ-CS `colaboracion-social.html`, FAQ-DR `certificacion-sistemas-informaticos-declaracion-responsable.html`, FAQ-OBJ `cuestiones-generales-objeto.html`, FAQ-DEL `cuestiones-generales-cumplimiento-delegacion.html`, FAQ-MULT `caracteristicas-requisitos-sistemas-informaticos-facturacion-multiple.html`, FAQ-REM `caracteristicas-requisitos-sif-capacidad-remision-etc_.html`, FAQ-TRAZ `caracteristicas-requisitos-sif-trazabilidad.html`, FAQ-FIRMA `firma.html`, FAQ-HASH `huella-hash.html`, FAQ-ALTA `registros-facturacion-alta.html`, FAQ-ANUL `registros-facturacion-anulacion.html`, FAQ-PROC `procedimientos-facturacion.html`, FAQ-QR `posibilidad-remision-informacion-factura-parte-receptor.html`.
- **NOTA-AEAT**: "NOTA INFORMATIVA: Ampliación del plazo de adaptación de los SIF" (updated 13/10/2026): https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html
- **NOTA-MH**: Ministerio de Hacienda press note, **05/10/2026**, "Previsión de modificación de los plazos…": https://www.hacienda.gob.es/sgt/gabsehacienda/nota-informativa-verifactu.pdf
- **RRSIF**: RD 1007/2023, consolidated (last update published 03/12/2025, in force 04/12/2025): https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840 (later-references list checked at https://www.boe.es/buscar/doc.php?id=BOE-A-2023-24840)
- **OM**: Orden HAC/1177/2024, consolidated (no amendment since publication, 28/10/2024): https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138
- **RDL15**: RD-ley 15/2025, disposición final primera; convalidated by Resolución de 11/12/2025 (BOE-A-2025-25695): https://www.boe.es/buscar/doc.php?id=BOE-A-2025-24446
- **RD254**: RD 254/2025: https://www.boe.es/buscar/doc.php?id=BOE-A-2025-6600
- **ROF**: RD 1619/2012 (Reglamento de facturación), consolidated: https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696
- **LGT**: Ley 58/2003, arts. 29.2.j and 201 bis (consolidated, last update 21/12/2024): https://www.boe.es/buscar/act.php?id=BOE-A-2003-23186
- **RES-REP**: Resolución de 18/12/2024 (DG AEAT), standard representation forms, BOE 31/12/2024: https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-27600
- **PRE**: AEAT external test portal: https://preportal.aeat.es and its VERI*FACTU section https://preportal.aeat.es/PRE-Exteriores/Inicio/_menu_/VERI_FACTU___Sistemas_Informaticos_de_Facturacion/VERI_FACTU___Sistemas_Informaticos_de_Facturacion.html
- **CS-MOD**: AEAT "Modelos de autorización de trámites para colaboradores sociales" (updated 16/09/2026): https://sede.agenciatributaria.gob.es/Sede/colaborar-agencia-tributaria/colaboracion-social-presentacion-declaraciones/modelos-autorizacion-tramites-colaboradores-sociales.html

---

## Most important findings

1. **[CONFIRMED] Deadlines in force are still 1/1/2027 (IS) and 1/7/2027 (everyone else, autónomos included)** (RDL15; FAQ-OBJ, updated 21/10/2026). **But on 05/10/2026 the Ministry announced it will postpone the pending obligations "hasta octubre de 2028"**, to align with B2B e-invoicing for businesses ≤ €8M (NOTA-MH). Nothing is in the BOE yet: the consolidated RRSIF shows no amendment after 03/12/2025 (RRSIF, "Referencias posteriores"). See §9.
2. **[CONFIRMED] A VERI*FACTU-only SIF is far lighter than a non-VERI*FACTU one.** No signature of records, no event log, no record retention or export duty, no anomaly checks, no 1-minute clock duty, no pre-generation chain check (OM art. 3; RRSIF art. 16.2–16.3; DEVFAQ §15 note 1; FAQ-HASH; FAQ-TRAZ). What remains: build the XML, compute and chain the hash, send instantly with a qualified certificate, honour flow control, handle responses, retry during incidents, put the QR and legend on the invoice, and publish our own declaración responsable. See §1, §7.
3. **[CONFIRMED] A SaaS producer can submit for all its clients with one qualified certificate of its own**, as colaborador social (Convenio tipo **017**, plus each Issuer signing the Anexo I form) or as apoderado (each Issuer registers a poder in the AEAT Registro de apoderamientos) (DEVFAQ §16; FAQ-CS; FAQ-DEL; FAQ-SVF; RES-REP). Each submission (lote) must contain records of **one obligado only** (FAQ-SVF). See §3.
4. **[CONFIRMED] The exchange is synchronous SOAP 1.1** (document/literal), one operation for altas and anulaciones (`RegFactuSistemaFacturacion`, ≤1,000 records) and one for queries (`ConsultaFactuSistemaFacturacion`, ≤10,000 results per page). Each record is `Correcto`, `AceptadoConErrores` or `Incorrecto`; header or schema errors return a SOAP Fault (SWEB §3, §6; WSDL). The **CSV must be stored at submission time; it cannot be retrieved later** (SWEB §6.4.4). See §4.
5. **[CONFIRMED] The hash algorithm and its three official test vectors are public, and all three reproduce exactly with SHA-256** over the UTF-8 `name=value&…` string (HASH §3–6; checked locally with Python `hashlib`). See §5.
6. **[CONFIRMED] AEAT does not certify or homologate software.** The producer self-certifies with a declaración responsable per version, which is not filed anywhere (FAQ-DR). The test environment is `prewww1/prewww2/prewww10.aeat.es`, needs a real qualified certificate, and has no conformance suite (PRE). See §8.
7. **[CONFIRMED] Switching from Verifacti changes the SIF identity.** The `SistemaInformatico` block identifies the producer of the principal component (us), the 2-character system code, version and installation number (DSREG tab 5). The chain is per (SIF, obligado) pair (FAQ-TRAZ). How the AEAT treats an Issuer moving from a Verifacti-generated chain to ours (new chain with `PrimerRegistro=S`, or continuation) is **[UNCERTAIN]**; error 2007 ties "primer registro" to "el sistema informático actual" (ERR). This is open question Q1.

---

## 1. Legal requirements of a SIF and the two modes

### 1.1 What a SIF is and who is bound

- **[CONFIRMED]** A SIF is the hardware and software used to issue invoices by (a) admitting invoicing data, (b) keeping it, and (c) processing it (RRSIF art. 1.2). The rules apply to IS taxpayers, IRPF taxpayers with economic activities (autónomos), IRNR with permanent establishment and entidades en atribución de rentas, "aunque solo los usen para una parte de su actividad" (RRSIF art. 3.1). They also apply to **producers and sellers** of SIF (art. 3.2). They do not apply to SII filers (art. 3.3).
- **[CONFIRMED]** An obligado tributario may use either an adapted SIF or the free AEAT application (RRSIF art. 7). One SIF may serve several obligados "siempre que los registros de facturación de cada obligado tributario se encuentren diferenciados y se cumplan los requisitos … por separado" (art. 7.a).
- **[CONFIRMED]** The producer may sell VERI*FACTU-only, "dual" (VERI*FACTU or not) or "triple" (plus SII) systems. **A system that can only work as non-VERI*FACTU is not allowed**, because art. 8.1 requires remission capacity (FAQ-SVF, "¿Un SIF puede funcionar únicamente como sistema de emisión de facturas verificables?").
- **[CONFIRMED]** A SaaS cannot let a user switch modes dynamically (per invoice, session or day). Each mode is a distinct SIF that the user chooses "con carácter permanente" (DEVFAQ §3, incl. the SaaS paragraph).

### 1.2 The six guarantees (art. 29.2.j LGT, art. 8 RRSIF)

- **[CONFIRMED]** Integrity, conservation, accessibility, legibility, traceability and inalterability of records "sin interpolaciones, omisiones o alteraciones" (LGT art. 29.2.j; RRSIF arts. 1.1, 8.1).
- **[CONFIRMED]** The SIF must be able to send all records "de forma continuada, segura, correcta, íntegra, automática, consecutiva, instantánea y fehaciente" (RRSIF art. 8.1, second paragraph). This applies to both modes (FAQ-REM, first question).
- **[CONFIRMED]** Any correction or voiding must be done through at least one later additional record. Originals stay unchanged (RRSIF art. 8.2.a). A SIF that can delete generated records does not comply (FAQ-MULT).
- **[CONFIRMED]** Records must be chained and correctly dated (art. 8.2.b), kept for the LGT period and exportable (art. 8.2.c). The SIF needs an event log (art. 8.3) and must separate tax data from confidential non-tax data for AEAT inspection (art. 8.4).
- **[CONFIRMED]** The alta record is generated automatically "de forma simultánea o inmediatamente anterior a la expedición de cada factura" (RRSIF art. 9). The anulación record is generated "cuando se haya emitido erróneamente una factura" (art. 11.1). Both carry a hash (art. 12) and must be signed (art. 12, second paragraph) unless the system is VERI*FACTU (art. 16.3).

### 1.3 What VERI*FACTU mode exempts

- **[CONFIRMED]** VERI*FACTU systems "se presumirá que … cumplen por diseño los requisitos establecidos en el artículo 8". Art. 14.2 (AEAT requests for copies of kept records) does not apply to them (RRSIF art. 16.2). They need not sign records; the hash is enough (art. 16.3).
- **[CONFIRMED]** While acting as VERI*FACTU, these Orden articles do not apply: **6.b–f** (on-demand hash checks, signing, signature checks, chain checks, integrity alarms), **7.f** (1-minute clock accuracy), **7.h** (forward/backward chain navigation), **7.i** (checking the last record before generating a new one), **7.j** (traceability alarms), **8** (conservation, export) and **9** (event log) (OM art. 3).
- **[CONFIRMED]** What still applies in VERI*FACTU: hash per record (OM art. 6.a), one chain per (SIF, obligado) with altas and anulaciones (art. 7.a–e, 7.g), XML/UTF-8 record formats (arts. 10–11), hash spec (art. 13), DR (art. 15), remission rules (art. 16), lock-in and renunciation (art. 17), QR and legend (arts. 20–21), multi-obligado behaviour (art. 2) and remission capacity and authentication (arts. 4–5) (OM arts. 2–21, read against art. 3).
- **[CONFIRMED]** AEAT summary of the advantages of VERI*FACTU: no duty to store or export records or events, no later AEAT requests for those records, no 1-minute clock duty, verifiable QR, and AEAT help with the libro registro (FAQ-SVF, "¿Qué ventajas tiene…?"). The producer of a VERI*FACTU-only system need not implement an event log or anomaly checks (DEVFAQ §15, note 1; FAQ-HASH, last-but-one answer).
- **[CONFIRMED]** VERI*FACTU does not remove the duty to keep the **invoices** themselves, because records do not contain invoice lines (DEVFAQ §13.1). It does not replace the Libro Registro de Facturas Emitidas or forms 347/349 (FAQ-SVF). (Retention periods for invoices are in the prior note §15.)

### 1.4 Mode choice, lock-in and renunciation

- **[CONFIRMED]** An obligado opts in tacitly by starting to send records systematically. The option lasts at least until 31 December of the year of the first effective sending (RRSIF art. 16.5; OM art. 17.2). No form 036 notice is needed (FAQ-SVF).
- **[CONFIRMED]** To renounce, the SIF sends the last VERI*FACTU date in `Cabecera/RemisionVoluntaria/FechaFinVeriFactu`. The first message carrying it must be sent before the end of the year in which the renunciation takes effect (OM art. 17.3; DSREG tab 1). From 1/1/2027 the value must be `31-12-20XX`, with the year equal to the AEAT's current year or the year before (VAL §3.1.1.3; ERR 4120).
- **[CONFIRMED]** Before the obligation date the period is "un periodo de pruebas": a taxpayer may stop using a VERI*FACTU SIF without the year-end lock-in (NOTA-AEAT; FAQ-OBJ, last question).

---

## 2. Producer obligations

### 2.1 Declaración responsable (DR)

- **[CONFIRMED] Who:** the producer (fabricante or developer) certifies. Sellers must make sure what they sell is certified (RRSIF art. 13.1; FAQ-DR). It is mandatory for every SIF product, including VERI*FACTU-only ones and in-house or open-source software (FAQ-DR question list).
- **[CONFIRMED] Per version:** "Cada versión, por pequeña variación que introduzca, es un producto distinto … necesario que el productor … certifique expresamente" (FAQ-DR; RRSIF art. 13.2; OM art. 15.4).
- **[CONFIRMED] Where:** inside the SIF, readable and reachable "de forma rápida, fácil e intuitiva" from any access point (a "Ayuda"/"Acerca de" style menu is suggested). Also **outside** the SIF, before purchase, in a widely used free format (PDF, plain text, a web page) (OM art. 15.3; FAQ-DR). Only the current version's DR must be inside the SIF (FAQ-DR).
- **[CONFIRMED] Keeping:** producer and seller keep the DRs of all versions. The AEAT recommends publishing them all online, even for obsolete versions. Users must keep the DRs of systems they replace or update (RRSIF art. 13.3; FAQ-DR).
- **[CONFIRMED] Not filed, no external certification, no prior registration, no electronic signature required.** "Auto-certificación … incorporada al producto". "No se prevé ningún registro previo del producto SIF". "Fecha y lugar en que la firma" means when and where it was drawn up, not a digital signature (FAQ-DR).
- **[CONFIRMED] Mandatory content, in this order**, under the title «DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN», each item preceded by its legal descriptive text (OM art. 15.1):

| Item | Content |
|---|---|
| a | System name (commercial name) |
| b | System ID code, 2 positions (the same value as `IdSistemaInformatico`) |
| c | Full version identifier |
| d | Hardware and software components, plus a short description of what it does |
| e | Whether it can only work as VERI*FACTU (S/N) |
| f | Whether it supports several obligados (S/N) |
| g | Signature types used when not used as VERI*FACTU |
| h | Producer name or razón social |
| i | Producer Spanish NIF (or foreign ID, type and country) |
| j | Full postal contact address |
| k | Fixed compliance statement (LGT 29.2.j, RRSIF, OM, sede specs) |
| l | Date (day, month, year) and place (locality, country) |

- **[CONFIRMED] Recommended annex:** other contacts, web addresses (including a page with the DR history), a detailed explanation of how each spec is met, anything else (OM art. 15.2). The AEAT example (product "FactuEJEMPLO_AEAT Enterprise Edition", code `F1`, version `1.1.5 SP1`, VERI*FACTU-only, multi-OT `S`) answers 1.g as: no explicit signature, because records are taken as signed when sent with a qualified certificate (DREX, Ejemplo 1).
- **[CONFIRMED] Multiple components:** every component (CPF and CF) from a different producer needs its own DR (OM art. 15.4). When the CF is ours with a linked release cycle, one DR may cover both, and a CF change is a CPF version change (DEVFAQ §5 c; §8). **[INFERRED]** If Verifiq builds the AEAT exchange itself, as part of the same product and release cycle, one DR covers it and the Verifacti CF reference disappears from our DR.

### 2.2 SIF identification in every record (`SistemaInformatico` block)

Source: DSREG tab 5; XSD `SistemaInformaticoType`; VAL §3.1.5; DEVFAQ §4.

| Field | Format | Rule |
|---|---|---|
| `NombreRazon` | text ≤120 | Producer of the **principal component** (CPF), when there are several producers **[CONFIRMED]** (DSREG tab 5, note) |
| `NIF` or `IDOtro` | NIF (9) / IDOtro | Producer ID; `IDType 07` not allowed (VAL §3.1.5) |
| `NombreSistemaInformatico` | text ≤30 | Mandatory, non-empty in altas and anulaciones |
| `IdSistemaInformatico` | exactly 2 chars | Each char is an uppercase letter (not Ñ) or a digit. Fixed once chosen, unique among the producer's SIFs (VAL §3.1.5; FAQ-DR, "Factura x Basic" answer) |
| `Version` | text ≤50 | Version running; a version change does not change the SIF identity (DEVFAQ §4) |
| `NumeroInstalacion` | text ≤100 | Never repeated for the same obligado, past, present or future. Recommended: install timestamp or sequential number. In a multi-billing SIF, **each billing (each obligado) has its own number** (DEVFAQ §4) |
| `TipoUsoPosibleSoloVerifactu` | S/N | Mandatory in altas and anulaciones |
| `TipoUsoPosibleMultiOT` | S/N | Whether the SIF can bill for several obligados |
| `IndicadorMultiplesOT` | S/N | Computed automatically, never typed by the user. In a SaaS, **computed per user**: `S` only for users that have more than one billing (obligado) in the SaaS, whatever their state; otherwise `N` (DSREG tab 5; DEVFAQ §4, last paragraph) |

- **[CONFIRMED]** A SIF is identified universally by **NIF of the obligado + IdSistemaInformatico (with the producer's NIF) + NumeroInstalacion** (DEVFAQ §4).

### 2.3 Sanctions (LGT art. 201 bis, both "graves")

| Who | Conduct | Fine |
|---|---|---|
| Producer or seller | Making or selling systems that allow double books, hiding or altering records, or that fail the 29.2.j specs (letters a–e) | **€150,000 fixed per financial year with sales and per system type** |
| Producer or seller | Not certifying when obliged (letter f) | **€1,000 per system sold without the certificate** |
| User | Holding systems not adjusted to 29.2.j when not certified, or with altered certified devices | **€50,000 per year** (not cumulative with the producer sanction for the same person) |

Source: **[CONFIRMED]** LGT art. 201 bis.1–4 (in force since 11/10/2021); FAQ-OBJ ("¿Qué sanciones contempla…?"). Holding an old, non-adapted system only for historical consultation, unable to issue invoices, may not be an infringement (FAQ-OBJ).

---

## 3. Multi-tenant SaaS: submitting for many obligados

### 3.1 Multi-obligado behaviour

- **[CONFIRMED]** The SIF must behave as an independent SIF per obligado: separate record management, **separate chains**, VERI*FACTU mode per obligado, and "visualizar, claramente y en todo momento" which obligado is active. When it really supports more than one, it must say so in an easily consulted message (OM art. 2). Any unique identifier is enough: name, NIF or another intelligible code (DEVFAQ §7).
- **[CONFIRMED]** One chain per distinct (SIF; obligado) pair (FAQ-TRAZ, "¿A qué nivel…?").
- **[CONFIRMED]** All records in one submission must belong to the same obligado. A multi-company SIF "deberá realizar envíos separados" (FAQ-SVF, "En un sistema VERI*FACTU, en los lotes…"). The header has a single `ObligadoEmision`, and `IDEmisorFactura` must equal it (VAL §3.1.3.1; ERR 1108).

### 3.2 Who may submit, and with which certificate

- **[CONFIRMED]** Senders: the obligado itself or a third party acting for it under RGAT arts. 79–81 and Orden HAC/1398/2003 (colaboración social) (OM art. 5). In practice: representación, apoderamiento or colaboración social, "haciendo uso de un certificado cualificado por parte del tercero que ostente la condición de representante, apoderado o colaborador social" (FAQ-SVF, "¿Es posible usar un certificado electrónico de un tercero…?").
- **[CONFIRMED]** The certificate holder must be "Obligado Emisión, Colaborador Social, Apoderado o Sucesor", otherwise the whole submission is rejected (ERR 4112; 4110 is the technical error while checking apoderamientos).
- **[INFERRED]** So **one Verifiq certificate can submit for every Issuer** once each Issuer has granted the representation. Submissions stay one obligado per message (§3.1).
- **[CONFIRMED]** The sender's NIF appears in the response as `DatosPresentacion/NIFPresentador` (SWEB §6.4.4).
- **[CONFIRMED]** The optional header block `Representante` is for "colaboración social transitiva": obligado → asesor (representative) → cloud platform that sends with its own certificate. It records the obligado–asesor link (SWEB §2.4). It is filled only when the records were generated by a representative or asesor (DSREG tab 1). Its NIF and name must be in the census (VAL §3.1.1.2; ERR 4105, 4123, 4124). **[INFERRED]** A direct Issuer → Verifiq relationship (Anexo I) leaves it empty.

### 3.3 Route A: colaboración social (Convenio 017)

- **[CONFIRMED]** Software companies may sign the colaboración social agreement **"Tipo 017"** (it covers SII, SILICIE and VERI*FACTU record submission). To start, they contact **comunicacion.sepri@correo.aeat.es** (FAQ-CS). Agreement types 001 and 002 (intermediaries) and 017 work for VERI*FACTU (DEVFAQ §16.2).
- **[CONFIRMED] Application file** (to the Delegación of the fiscal domicile or that email): a formal request signed by someone with authority under LGT art. 92; entity name and NIF; **copy of the bylaws article on the corporate purpose**; name and NIF of the signatory with the appointment certificate or power of attorney; contact person, phone, address, email. All as PDF. Once catalogued, the entity manages it through the sede "gestiones de colaboración social" (DEVFAQ §16.2).
  - **[INFERRED]** The bylaws requirement suggests the agreement is meant for legal entities. Whether a natural-person producer can sign Convenio 017 is **[UNCERTAIN]** (Q4).
- **[CONFIRMED] What each Issuer must sign:** the standard form **Anexo I** of RES-REP, "representación directa de los obligados tributarios a empresas suministradoras de software". The form text cannot be modified, though representation may also be granted by any other valid legal means (RES-REP, dispongo único and Anexo I). Anexo II covers obligado → tax professional; Anexo III covers professional → software company (indirect route) (RES-REP). PDFs of the three forms: CS-MOD.
- **[CONFIRMED] Anexo I content:** grantor (natural person: name, NIF, domicile municipality, street, number; legal entity: also its legal representative and supporting document). It names the representative (the software company) "como firmante o adherido al Acuerdo de colaboración". The scope is only the electronic sending: no other acts and no AEAT notifications. It includes consent to automated data processing. The representative accepts and "responde de la autenticidad de la firma … así como de la copia del DNI". Representation is shown to the AEAT only when asked. Footnotes: "DNI o documento equivalente de identificación de personas extranjeras"; entities add their seal unless they sign with an entity certificate (RES-REP, Anexo I).
- **[CONFIRMED] Valid signatures:** handwritten plus a DNI copy (or the legal representative's DNI copy plus company seal); a qualified electronic signature (natural-person or entity-representative certificate); or an eIDAS art. 26 advanced electronic signature. **"No se admitirán modalidades de aceptación de condiciones del servicio"** (FAQ-CS).
- **[CONFIRMED] Online flows are allowed:** web forms or pop-ups that ensure the remission API is used only after the representation is granted and accepted are "perfectamente válida[s]", but they "siempre deberán exigir la cumplimentación y firma (incluyendo electrónica) del otorgamiento" (DEVFAQ §16.4). The signed authorisation stays with the colaborador and is not sent to the AEAT unless requested (FAQ-DEL).
- **[INFERRED]** An online signature (e.g. a qualified signature, or an eIDAS-26 advanced signature with identity verification) inside Verifiq's onboarding is allowed. A click-through acceptance is not.

### 3.4 Route B: apoderamiento

- **[CONFIRMED]** A third party may act as apoderado if the power is in the AEAT **Registro de apoderamientos**, either a general power or a specific power for VERI*FACTU trámites. Three ways: in person at the AEAT, by public document or notarised private document, or **online by the grantor with any Ley 39/2015 identification system**. The online way is "la vía más fácil y preferible", through "Alta de poder para trámites tributarios específicos", which lists the trámites of "Sistemas Informáticos de Facturación y VERI*FACTU" (FAQ-DEL).
- **[UNCERTAIN]** The exact trámite codes for VERI*FACTU in the apoderamiento register, and whether one code covers both sending (`RegFactuSistemaFacturacion`) and the consulta. ERR 4132 and 4140 suggest the **consulta** requires the holder to be the obligado, an **apoderado** or a sucesor ("No puede acceder a la consulta de facturas al no estar apoderado en los trámites necesarios"), and do not mention colaborador social (Q5).

### 3.5 Certificates

- **[CONFIRMED]** "Las aplicaciones que envían información a los servicios web deberán autenticarse con certificado electrónico cualificado reconocido" over HTTPS (SWEB §4.3; also §4.1). Certificates valid at the AEAT sede follow Orden HAP/800/2014 and the EU/EEA Trusted List (SIGN §3; OM art. 5).
- **[CONFIRMED]** The WSDL has separate ports for **"certificado de sello"** (`www10` production, `prewww10` test) (WSDL; PRE: "prewww10.aeat.es (pruebas de Web Services para Contribuyentes con certificado de sello)").
- **[INFERRED]** "Certificado de sello" is a qualified electronic-seal certificate for an entity, suited to unattended server-to-server use. The normal ports (`www1`/`prewww1`) take personal or representative certificates. Which certificate types the AEAT accepts on each port is not spelled out in the VERI*FACTU documents (Q6).
- **[INFERRED]** Client authentication is TLS client-certificate (mutual TLS) at the HTTPS layer, as in other AEAT web services. The documents only say "Con certificado" and "autenticarse con certificado"; none shows a WS-Security header (the SOAP examples have an empty `<soapenv:Header/>`) (SWEB §9.1.1.1).

---

## 4. The exchange contract with the AEAT

### 4.1 Endpoints

| Purpose | Production | Test (Portal de Pruebas Externas) |
|---|---|---|
| VERI*FACTU alta/anulación + consulta (SOAP) | `https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP` | `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP` |
| Same, with "certificado de sello" | `https://www10.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP` | `https://prewww10.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP` |
| Requerimiento (non-VERI*FACTU records) | `https://www1…/RequerimientoSOAP` (sello: `www10…`) | `https://prewww1.aeat.es/…/RequerimientoSOAP` (sello: `prewww10…`) |
| WSDL | `https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl` | `https://prewww2.aeat.es/static_files/…/tikeV1.0/cont/ws/SistemaFacturacion.wsdl` |
| QR cotejo (VERI*FACTU) | `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR` | `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR` |
| QR cotejo (non-VERI*FACTU) | `…/wlpl/TIKE-CONT/ValidarQRNoVerifactu` | same on `prewww2.aeat.es` |
| Validation of non-VERI*FACTU records (test only) | none | `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/ValRegistroNoVerifactu` |
| Web UI: record query / AEAT invoicing app | `https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/SvTikeEmitidasQuery` · `…/MenuAplicacionFacturacion` | same paths behind `prewww1.aeat.es` (PRE) |

Sources: **[CONFIRMED]** WSDL `service` elements; SWEB §7–8 (WSDL and XSD locations); QR §5; NOVF §1 and Annex I (the intro also prints `…/ValRegistroNoVF`, an inconsistency inside NOVF); SEDE-ROOT; PRE. The production services went live on **23/04/2025** (DEVFAQ §1 and §2).

### 4.2 Protocol and services

- **[CONFIRMED]** SOAP 1.1, style document, use literal, WSDL 1.1, UTF-8, HTTPS (SWEB §4.2–4.3). `soapAction=""` for every operation (WSDL).
- **[CONFIRMED]** Port type `sfPortTypeVerifactu`: operations `RegFactuSistemaFacturacion` (input element `sfLR:RegFactuSistemaFacturacion`, output `sfR:RespuestaRegFactuSistemaFacturacion`) and `ConsultaFactuSistemaFacturacion` (input `sfLRC:ConsultaFactuSistemaFacturacion`, output `sfLRRC:RespuestaConsultaFactuSistemaFacturacion`). Port type `sfPortTypePorRequerimiento` has only `RegFactuSistemaFacturacion` (WSDL).
- **[CONFIRMED] Namespace gotcha:** the files live under `…/tikeV1.0/cont/ws/`, but the target namespaces are `https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/{SuministroLR|SuministroInformacion|RespuestaSuministro|ConsultaLR|RespuestaConsultaLR}.xsd` (no "V1.0"), in test too (XSD; SWEB §9 examples). `IDVersion` is the enumeration `1.0` (XSD `VersionType`; DSREG list L15).
- **[CONFIRMED]** Voluntary and requerimiento remission share one XSD but use different URLs, and "son distintos sistemas de gestión en la AEAT, sin compartición de los registros" (SWEB §6.6).

### 4.3 Request structure (`RegFactuSistemaFacturacion`)

- **[CONFIRMED]** `Cabecera` (1) + `RegistroFactura` (1–1000), each a choice of `RegistroAlta` or `RegistroAnulacion`. Altas and anulaciones may be mixed in one message, but never both inside one `RegistroFactura` (XSD `SuministroLR.xsd`; VAL §3.1.2).
- **[CONFIRMED] `Cabecera`** (XSD `CabeceraType`; DSREG tab 1):

| Field | Req. | Notes |
|---|---|---|
| `ObligadoEmision/NombreRazon` (≤120), `/NIF` (9) | yes | Must be identified in the AEAT census (VAL §3.1.1.1; ERR 4104). A natural person also needs `NombreRazon` (ERR 1282) |
| `Representante/NombreRazon`, `/NIF` | no | Transitive colaboración social only (§3.2) |
| `RemisionVoluntaria/FechaFinVeriFactu` | no | Renunciation date, VERI*FACTU only (§1.4) |
| `RemisionVoluntaria/Incidencia` (S/N) | no | `S` when the sending was affected by a technical incident (power cut, connectivity, SIF failure…). Default `N`. VERI*FACTU only (DSREG tab 1; ERR 4121, 4127) |
| `RemisionRequerimiento/RefRequerimiento` (≤18), `/FinRequerimiento` | no | Requerimiento endpoint only; forbidden on VERI*FACTU (ERR 4125, 4126, 4130) |

### 4.4 Registro de alta: fields

Sources: **[CONFIRMED]** XSD `RegistroFacturacionAltaType` (element order is mandatory) and DSREG tab 2; rules from VAL §3.1.3 and ERR. "Hash" marks the fields that enter the fingerprint (§5).

| # | Field | Req. | Format / list | Key rules |
|---|---|---|---|---|
| 1 | `IDVersion` | yes | `1.0` | |
| 2 | `IDFactura/IDEmisorFactura` | yes | NIF(9) | = header NIF (1108). Hash |
| | `IDFactura/NumSerieFactura` | yes | 1–60 | Series + number. ASCII 32–126 only, and not `" ' < > =` (VAL §3.1.3.1; 1130, 1287). Hash |
| | `IDFactura/FechaExpedicionFactura` | yes | dd-mm-yyyy | ≤ today (1112); ≥ 28/10/2024 (1152); not more than 20 years old (1133). Hash |
| 3 | `RefExterna` | no | ≤60 | Free internal reference; echoed in the response and filterable in the consulta |
| 4 | `NombreRazonEmisor` | yes | ≤120 | |
| 5 | `Subsanacion` | no | S/N (L4) | Default N |
| 6 | `RechazoPrevio` | no | N/S/X (L17) | `X` only with `Subsanacion=S` (1153). `S` not allowed without `Subsanacion=S` (1161) |
| 7 | `TipoFactura` | yes | L2: F1, F2, F3, R1–R5 | Hash |
| 8 | `TipoRectificativa` | R* only | S/I (L3) | Required for R1–R5, forbidden otherwise (1114, 1115) |
| 9 | `FacturasRectificadas/IDFacturaRectificada` ×1–1000 | no | NIF+NumSerie+Fecha | Only for R1–R5; optional (1117) |
| 10 | `FacturasSustituidas/IDFacturaSustituida` ×1–1000 | no | same | Only for F3 (1116) |
| 11 | `ImporteRectificacion/BaseRectificada`, `CuotaRectificada`, `CuotaRecargoRectificado` | S only | Decimal 12.2 | Mandatory if and only if `TipoRectificativa=S` (1118, 1119) |
| 12 | `FechaOperacion` | no | dd-mm-yyyy | Only when it differs from the issue date (DSREG). Not later than today unless ClaveRegimen 14/15 (1173). ≥ today − 20 years. The issue date may precede it only with 14/15 (1146) |
| 13 | `DescripcionOperacion` | yes | ≤500 | Description of the invoice's object |
| 14 | `FacturaSimplificadaArt7273` | no | S/N | `S` only for F1, F3, R1–R4 (1183) |
| 15 | `FacturaSinIdentifDestinatarioArt61d` | no | S/N | `S` only for F2, R5 (1185) |
| 16 | `Macrodato` | cond. | S/N | Mandatory `S` if \|ImporteTotal\| ≥ 100,000,000 (1138, 1139) |
| 17 | `EmitidaPorTerceroODestinatario` | no | T/D (L6) | Third-party or recipient invoicing |
| 18 | `Tercero` | cond. | NombreRazon + NIF/IDOtro | Only with `T` |
| 19 | `Destinatarios/IDDestinatario` ×1–1000 | cond. | NombreRazon (≤120) + `NIF` or `IDOtro{CodigoPais, IDType L7, ID ≤20}` | Mandatory for F1, F3, R1–R4; forbidden for F2, R5 (1189, 1190). The NIF must be identified and differ from the issuer's (1193). `IDType 07` "No censado" requires `CodigoPais=ES` (1126) and gives "aceptado con errores" (VAL §4.3.1). A natural-person recipient needs `NombreRazon` (1283) |
| 20 | `Cupon` | no | S/N | `S` only for R1, R5 (1157) |
| 21 | `Desglose/DetalleDesglose` ×1–**12** | yes | see below | |
| 22 | `CuotaTotal` | yes | Decimal ±12.2 | Σ(CuotaRepercutida + CuotaRecargoEquivalencia), ±€10; a mismatch is a warning (2006). Skipped for claves 03/05/06/08/09. Hash |
| 23 | `ImporteTotal` | yes | Decimal ±12.2 | Σ(Base + Cuota + Recargo), ±€10; a mismatch is a warning (2005). Same exclusions. Hash |
| 24 | `Encadenamiento` | yes | choice | `PrimerRegistro=S`, or `RegistroAnterior{IDEmisorFactura, NumSerieFactura, FechaExpedicionFactura, Huella}` of the immediately previous record (alta or anulación) |
| 25 | `SistemaInformatico` | yes | §2.2 | |
| 26 | `FechaHoraHusoGenRegistro` | yes | xs:dateTime with offset, e.g. `2024-01-01T19:20:30+01:00` | Time zone in use by the SIF. Later than the AEAT clock beyond a margin: warning 2004, which needs no subsanación. Hash |
| 27 | `NumRegistroAcuerdoFacturacion` | no | ≤15 | Only with an invoicing authorisation (OM art. 12) |
| 28 | `IdAcuerdoSistemaInformatico` | no | ≤16 | Only with a non-application resolution (OM art. 12) |
| 29 | `TipoHuella` | yes | `01` = SHA-256 (L12) | |
| 30 | `Huella` | yes | ≤64 | This record's hash (§5) |
| 31 | `ds:Signature` | no | XAdES | Not required in VERI*FACTU; allowed (FAQ-FIRMA) |

**`DetalleDesglose`** (XSD `DetalleType`; VAL §3.1.3.15):

| Field | Notes |
|---|---|
| `Impuesto` | L1: 01 IVA (default), 02 IPSI, 03 IGIC, 05 Otros |
| `ClaveRegimen` | Mandatory for IVA (list L8A: 01 general, 02 export, 03 REBU, 04 investment gold, 05 travel agencies, 06 VAT groups, 07 criterio de caja, 08 IPSI/IGIC operations, 09 travel-agency mediation, 10 third-party collections, 11 business premises rental, 14/15 VAT pending accrual, 17 OSS/IOSS, 18 recargo de equivalencia, 19 REAGYP, 20 régimen simplificado). The XSD enumeration also has `21`, valid only for IGIC (VAL §15.6.11) |
| `CalificacionOperacion` **or** `OperacionExenta` | Mutually exclusive, one mandatory (1195, 1196). L9: S1 (subject, no reverse charge), S2 (reverse charge: rate 0 and cuota 0, F1/F3/R1–R4 only), N1 (not subject, arts. 7, 14, other), N2 (not subject by location rules). L10: E1 art. 20, E2 art. 21, E3 art. 22, E4 arts. 23–24, E5 art. 25, E6 other. The XSD also lists E7 and E8, valid only for IGIC (VAL §15.5) |
| `TipoImpositivo` | IVA + S1: 0, 2, 4, 5, 7.5, 10, 21. The value 5 is valid only for operations 1/7/2022–30/9/2024; 2 and 7.5 only 1/10/2024–31/12/2024 (VAL §15.1). Forbidden with N1/N2 under IVA (1237) and with exemptions (1238) |
| `BaseImponibleOimporteNoSujeto` | Mandatory, signed |
| `BaseImponibleACoste` | Only with clave 06, IPSI or Otros (1257) |
| `CuotaRepercutida` | Non-zero only with S1 (1207). With S1: mandatory, same sign as the base, = base × rate / 100 ± €10, except for `TipoRectificativa=I` and R2/R3 (VAL §15.7; 1142, 1143) |
| `TipoRecargoEquivalencia`, `CuotaRecargoEquivalencia` | S1 only, always as a pair (1281, 1284); allowed pairs per rate (VAL §15.3) |

- **[CONFIRMED] Number formats:** amounts use pattern `(\+|-)?\d{1,12}(\.\d{0,2})?` and rates `\d{1,3}(\.\d{0,2})?` (XSD). Decimal separator is "."; no leading zeros; trailing zeros only for precision (SWEB §6.8). Dates `dd-mm-yyyy` with zero padding (SWEB §6.8; XSD `fecha`). Leading and trailing spaces are trimmed and stored trimmed (SWEB §6.7). `&` and `<` must be escaped as XML entities (SWEB §6.9).
- **[CONFIRMED]** Amounts are in euros; other currencies must be converted (RRSIF art. 10.2).

### 4.5 Registro de anulación: fields

Sources: **[CONFIRMED]** XSD `RegistroFacturacionAnulacionType`; DSREG tab 3; VAL §3.1.4.

| Field | Req. | Notes |
|---|---|---|
| `IDVersion` | yes | `1.0` |
| `IDFactura/IDEmisorFacturaAnulada`, `NumSerieFacturaAnulada`, `FechaExpedicionFacturaAnulada` | yes | The NIF must equal the header NIF. All three enter the hash |
| `RefExterna` | no | ≤60 |
| `SinRegistroPrevio` | no | S/N: the alta to void does not exist at the AEAT |
| `RechazoPrevio` | no | S/N: resending after this anulación was rejected |
| `GeneradoPor` (E/D/T) + `Generador` | no | Who materially generated the anulación; both or neither (1224) |
| `Encadenamiento` | yes | As in the alta. Hash (previous `Huella`) |
| `SistemaInformatico` | yes | §2.2 |
| `FechaHoraHusoGenRegistro` | yes | Hash |
| `TipoHuella`, `Huella` | yes | |
| `ds:Signature` | no | |

### 4.6 Admitted operations (alta, subsanación, rechazo previo, anulación)

Sources: **[CONFIRMED]** DSREG tabs A and B; SWEB Annex II §9.1–9.2; VAL §6. The record key is `NIF + NumSerieFactura + FechaExpedicionFactura` (SWEB §3). States below are what the AEAT already holds for that key. DSREG gives the OK/ERROR columns per group of rows (merged cells); the "por rechazo" rows inherit their group's values **[INFERRED]** from that layout.

| Operation | Flags | No record at AEAT | Alta exists | Anulación exists |
|---|---|---|---|---|
| **Alta** (normal) | `Subsanacion` N/absent, `RechazoPrevio` N/absent | OK | ERROR (duplicate, 3000) | ERROR |
| **Alta por rechazo** (fix a rejected first alta) | `Subsanacion=S`, `RechazoPrevio=X` | OK | ERROR | ERROR |
| **Alta de subsanación** | `Subsanacion=S`, `RechazoPrevio` N/absent | ERROR (a record should already exist; if caused by send order, resend once the original is in) | OK: **fully replaces** the stored record | OK: **reactivates** the voided record with the new data |
| **Alta por rechazo de subsanación** | `Subsanacion=S`, `RechazoPrevio=S` | ERROR | OK (the previous subsanación was rejected) | OK |
| **Subsanación sin registro previo** (record exists only in our SIF, e.g. never sent) | `Subsanacion=S`, `RechazoPrevio=X` | OK | ERROR | ERROR |
| **Anulación** | `SinRegistroPrevio` N, `RechazoPrevio` N | ERROR | OK: voids the alta | OK: replaces the anulación data |
| **Anulación por rechazo** | `SinRegistroPrevio` N, `RechazoPrevio=S` | ERROR | OK | OK |
| **Anulación sin registro previo** (e.g. the alta was rejected and the invoice must be voided) | `SinRegistroPrevio=S`, `RechazoPrevio` N | OK: creates an anulación record | ERROR | ERROR |
| **Anulación por rechazo sin registro previo** | `SinRegistroPrevio=S`, `RechazoPrevio=S` | OK | ERROR | ERROR |

- **[CONFIRMED]** Not admitted: (`Subsanacion` N with `RechazoPrevio` S) and (`Subsanacion` N with `RechazoPrevio` X) (DSREG list L17; XSD `RechazoPrevioType`).
- **[CONFIRMED]** Every subsanación or anulación is a **new chained record** (chained to the immediately previous record of the SIF, whatever its type). The original record stays unchanged (SWEB §9.1.2, §9.2.1).
- **[CONFIRMED]** In voluntary remission, records with admissible errors ("aceptado con errores") and rejected records **must be subsanados and sent again**, unless the fix requires a rectificativa (or another ROF mechanism) or the invoice is voided (SWEB §3, "Tratamiento de los errores"; VAL §4.3.1).
- **[CONFIRMED]** Admissible errors that need subsanación: `IDType 07` recipient; wrong hash (2000); ImporteTotal or CuotaTotal outside the margin (2005, 2006); `PrimerRegistro=S` when records already exist for that SIF and NIF (2007). Admissible errors that need **no** subsanación: missing ClaveRegimen with IPSI, and `FechaHoraHusoGenRegistro` ahead of the AEAT clock (2004) (VAL §4.3.1).
- **[CONFIRMED]** There is no fixed deadline for subsanación or anulación records: "en cuanto sea posible", no maximum set (DEVFAQ §17, last bullet). The decision tree (rectificativa vs subsanación vs anulación) is in the prior note §10 and was re-checked against DEVFAQ v1.3 §17, which is unchanged in substance.

### 4.7 Response (`RespuestaRegFactuSistemaFacturacion`)

Sources: **[CONFIRMED]** XSD `RespuestaSuministro.xsd`; SWEB §6.4.4, §6.5.2.

| Field | Notes |
|---|---|
| `CSV` | Código seguro de verificación (16 chars in SWEB; `xs:string` in XSD). Returned unless every record was rejected. **"Debe ser almacenado por el SIF en el momento de alta, no podrá ser recuperado a través de consultas posteriores"** |
| `DatosPresentacion/NIFPresentador`, `/TimestampPresentacion` | Sender NIF; timestamp in the AEAT servers' time zone |
| `Cabecera` | Echo of the request header |
| `TiempoEsperaEnvio` | Seconds before the next sending (pattern `\d{0,4}`) |
| `EstadoEnvio` | `Correcto` (all correct), `ParcialmenteCorrecto` (some Incorrecto or AceptadoConErrores), `Incorrecto` (all Incorrecto) |
| `RespuestaLinea` ×0–1000 | Per record: `IDFactura`; `Operacion{TipoOperacion Alta/Anulacion, Subsanacion, RechazoPrevio, SinRegistroPrevio}`; `RefExterna`; `EstadoRegistro` (`Correcto`, `AceptadoConErrores`, `Incorrecto`); `CodigoErrorRegistro` (integer); `DescripcionErrorRegistro` (≤1500 in the XSD, ≤500 in SWEB); `RegistroDuplicado{IdPeticionRegistroDuplicado ≤20, EstadoRegistroDuplicado Correcta/AceptadaConErrores/Anulada, CodigoErrorRegistro, DescripcionErrorRegistro}` when rejected as a duplicate |

- **[CONFIRMED] SOAP Fault handling:** a `Fault` with `faultcode` `soapenv:Server` → resend. `soapenv:Client` → the message is malformed or wrong: read `faultstring` (e.g. `Codigo[4104]…`) and fix before resending. No progress, or no expected XML → resend (SWEB §5.1, §6.2.6). If no response arrives, resend until one does (FAQ-SVF, "¿Cómo se debe actuar si … no se recibe la respuesta…?").
- **[CONFIRMED]** An accepted response does not mean the records are fully valid; later validations may follow (OM art. 16.3).

### 4.8 Error catalogue (where it lives, how it is grouped)

- **[CONFIRMED]** The full list lives in `errores.properties` (ERR), grouped into three blocks (VAL §4.4):
  - **Whole submission rejected (41xx, 35xx):** schema errors (4102 missing field, 4113/4114 too many records), parsing (4103, 4138), header NIFs not identified (4104, 4105, 4107, 4115–4117), certificate problems (4108 technical, **4112 holder not obligado/colaborador/apoderado/sucesor**, 4110 apoderamientos check), header misuse (4120–4131), consulta permissions (4132, 4140), service not active or not enabled in production (4134, 4139), **4141 "acceso … suspendido temporalmente"**, UTF-8 errors (4119).
  - **Record rejected (1100–1293, 3000–3004):** field values, lists and cross-field rules (see the tables in §4.4–4.5), plus **3000 duplicate**, **3001 already voided**, **3002 record does not exist**, **3003 presenter lacks permission to update the record**, **3004 record created via form**.
  - **Accepted with errors, to be subsanado (2000–2009):** 2000 wrong hash; 2001 recipient NIF not in census; 2002/2003 previous-hash format; 2004 generation time ahead of the AEAT; 2005/2006 totals; 2007 wrong `PrimerRegistro`; 2008 previous hash equal to the current one; 2009 IPSI without clave.
- **[CONFIRMED]** VAL distinguishes structural errors (reject the message), syntactic errors (header: reject the message; record: reject only that record) and business errors (reject the record, continue with the rest) (VAL §3.1).
- **[CONFIRMED]** All NIFs are validated against the AEAT's central database (SWEB §4.1).

### 4.9 Flow control, batching, retries, incidents, idempotency

- **[CONFIRMED] Flow control (OM art. 16.2; SWEB §6.4.4.1):** the initial wait is `t` = 60 s. Each response carries an updated `TiempoEsperaEnvio`. The next sending waits until `t` seconds have passed since the previous one **or** until 1,000 records (the per-message maximum) have accumulated, whichever comes first.
- **[UNCERTAIN]** Whether `t` applies per presenter certificate, per obligado, or per SIF installation. With one-obligado-per-message (§3.1) and many Issuers, this decides whether Verifiq can send each Issuer's invoices every 60 s in parallel (Q2).
- **[CONFIRMED] Immediacy:** sending must be "instantánea". Batching until shop closing is not allowed; only flow-control waits are acceptable (FAQ-SVF, last answer). End-of-day upload from a disconnected SIF is "en diferido" and not acceptable (FAQ-REM). Issue date = record generation date = normally the sending date; exceptions are incidents or DST changes (FAQ-SVF, "Respecto a la inmediatez…").
- **[CONFIRMED] Incidents (OM art. 16.4):** if a technical incident prevents sending, send as soon as possible **respecting the generation order**. Mark `Incidencia=S` in the header of those messages. **Retry at least once an hour.** Show the user a warning that there is an incident and **how many records are pending**, from the moment it starts until none remain. Justify the incident if the AEAT asks. There is no fixed maximum delay. **Invoicing must never stop** because of a sending incident (FAQ-SVF, "si se produce un corte de energía…"). Before the services existed, records were to be "encolados … como si se tratara de una incidencia" (DEVFAQ §2).
- **[CONFIRMED] Duplicates and resends:** an alta whose key already exists is rejected with 3000. The response tells the stored record's `IdPeticion` and state (Correcta / AceptadaConErrores / Anulada) and its error, if any (SWEB §6.4.4; XSD `RegistroDuplicadoType`).
  - **[INFERRED]** This makes a blind resend after a timeout safe for the AEAT side: either it is accepted, or 3000 shows that the earlier send got through, with its state.
  - **[INFERRED]** The CSV of a send whose response was lost cannot be recovered (§4.7). The consulta returns `IdPeticion` and `TimestampPresentacion` but no CSV (XSD `DatosPresentacion2Type`).
- **[CONFIRMED]** Business validation errors do not reject the message, only the affected records (VAL §3.1).

### 4.10 Consulta (`ConsultaFactuSistemaFacturacion`), VERI*FACTU only

Sources: **[CONFIRMED]** SWEB §6.4.1–6.4.3, Annex IV; XSD `ConsultaLR.xsd`, `RespuestaConsultaLR.xsd`.

- Header: `IDVersion` plus either `ObligadoEmision` (the issuer queries its own records) or `Destinatario` (the customer queries its suppliers' records). Optional `IndicadorRepresentante=S` (representative querying records where it appears as representative).
- Filter: **`PeriodoImputacion{Ejercicio, Periodo 01–12}` is mandatory**, by operation date or else issue date. Optional: `NumSerieFactura`, `Contraparte`, `FechaExpedicionFactura` (single date or `RangoFechaExpedicion`), `SistemaInformatico` (since v1.0.2 the fields that identify a SIF are not all required), `RefExterna`, `ClavePaginacion{IDEmisorFactura, NumSerieFactura, FechaExpedicionFactura}`.
- Extra outputs: `MostrarNombreRazonEmisor` and `MostrarSistemaInformatico` (both slow the query down; the second is not allowed when querying as recipient: 1272).
- Response: `IndicadorPaginacion` S/N, `ResultadoConsulta` ConDatos/SinDatos, up to **10,000** `RegistroRespuestaConsultaFactuSistemaFacturacion`, ordered by presentation date. Each has the full record data (including `Huella`, `Encadenamiento`, `SistemaInformatico`, `NifRepresentante`, `Incidencia`, `FechaFinVeriFactu`), `DatosPresentacion{NIFPresentador, TimestampPresentacion, IdPeticion}`, and `EstadoRegistro{TimestampUltimaModificacion, EstadoRegistro Correcto/AceptadoConErrores/Anulado, CodigoErrorRegistro, DescripcionErrorRegistro}`. Paginate by sending back the last `ClavePaginacion`.
- **[INFERRED]** Rejected (`Incorrecto`) records are not returned, since they were never registered (SWEB §3). The consulta can serve to reconcile the AEAT state with ours (e.g. after timeouts), but not to recover CSVs.

### 4.11 Requerimiento (out of scope for a VERI*FACTU-only SIF)

- **[CONFIRMED]** The AEAT will not issue requerimientos for VERI*FACTU records, because it already has them (DEVFAQ §18). The requerimiento service is for non-VERI*FACTU records. It requires `RefRequerimiento` (and `FinRequerimiento=S` on the last send). Records are sent exactly as kept, without subsanación, and only NIF/IDOtro errors reject them (SWEB §10; VAL §4.3.2).

---

## 5. Record content and chaining: the hash (huella)

### 5.1 Algorithm, exactly as specified

Sources: **[CONFIRMED]** HASH §2–5; OM art. 13; DSREG; VAL §3.1.3.18, §3.1.3.23.

- **Algorithm:** SHA-256 (list L12, `TipoHuella=01`, the only value allowed today).
- **Input, alta, in this order:** `IDEmisorFactura`, `NumSerieFactura`, `FechaExpedicionFactura`, `TipoFactura`, `CuotaTotal`, `ImporteTotal`, `Huella` (= `Encadenamiento/RegistroAnterior/Huella`), `FechaHoraHusoGenRegistro`.
- **Input, anulación, in this order:** `IDEmisorFacturaAnulada`, `NumSerieFacturaAnulada`, `FechaExpedicionFacturaAnulada`, `Huella` (previous record's), `FechaHoraHusoGenRegistro`.
- **Input, event record** (non-VERI*FACTU only): `NIF` (producer, `SistemaInformatico/NIF`), `ID` (`IDOtro/ID`), `IdSistemaInformatico`, `Version`, `NumeroInstalacion`, `NIF` (`ObligadoEmision`), `TipoEvento`, `HuellaEvento` (previous), `FechaHoraHusoGenEvento`.
- **Concatenation:** `nombreCampo1=valorCampo1&nombreCampo2=valorCampo2&…`. Field names are the constant XML element names. Values are the XML content with leading and trailing spaces removed. A missing or empty field is written as `name=` with nothing after it: the first record has `…&Huella=&FechaHoraHusoGenRegistro=…`.
- **Numbers:** values with one or two decimals are treated alike, and trailing zeros do not matter (`123.1` ≡ `123.10`).
  - **[INFERRED]** Hash the exact string written into the XML, and never write it differently in the hash input. The AEAT tolerance covers only trailing zeros.
- **Encoding:** the string is encoded as UTF-8 bytes. The output is **hexadecimal, uppercase, 64 characters**, stored in `Huella` (alta and anulación) or `HuellaEvento`.
- **Always present:** even the first record carries its own `Huella`; it then has `PrimerRegistro=S` and no `RegistroAnterior` (HASH §5).
- **AEAT check:** if the hash does not match the AEAT's calculation, the record is "Aceptado con errores" (code 2000) and must be subsanado (HASH §7; VAL §4.3.1). A previous-hash value that is not 64 uppercase hex characters → warning 2002/2003. A previous hash equal to the current one → 2008 (ERR).

### 5.2 Official test vectors (reproduced and verified locally with SHA-256)

**[CONFIRMED]** HASH §6, pp. 10–12. All three outputs match a local `hashlib.sha256(s.encode('utf-8')).hexdigest().upper()` run on 2026-10-21.

1. First alta of a SIF:
   - Input: `IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00`
   - Output: `3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60`
2. Second alta:
   - Input: `IDEmisorFactura=89890001K&NumSerieFactura=12345679/G34&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60&FechaHoraHusoGenRegistro=2024-01-01T19:20:35+01:00`
   - Output: `F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97`
3. Anulación chained to (2):
   - Input: `IDEmisorFacturaAnulada=89890001K&NumSerieFacturaAnulada=12345679/G34&FechaExpedicionFacturaAnulada=01-01-2024&Huella=F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97&FechaHoraHusoGenRegistro=2024-01-01T19:20:40+01:00`
   - Output: `177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68`

### 5.3 Chaining rules

- **[CONFIRMED]** Each record (alta or anulación) contains, from the **immediately previous record by generation time**: the obligado's NIF, series+number, issue date, and the first 64 characters of its hash. The only exception is the first record since installation or initial start-up (`PrimerRegistro=S`) (OM art. 7.a–b; RRSIF art. 10.1.ñ, 11.2.e).
- **[CONFIRMED]** For a given obligado, each SIF produces **one single chain** containing altas, anulaciones and subsanaciones. Altas and anulaciones are not chained separately. Year changes and series changes do not restart the chain (OM art. 7.c–d; FAQ-TRAZ; FAQ-SVF on ERP modules: one chain across all series).
- **[CONFIRMED]** Records must be generated in the chronological order in which invoices are issued. "Basta con que el sistema SOLO admita la generación de los RFs por el orden cronológico en que se encolen" (DEVFAQ §15.4).
- **[CONFIRMED]** The previous-record NIF normally equals the current one. It may differ only in exceptional cases such as a NIF change after a merger (DSREG tab 2, `RegistroAnterior/IDEmisorFactura`).
- **[CONFIRMED]** The AEAT flags `PrimerRegistro=S` when records already exist "con el obligado emisión y el sistema informático actual" (ERR 2007; VAL §4.3.1).
- **[CONFIRMED]** Dates: `FechaHoraHusoGenRegistro` uses the SIF's time zone at generation, with offset, ISO 8601 (DSREG). The generation time must be exact to the minute only in non-VERI*FACTU (OM art. 7.f exempted by art. 3; FAQ-TRAZ). `TimestampPresentacion` in the response is in the AEAT servers' time zone (SWEB §2.6).
- **[CONFIRMED]** Subsanación and anulación records may be generated from a SIF other than the one that issued the original invoice (DEVFAQ §17, bullet on 2.b and 2.d).

---

## 6. Invoice-side requirements

### 6.1 QR code and legend

Sources: **[CONFIRMED]** OM arts. 20–21; ROF arts. 6.5 and 7.5; QR §2–7, §12; FAQ-QR.

- **Size and standard:** 30×30 to 40×40 mm, ISO/IEC 18004 (QR v0.5.0 cites ISO/IEC 18004:2015), error-correction level **M** (OM art. 21.1; QR §2).
- **Content:** a URL with exactly four parameters (QR §5–6):
  - `nif`: issuer NIF, 9 chars;
  - `numserie`: series+number, ≤60, ASCII 32–126;
  - `fecha`: issue date `DD-MM-AAAA`;
  - `importe`: total amount with "." as decimal separator, ≤12 integer digits and 2 decimals.
- **URLs:**
  - Production: `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=…&numserie=…&fecha=DD-MM-AAAA&importe=…`
  - Test: `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?…`
  - Parameter values are URL-encoded in UTF-8 (e.g. `&` → `%26`) (QR §4).
- **Optional parameters of the cotejo service** (QR §7, new in v0.5.0):
  - `idioma` = gl, ca, eu, es, va, en (default es);
  - `formato=json` for machine responses. `formato` **must never be put in the QR URL**.
- **Cotejo JSON responses:** `status` OK/KO, `mensaje`, `respuesta.resultado`:
  - `00` "Encontrada";
  - `01` "No encontrada" (also for **voided** invoices);
  - `02` "No contrastable" (non-VERI*FACTU).
  - Error codes 1001–1004 (missing parameter), 2001–2006 (format), 3001 (technical), 3002 (daily attempt limit reached, blocked) (QR §9–10; revision 0.4.6).
- **Placement:**
  - At the start of the invoice, before the content the SIF generates, and the first QR on it. On the first page only.
  - Portrait: top, preferably centred, otherwise top-left. Landscape: left, preferably top-left.
  - At least 2 mm blank margin all round (6 mm recommended), high contrast.
  - On an A4 page, issuer, logo or recipient data beside the QR is compatible (QR §3; §12 example i).
- **Texts:**
  - **«QR tributario:»** above the QR, preferably centred.
  - For VERI*FACTU, **«Factura verificable en la sede electrónica de la AEAT»** or **«VERI*FACTU»** just below it, on several lines if needed.
  - Both in a font size **equal to or larger than** the rest of the invoice data (QR §3; OM art. 20.1.b says "similares").
- **Structured e-invoices:** include the QR URL as a separate field instead of the image. A PDF invoice prints the QR as on paper (OM art. 20.2; FAQ-QR). The hash is not part of the QR (FAQ-HASH, last question).
- **Customisation:** letting the user move the QR within the top area is fine. Letting them omit it is not (DEVFAQ §9).

### 6.2 What an autónomo issuing ordinary invoices needs

- **[CONFIRMED] Invoice types (L2):**
  - F1: complete invoice (ROF arts. 6, 7.2, 7.3);
  - F2: simplified invoice, or one without recipient identification (art. 6.1.d);
  - F3: issued in substitution of declared simplified invoices;
  - R1: art. 80 Uno, Dos and Seis LIVA and error fundado en derecho;
  - R2: art. 80.3 (concurso);
  - R3: art. 80.4 (uncollectable debts);
  - R4: other;
  - R5: rectification of simplified invoices (DSREG L2).
- **[CONFIRMED] Rectificativas:**
  - **Por diferencias (I):** one record with the correction amounts, which may be negative. `ImporteTotal` = the correction's total. No `ImporteRectificacion`. `FacturasRectificadas` optional. Example: base −200, cuota −42, total −242 (FAQ-PROC; VAL rows 6, 9).
  - **Por sustitución (S):** final amounts plus `ImporteRectificacion` (base and cuota rectified). Two options are described (FAQ-PROC).
  - The **operation date of a rectificativa** is the original invoice's operation date. When several invoices are rectified, use the latest one's (FAQ-PROC).
  - Rectificativas need their own series (prior note §11; ROF art. 6.1.a).
- **[CONFIRMED] Typical breakdown for a Spanish autónomo with VAT:** `Impuesto` 01 (or omitted), `ClaveRegimen` 01 (07 if criterio de caja), `CalificacionOperacion` S1, `TipoImpositivo` 21/10/4/0, base and cuota (VAL §15; SWEB §9.1.1.1 example). Exempt health services: `OperacionExenta` E1 (art. 20 LIVA) with no rate or cuota; `ClaveRegimen` 01 does not allow E2/E3 (VAL §15.5; ERR 1199, 1238). At most 12 breakdown lines (XSD `DesgloseType`).
- **[CONFIRMED] IRPF withholding is not part of the record**: "no es uno de los elementos constitutivos de la factura". `ImporteTotal` = base + cuota (+ recargo), and the QR shows that figure. The AEAT recommends printing both "Importe total factura" and "Total a pagar", clearly labelled. The cotejo service explains this to recipients (DEVFAQ §20; FAQ-ALTA). Suplidos are also outside the record and the total (DEVFAQ §21–22).
- **[CONFIRMED] Numbers are never reused.** After an anulación, an alta with the same key is a duplicate. A replacement invoice needs "un número de factura o fecha de expedición diferente". The voided invoice keeps its number in the series (DEVFAQ §6; FAQ-PROC; FAQ-ANUL).
- **[CONFIRMED] Test or training invoices made with a production SIF are real.** They must be voided (anulación sent). A dedicated series such as "PRU 25 XXXX" with automatic voiding is suggested. Drafts and proformas are not records, but must be kept unaltered (DEVFAQ §11).

---

## 7. Event log and XAdES signature (non-VERI*FACTU), briefly: what we avoid

- **[CONFIRMED] Signature:** every alta, anulación and event record must be signed with **XAdES Enveloped (ETSI EN 319 132), class EPES**, with the AGE signature policy:
  - OID `urn:oid:2.16.724.1.3.1.1.2.1.9`, URL `https://sede.administracion.gob.es/politica_de_firma_anexo_1.pdf`, policy digest SHA-1 `G7roucf600+f03r/o0bAOQ6WAs0=`;
  - RSA with SHA-256 (RSA/SHA-256 or RSA/SHA-512 preferred), key ≥ 1024 bits; no timestamp required;
  - signing the `RegistroAlta`, `RegistroAnulacion` or `RegistroEvento` node, never the parent nodes; the signature goes in its `Signature` child;
  - a qualified certificate of the obligado or of an authorised representative (apoderado or colaborador social) (SIGN §2–6; OM art. 14).
- **[CONFIRMED] Event log:** detect and record:
  - start and end of non-VERI*FACTU operation;
  - anomaly-detection runs and anomalies found, for both record kinds;
  - backup restores;
  - exports.
  Also a **summary event at least every 6 hours of operation and on shutdown**. Events are themselves hashed, chained, signed, kept and exportable (OM art. 9; DSREG tab 4; XSD `EventosSIF.xsd`).
- **[CONFIRMED] Other non-VERI*FACTU duties:**
  - on-demand checks of hash, signature and chain;
  - integrity alarms;
  - forward and backward chain navigation;
  - a mandatory chain and time check before each new record;
  - clock exact to ±1 minute;
  - conservation for the LGT period;
  - export by period (OM arts. 6–8; DEVFAQ §15).
- **[CONFIRMED]** The QR then uses `ValidarQRNoVerifactu`, and the invoice must not carry the VERI*FACTU legend (QR §5.2; ROF art. 6.5.b).
- **[CONFIRMED]** A test-only service validates non-VERI*FACTU records (format and business rules, not signatures): NOVF v0.2.

---

## 8. Testing and certification

- **[CONFIRMED] No AEAT certification or homologation.** It is a self-certification by DR. No external body, no prior registration (FAQ-DR). Producers may later be asked for the information needed to verify compliance (RRSIF art. 14.3).
- **[CONFIRMED] Test environment** (PRE):
  - Hosts `prewww1.aeat.es`, `prewww2.aeat.es` and `prewww10.aeat.es` (sello), equivalent to their production counterparts. Free to use "con la única condición de autenticarse mediante un certificado electrónico".
  - Data has no tax effect. Only occasional tests: no mass tests, no validations built into production flows, abuse may be blocked.
  - The VERI*FACTU section links to a browser **web-service test client** (`https://prewww1.aeat.es/static_files/common/internet/dep/explotacion/ws/ClienteWSAEAT_OPC.html?OPC=/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/opciones.js`), the AEAT invoicing app and the record query, all certificate-based.
- **[INFERRED]** Test records still go through NIF census validation (SWEB §4.1). The prior note also recorded that the test environment rejects unregistered NIFs (prior note §4, Verifacti source, secondary for this point). Test data must use real NIFs in the census (our own, or Issuers that authorise it). How representation or apoderamiento is checked in the test environment is unknown (Q7).
- **[CONFIRMED] Conformance aids available:** the official hash vectors (§5.2); the AEAT's own hash check, which returns 2000 on mismatch; full XSDs; the error list; XML examples for every operation (SWEB Annex II–IV); a signature example ZIP (non-VERI*FACTU only); and the non-VERI*FACTU validation service. No official conformance suite exists. **[CONFIRMED]** (DEV index; SWEB; SIGN; NOVF).
- **[CONFIRMED]** A developers' contact page and periodic meetings exist. The 19/10/2026 meeting agenda shown concerns informative returns, not VERI*FACTU (DEV "Reuniones"; announcement of 29/09/2026). No VERI*FACTU-specific announcement appeared on the developer notice board between 12/2025 and 10/2026, other than an SII field on 22/12/2025 (DEV "Tablón de anuncios", monthly pages).

---

## 9. Deadlines and status as of 2026-10-21

| Who | Date | Source |
|---|---|---|
| Producers and sellers (art. 3.2): offer only adapted products | **29/07/2025** (9 months from the OM's entry into force on 29/10/2024; unchanged by RDL15) | RRSIF DF 4ª as amended by RDL15; DEVFAQ §1 |
| AEAT reception services | In production since **23/04/2025** | DEVFAQ §1–2 |
| IS taxpayers (art. 3.1.a) | before **1/1/2027** | RDL15 DF 1ª; FAQ-OBJ (21/10/2026); NOTA-AEAT |
| Everyone else in art. 3.1 (**autónomos**) | before **1/7/2027** | same |
| Multi-year maintenance contracts | adapted by the user dates above | RRSIF DF 4ª |

- **[CONFIRMED] History:** the original date was 1/7/2025. RD 254/2025 moved it to 1/1/2026 and 1/7/2026. RD-ley 15/2025 (BOE 03/12/2025, in force 04/12/2025, **convalidated** by Resolución de 11/12/2025, BOE-A-2025-25695) moved it to 1/1/2027 and 1/7/2027 (RRSIF consolidated; RDL15 "Referencias posteriores").
- **[CONFIRMED] Announced, not yet law:** the Ministry of Finance press note of **05/10/2026** says the pending obligations of RD 1007/2023 will be postponed **"hasta octubre de 2028"**, matching mandatory e-invoicing for businesses with turnover ≤ €8M. A later amendment will seek convergence of scope and technical aspects with ViDA. The integrity, conservation, accessibility, legibility, traceability and inalterability requirements "se mantendrán en términos sustancialmente equivalentes" (NOTA-MH). SEDE-ROOT links it as "Previsión de ampliación del plazo".
- **[CONFIRMED]** As of 21/10/2026 the BOE shows no further amendment of RD 1007/2023 (last consolidated update 03/12/2025; "Referencias posteriores" lists only RD 254/2025 and RDL15). The AEAT FAQ pages updated on 21/10/2026 still give 1/1/2027 and 1/7/2027 (FAQ-OBJ; FAQ-SVF).
- **[INFERRED]** The producer duty (offer only adapted products) has applied since 29/07/2025 and is not affected by the announced postponement, which speaks of obligations "pendientes" for businesses. A postponement would widen the window to migrate off Verifacti before autónomos must comply. The announced "convergence" amendment may change technical aspects, so it is a risk for anything built now (Q8).

---

## 10. Other relevant answers from the FAQs and PDFs

- **[CONFIRMED]** Multi-component architectures (TPV/back-office, CPF plus API CF) are admitted if:
  - the connection is **indefectible** (always happens, not the user's choice) and immediate;
  - data is not altered;
  - components are coordinated on AEAT responses;
  - there are **no orphan invoices without records, no records without invoices**, and in VERI*FACTU **no generated records left unsent** (DEVFAQ §5).
- **[CONFIRMED]** Importing invoices issued by another SIF: their records remain the other SIF's responsibility; never re-send or re-QR them (DEVFAQ §10).
- **[CONFIRMED]** Two disconnected billing centres are two SIFs with independent chains, and may even use different modes. Not recommended, because the AEAT's lists become incomplete (FAQ-REM; FAQ-SVF).
- **[CONFIRMED]** Planned AEAT services: download of all records sent by an obligado, and of those received from VERI*FACTU suppliers. Help with the libro registro (FAQ-SVF; DEVFAQ §13.2).
- **[CONFIRMED]** Since v1.1.3 to v1.1.4 of VAL, the character restrictions apply only to `NumSerieFactura` (VAL revision table). VAL keeps changing mostly for IGIC and IPSI (claves 18–21, E5 to E8). An IPSI rule turns from warning to rejection on 01/01/2027 (VAL §15.6).
- **[CONFIRMED]** SWEB revision history: v1.0.0 (20/02/2025) added requerimiento, consulta, `RefExterna` filter and `MostrarSistemaInformatico`. v1.0.1 (23/04/2025) published production URLs. v1.0.2 (16/07/2025) changed the SIF filter in the consulta. v1.0.3 (28/07/2025) fixed the size of `IdPeticionRegistroDuplicado` (SWEB revision table).
- **[CONFIRMED]** DEVFAQ v1.3 changes: RDL15 dates; a summary of multi-CF architectures in §5; lottery tickets treated as suplido in §22 (DEVFAQ p. 2).
- **[UNCERTAIN]** Census checks of recipient NIFs before issuing (Verifacti's `validar_nif` today) are not part of the VERI*FACTU services. The AEAT has separate NIF-checking web services that this research did not cover (Q9).

---

## 11. Index of official documents found

| Document | Version / date | URL |
|---|---|---|
| Información técnica (sede index) | page 13/10/2026 | https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/informacion-tecnica.html |
| Developer documentation index | — | (DEV, see Key sources) |
| Descripción de servicios web (ES / EN) | v1.0.3, 28/07/2025 | https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Veri-Factu_Descripcion_SWeb.pdf · `…_EN.pdf` |
| Diseños de registro (XLSX) | v1.0, 28/10/2024 | https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/DsRegistroVeriFactu.xlsx |
| Validaciones y errores | v1.2.2, 08/04/2026 | https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Validaciones_Errores_Veri-Factu.pdf |
| Lista de códigos de error | file of 2026 (no version) | `…/tikeV1.0/cont/ws/errores.properties` |
| Huella o hash | v0.1.2, 27/08/2024 | https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Veri-Factu_especificaciones_huella_hash_registros.pdf |
| Código QR y cotejo | v0.5.0, 10/12/2025 | https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/DetalleEspecificacTecnCodigoQRfactura.pdf |
| Firma electrónica de registros + ZIP of examples | v0.1.5, 06/03/2025 | https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Espec-Tecnicas/EspecTecGenerFirmaElectRfact.pdf · `…/AnexosEjemplosFirmaRegFact.zip` |
| Validación de registros no verificables | v0.2, 17/09/2025 | https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Descripcion_ServicioWeb_ValidacionNoVerifactu.pdf |
| Aclaraciones a dudas de los desarrolladores | v1.3, 04/12/2025 | https://sede.agenciatributaria.gob.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/FAQs-Desarrolladores.pdf |
| Ejemplos de declaraciones responsables | V0.5.1 (sede) / undated dev copy | https://sede.agenciatributaria.gob.es/static_files/Sede/Tema/IVA/Verifactu/EjemplosDeclaracionResponsable(V0.5.1).pdf · https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/EjemplosDeclaracionResponsable.pdf |
| WSDL `SistemaFacturacion.wsdl` | — | `…/tikeV1.0/cont/ws/SistemaFacturacion.wsdl` (prewww2 / www2) |
| XSDs: SuministroLR, SuministroInformacion, RespuestaSuministro, ConsultaLR, RespuestaConsultaLR, EventosSIF, RespuestaValRegistNoVeriFactu | production files Last-Modified 11/01/2026 | `…/tikeV1.0/cont/ws/<name>.xsd` |
| VERI*FACTU FAQ (sede, 18 pages) | "Actualizadas a 21 de octubre de 2026" | https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes.html |
| Nota informativa ampliación de plazo | page 13/10/2026 | (NOTA-AEAT) |
| Ministerio de Hacienda press note | 05/10/2026 | https://www.hacienda.gob.es/sgt/gabsehacienda/nota-informativa-verifactu.pdf |
| Folleto VERI*FACTU | 2027 dates | https://sede.agenciatributaria.gob.es/static_files/Sede/Biblioteca/Folleto/VERIFACTU/Folleto_VERIFACTU_es_es.pdf |
| Representation forms Anexos I–III (PDF) and "Modelo de representación para el suministro electrónico de registros de facturación" | 16/09/2026 page | (CS-MOD) `…/static_files/Sede/Procedimiento_ayuda/ZC01/Mod/Anexo_I_mod_otorg_prof_trib.pdf` etc. |
| RD 1007/2023 (RRSIF) | consolidated 03/12/2025 | https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840 |
| Orden HAC/1177/2024 | consolidated 28/10/2024 | https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138 |
| RD 254/2025 | BOE 02/04/2025 | https://www.boe.es/buscar/doc.php?id=BOE-A-2025-6600 |
| RD-ley 15/2025 + convalidación | BOE 03/12/2025; Res. 11/12/2025 | https://www.boe.es/buscar/doc.php?id=BOE-A-2025-24446 |
| Resolución 18/12/2024 (representation forms) | BOE 31/12/2024 | https://www.boe.es/buscar/act.php?id=BOE-A-2024-27600 |
| RD 1619/2012 (ROF) | consolidated | https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696 |
| LGT arts. 29.2.j, 201 bis | consolidated 21/12/2024 | https://www.boe.es/buscar/act.php?id=BOE-A-2003-23186 |
| Portal de Pruebas Externas | — | https://preportal.aeat.es |

Not accessed or not read in full: the Informador VERI*FACTU tool (https://www2.agenciatributaria.gob.es/wlpl/AVAC-CALC/InformadorVerifactu); the 2024 seminar presentation PDF (Present-VeriFactu-SeminarioEEDD-DDII.pdf); the content of the signature-example XMLs (listed only, not needed for VERI*FACTU); the colaboración social "tipos de acuerdo" page; and the apoderamiento trámite catalogue (needs login).

---

## 12. Open questions to put to the AEAT

1. **SIF change and chain:** when an Issuer moves from Verifacti-generated records to records generated by Verifiq's own exchange, is this a new SIF (new `NumeroInstalacion`, `PrimerRegistro=S`, no 2007 warning), or must the new chain continue from the last Verifacti record? What does the AEAT use as "el sistema informático actual" in error 2007? What did Verifacti put in `SistemaInformatico` for our records (its data or ours as CPF)?
2. **Flow control scope:** does `TiempoEsperaEnvio` apply per presenter certificate, per obligado, or per SIF installation? Can a colaborador social send several Issuers' messages in parallel, each respecting its own `t`?
3. **IndicadorMultiplesOT / OM art. 2.d in a SaaS where each User acts for exactly one Issuer:** is `IndicadorMultiplesOT=N` correct for all records? Is the "varios obligados" message required for the whole SaaS, or only for users with several billings?
4. **Convenio 017 eligibility:** can a natural-person producer (autónomo) sign it, or only a legal entity (the file requires the bylaws' corporate purpose)? What is the timeline, and are there technical or volume requirements?
5. **Consulta permissions:** does colaboración social (Anexo I) allow `ConsultaFactuSistemaFacturacion` for the Issuer, or does it need an apoderamiento (errors 4132, 4140)? Which apoderamiento trámite codes cover sending and querying?
6. **Certificates:** which certificate types are accepted on `www1` vs `www10` (sello)? Can an entity electronic-seal certificate be used for colaboración social submissions?
7. **Test environment:** must representation or apoderamiento exist (or be simulated) for third-party NIFs in `prewww1`? Are there test NIFs, or must real census NIFs be used? Is there a usage quota beyond "no pruebas masivas"?
8. **Postponement:** when and with what instrument will the October 2028 postponement be approved? Will the announced "convergence" change the record format, the XSD version (`IDVersion`) or the QR?
9. **Census checks:** which AEAT service should a SIF use to check recipient NIFs before issuing (to avoid 1193 and 2001), and does it accept colaborador-social certificates acting for the Issuer?
10. **Representation by online signature:** does an eIDAS art. 26 advanced signature produced in a remote-identification flow inside our app (no qualified certificate) satisfy FAQ-CS for Anexo I, and what evidence must we keep?
11. **CSV after a timeout:** if a send was registered but the response was lost, is there any way to obtain its CSV, or is `IdPeticion` (from the consulta or from 3000 `RegistroDuplicado`) enough as proof?
12. **Voided-record reactivation:** confirm that an "alta de subsanación" over a voided record (DSREG tab A, OK(5)) reactivates the invoice, and whether a SIF should ever allow it.

---

## 13. Implications for Verifiq (short)

- **Port stays, adapter changes** (ADR 0001). A direct adapter would replace `createIssuerKey`, `startRepresentationSigning`/`representationStatus` and `validateTaxId`, which are Verifacti account operations with no AEAT equivalent. Representation becomes our own flow: Anexo I signed online and kept by us, or Issuer self-service apoderamiento. The census check needs another AEAT service (Q9).
- **Sync vs async:** the AEAT answers synchronously, but flow control (60 s / 1,000 records, one Issuer per message) means an outbox and queue per Issuer remain. `submitRecord` → `QueuedRecord` and webhook-style results could stay as they are at the port. `readResultsDelivery` (Verifacti webhook) disappears.
- **What Verifiq would have to own:**
  - hash and chain per Issuer, serialised in generation order. This fits ADR 0002: number and InvoiceRecord created in one transaction under a per-Series lock, but the chain lock is per Issuer, not per Series;
  - XML building and validation against the XSDs;
  - the QR image and URL (Verifacti returns them today);
  - CSV, `IdPeticion`, timestamps and full response storage;
  - incident handling: `Incidencia=S`, hourly retry, "N pending" warning;
  - SOAP Fault classification;
  - mapping AEAT codes into `record-rejections`.
- **Domain fit is good:** `Amendment` maps to `Subsanacion=S` + `RechazoPrevio` N/S/X, and `PreviousRejection` none/record/amendment already mirrors N/X/S. `Voiding.notRegistered` maps to `SinRegistroPrevio`, `previouslyRejected` to `RechazoPrevio=S`. `RecordInvoiceType` F1/R1–R4 by differences, `withholding` outside the record, and `totalAmount` vs `amountDue` already match the AEAT rules.
- **New identity data:** `IdSistemaInformatico` (2 chars), product name, version (per release, with a DR per version, shown in-app and published), and one `NumeroInstalacion` per Issuer, never reused. The DR must drop the Verifacti CF reference.
- **Migration risk:** existing Issuers' chains live under Verifacti's SIF data. The switch needs an AEAT answer on chain continuity (Q1) and a cut-over that leaves no record unsent (no orphans).
- **Timing:** the binding user date is still 1/7/2027 for autónomos. A postponement to October 2028 is announced but not law (§9).

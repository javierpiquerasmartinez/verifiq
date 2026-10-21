# Representation without the online signature: manual/certificate signing, NIE and foreign passports

Researched 2026-10-21. Primary sources only, unless a source is marked otherwise. Each fact cites its URL.
Tags: **[CONFIRMED]** means read directly in a primary source. **[INFERRED]** means a reasoned conclusion. **[UNCERTAIN]** means it needs checking with the vendor or AEAT.

Question: the pilot Issuer (Moroccan national, Spanish NIE) cannot finish Verifacti's online signature. Verifacti support says the Representation can also be signed by hand: download the PDF through the API, sign it, upload it. Is that real, and how does it work?

Key sources:

- Verifacti NIF / Representación API, rendered OpenAPI (the page embeds the full spec, including the request bodies, responses and code samples that the rendered tables omit): https://www.verifacti.com/nifs-docs
- Verifacti Postman collection for the NIF API (linked from nifs-docs): https://storage.googleapis.com/verifacti_non_sensitive/postman_nifs.json
- Verifacti "Firma online del modelo de representación" walkthrough: https://www.verifacti.com/firma-online
- Verifacti FAQ, section "Certificados y representación": https://www.verifacti.com/preguntas-frecuentes
- Verifacti quick guide, §6 "Gestionar modelo de representación": https://www.verifacti.com/guia-rapida
- AEAT VERI*FACTU FAQ, "Colaboración social": https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/colaboracion-social.html
- Resolución de 18 de diciembre de 2024 (DG AEAT), standard representation forms for sending invoicing records (BOE 31/12/2024): https://www.boe.es/buscar/act.php?id=BOE-A-2024-27600 (text: https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-27600)
- Orden HAC/1177/2024, art. 5: https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138

---

## 1. What Verifiq does today

- **[CONFIRMED]** Verifiq only implements the online signature. The port (`apps/api/src/verifactu/connector.ts`) has two Representation operations: `startRepresentationSigning(issuer, signer)` and `representationStatus(issuer)`. There is no generate, upload, download or cancel operation.
- **[CONFIRMED]** The Verifacti adapter (`apps/api/src/verifactu/verifacti-connector.ts`) calls, always with the account key (`vfn_…`):
  - `POST /representacion/firma_remota/{nif}` with JSON `{nombre, apellidos, municipio, calle, numero, email, idioma: 'es'}` and reads `url` from the response.
  - `GET /representacion/estado/{nif}` and translates `estado` (`Correcto → signed`, `Pendiente → pending`, `Caducado → expired`, `Inexistente → none`, plus `Rechazado`/`Cancelado`), taking `url` while pending.
- **[CONFIRMED]** The domain (`packages/domain/src/representation.ts`) exposes `not-required | not-started | pending | signed | error` with errors `rejected | expired | cancelled | issuer-not-accepted`. The signer schema has no ID-document field.
- **[CONFIRMED]** The UI (`apps/web/src/ui/RepresentationPanel.tsx`) tells the user to verify their identity "con tu DNI" and to type their name "tal como aparecen en tu DNI". Nothing tells a NIE holder to choose the passport. Issue 06 (`.scratch/verifiq-mvp/issues/06-firma-de-la-representacion.md`) records the same scope.

## 2. Findings

### a. Download the unsigned PDF: yes

- **[CONFIRMED]** `POST /representacion/generar/{nif}` returns the pre-filled "documento de otorgamiento de representación". Request is `application/json`. Response `200` is `application/pdf` (binary) with `Content-Disposition: attachment; filename="modelo_representacion.pdf"`. `400` means invalid input or a correct Representation already exists for the NIF (https://www.verifacti.com/nifs-docs, operation `post__representacion_generar_nif_`).
- **[CONFIRMED]** Body fields: `tipo_entidad` (`fisica` | `juridica`). For a persona física, `nombre` ("Nombre y apellidos del emisor"), `municipio`, `calle`, `numero`. For a persona jurídica, `nombre_entidad`, `municipio_entidad`, `calle_entidad`, `numero_entidad`, `nombre_representante`, `nif_representante`, `municipio_representante`, `calle_representante`, `numero_representante` (same source).
- **[CONFIRMED]** The docs warn that the downloaded document must not be modified, only signed (same source, description of `generar`).
- **[CONFIRMED]** The same PDF is also downloadable from Verifacti's web app, on the company page, under Configuración → Representación (https://www.verifacti.com/guia-rapida §6; https://www.verifacti.com/preguntas-frecuentes).
- Note: `GET /representacion/descargar/{nif}` is something else. It downloads the **signed** PDF already on file and returns JSON `{url}`, a link valid for 15 minutes; `404` if no PDF exists (https://www.verifacti.com/nifs-docs).

### b. Upload a signed PDF: yes, but publicly documented only for certificate signatures

- **[CONFIRMED]** `POST /representacion/enviar/{nif}`, `multipart/form-data`, one file part named **`file`** (the PDF). Every code sample uses `--form 'file=@"/ruta/pdf.pdf"'` or `form.append('file', blob, 'archivo.pdf')`. The Postman collection agrees (`formdata`, key `file`) (https://www.verifacti.com/nifs-docs; https://storage.googleapis.com/verifacti_non_sensitive/postman_nifs.json). Only PDF is accepted (https://www.verifacti.com/preguntas-frecuentes, "¿Qué formatos de archivo se admiten…?").
- **[CONFIRMED]** Response `200` is JSON `{estado, error?}` with `estado` ∈ `Correcto | Rechazado | Inexistente`, and `error` carries the reason when `Rechazado`. `400` is `{error}`, e.g. "Falta adjuntar fichero PDF". `500` covers a failure processing the PDF. Once an accepted document is on file it cannot be re-sent (https://www.verifacti.com/nifs-docs).
- **[CONFIRMED]** Verifacti documents this path as **"Método 2: Certificado electrónico (gratuito)"**: the issuer signs the PDF with a citizen certificate (.p12/.pfx, e.g. FNMT, Izenpe). "La firma se valida de forma programática" and Verifacti checks that the NIF in the document matches the NIF in the certificate (https://www.verifacti.com/nifs-docs, tag "Modelo de representación"). The FAQ suggests AutoFirma or Adobe Acrobat for signing (https://www.verifacti.com/preguntas-frecuentes).
- **[UNCERTAIN]** A **handwritten** signature (print, sign, scan, plus an ID copy) is not mentioned anywhere in Verifacti's public docs, FAQ, quick guide or the online-signature page. The docs name exactly two methods: online signature and electronic certificate.
  - **[INFERRED]** A scanned PDF has no digital signature, so the automatic check behind `enviar` will most likely answer `Rechazado`.
  - **[CONFIRMED]** The FAQ does name a manual fallback: if you believe your model is valid, contact soporte@verifacti.com "para que puedan revisarlo y aprobarlo manualmente" (https://www.verifacti.com/preguntas-frecuentes, "¿Qué debo verificar si mi certificado digital no es reconocido o aceptado?").
  - **[INFERRED]** Support's answer probably means: upload the handwritten PDF through `enviar` (or by email), and they approve it by hand. Upload format, where the ID copy goes, and how approval is signalled are all undocumented.
- **[UNCERTAIN]** The `enviar` multipart has no documented field for an ID document (NIE/TIE/passport copy). The ID copy would have to go inside the same PDF (as extra pages), or by email to support.

### c. Online signature: accepted ID documents and provider

- **[CONFIRMED]** It is available only to personas físicas whose NIF is a DNI or NIE. Otherwise `firma_remota` returns `400` ("el NIF no es un DNI/NIE") (https://www.verifacti.com/nifs-docs).
- **[CONFIRMED]** Identity is verified with **DNI or passport, not with the NIE card**. A holder whose NIF is a NIE can still sign, but must identify with their **passport** (in the ceremony: "deben seleccionar Pasaporte"). In every case "el nombre verificado durante la firma debe corresponder al titular del NIF según la AEAT; si no coincide, la firma se rechaza", and the state becomes `Rechazado` (https://www.verifacti.com/nifs-docs, `firma_remota` description; https://www.verifacti.com/firma-online step 3; https://www.verifacti.com/preguntas-frecuentes, "El titular del NIF tiene un NIE, ¿puede firmar online?").
- **[CONFIRMED]** Provider: **Namirial**. Its eSignAnyWhere signing URLs (`https://saas.esignanywhere.net/workstepredirector/go#...`) appear in the spec examples. Namirial performs the identity check: document recording, a selfie with liveness check, then automatic matching (https://www.verifacti.com/firma-online step 5; https://www.verifacti.com/nifs-docs). The privacy FAQ lists "Ivnosys/Signaturit y Namirial" as processors for identity verification (https://www.verifacti.com/preguntas-frecuentes).
- **[UNCERTAIN]** Verifacti publishes no list of accepted foreign passports and no limitation specific to Moroccan passports. Two plausible causes for the pilot's failure, neither confirmed:
  1. Namirial's document check may not support that passport model.
  2. The name read from the passport (Latin transliteration, order of surnames) may not match the name in the AEAT census for the NIE, which Verifacti documents as a cause of `Rechazado`.
  The `estado` response plus its `error` text should tell which one happened.
- **[CONFIRMED]** Cost and lifecycle: €2.90 + IVA per process, charged at creation even if the signer never finishes. The process expires after 28 days. `GET /representacion/estado/{nif}?refresh=true` re-issues the link without a new charge. The response also returns `fecha_expiracion` and `firma_remota: true` while pending (https://www.verifacti.com/nifs-docs; https://www.verifacti.com/preguntas-frecuentes). Verifiq does not read `fecha_expiracion` today.

### d. After the upload: validation, states, interaction with a pending online signature

- **[CONFIRMED]** For certificate-signed PDFs, validation is synchronous and programmatic: the `enviar` response already returns `Correcto` or `Rechazado` + `error` (https://www.verifacti.com/nifs-docs). From then on, `GET /representacion/estado/{nif}` reports the state: `Correcto | Rechazado | Pendiente | Caducado | Cancelado | Inexistente` (same source).
- **[CONFIRMED]** No webhook exists for Representation events. Webhooks cover only invoicing records (https://www.verifacti.com/nifs-docs, tag "Webhooks"). Polling `estado` is the only signal.
- **[UNCERTAIN]** For a handwritten PDF reviewed by support, the docs give no review time, no intermediate state, and no answer to whether a support approval flips `estado` to `Correcto`. That it does is **[INFERRED]**: `Correcto` is the only state that unlocks production.
- **[CONFIRMED]** `PUT /representacion/cancelar/{nif}` cancels the Representation **and any online signature in progress**. It returns `{estado: "Cancelado"}`, and the €2.90 is not refunded (https://www.verifacti.com/nifs-docs).
- **[UNCERTAIN]** Whether `enviar` or `generar` is refused while an online signature is `Pendiente`. `generar` documents `400` only for an existing *correct* Representation, and `enviar` documents no conflict at all. The safe order is **[INFERRED]**: cancel any pending/rejected online process first, then generate and upload.
- **[CONFIRMED]** One Representation covers the NIF across test and prod, and across AEAT and the three Basque haciendas (https://www.verifacti.com/preguntas-frecuentes).

### e. AEAT side: is a handwritten signature valid?

- **[CONFIRMED]** Yes. A third party may send records on the taxpayer's behalf under arts. 79–81 RGAT and Orden HAC/1398/2003 (colaboración social) (Orden HAC/1177/2024 art. 5, https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138). The valid forms are those approved by the Resolución de 18 de diciembre de 2024 (Anexo I is direct representation to the software company).
- **[CONFIRMED]** According to the AEAT, the forms may be signed **"de forma manuscrita, aportando en este caso copia de su DNI si fuera persona física"**. They may also be signed electronically, with a qualified certificate or an eIDAS art. 26 advanced signature. Acceptance of terms of service is not valid (https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/colaboracion-social.html).
- **[CONFIRMED]** For foreigners, the form's footnote reads "(1) DNI o documento equivalente de identificación de personas extranjeras". So a NIE/TIE card or passport copy satisfies the ID-copy requirement. The representative "responde de la autenticidad de la firma" and only shows the document when the AEAT asks for it (https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-27600, Anexo I).
- **[INFERRED]** At the AEAT level, nothing blocks a handwritten Representation for a NIE holder. The constraint is Verifacti's: its automatic check only knows certificate signatures and Namirial ceremonies.

## 3. Questions for Verifacti support

1. For a handwritten signature: should we upload the scanned PDF through `POST /representacion/enviar/{nif}` (field `file`), or email it to soporte@verifacti.com? Should the copy of the NIE/TIE/passport be appended as extra pages of the same PDF?
2. What does `enviar` return for a handwritten PDF: `Rechazado` until a person reviews it, `Pendiente`, or something else? And once approved, does `GET /representacion/estado/{nif}` show `Correcto`?
3. How long does manual review take? Is there an email or any signal on approval or rejection, given there is no Representation webhook?
4. Is the NIE/TIE card acceptable as the ID copy, or must it be the passport?
5. Must we cancel the earlier online process (`PUT /representacion/cancelar/{nif}`) before `generar`/`enviar`? Will `generar` work while the state is `Rechazado`/`Caducado`/`Pendiente`?
6. For the pilot's failed online signature, what did `estado.error` say: an unsupported passport, or a name mismatch with the AEAT census? Which foreign passports does Namirial support?
7. Does the handwritten path cost anything, given the certificate path is free?

## 4. Implications for Verifiq

Options, not a plan:

- **Port:** add operations for the document path, e.g. `generateRepresentationDocument(issuer, holder) → PDF bytes`, `uploadSignedRepresentation(issuer, pdf) → {state, error?}`, and probably `cancelRepresentation(issuer)`. The adapter would map these to `generar` (JSON in, PDF out), `enviar` (multipart `file`) and `cancelar`. The fake connector needs the same, plus a "manual review" state to simulate support approval.
- **States:** today a `Rechazado` from `enviar` would surface as `error/rejected`, which reads as final. If handwritten uploads land as `Rechazado` until support approves them, Verifiq needs to tell "rejected by the automatic check, waiting for Verifacti's review" apart from a real rejection. That might be a local flag ("uploaded manually on <date>"), since Verifacti exposes no such state. Polling `estado` stays the only signal.
- **UI:** on the Representation step, offer a second path: "Descargar la autorización en PDF" → sign it (certificate via AutoFirma, or by hand) → "Subir la autorización firmada", with the ID copy included in the same PDF. Explain that a handwritten signature needs a copy of the NIE/TIE or passport, and that review may take time.
- **Quick fixes for NIE holders on the online path:**
  1. Change the copy from "verifica tu identidad con tu DNI" to "con tu DNI o, si tienes NIE, con tu pasaporte".
  2. Ask for the name exactly as registered with the AEAT, and offer `POST /nifs/validar` with name to check it before paying €2.90.
  3. Show `estado.error` on rejection.
- **Cost guard:** before starting a new online process for an Issuer whose last one was `Rechazado`, steer them to the document path. Every new process costs another €2.90.
- **Short term for the pilot (no code):** the operator can do the whole document path from Verifacti's web app (Configuración → Representación): download, the pilot signs, upload, and Verifacti approves. Verifiq already picks up `Correcto` on the next status poll.

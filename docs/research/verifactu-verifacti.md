# VeriFactu + Verifacti: research for an invoicing SaaS for autónomos

Researched 2026-10-02. Primary sources only, unless a source is marked otherwise. Each fact cites its URL.
Tags: **[CONFIRMED]** means read directly in a primary source. **[INFERRED]** means a reasoned conclusion. **[UNCERTAIN]** means it needs checking with the vendor or AEAT.

Key sources:

- Verifacti VeriFactu API reference (OpenAPI rendered page): https://www.verifacti.com/docs (API base `https://api.verifacti.com/`)
- Verifacti NIF / Webhooks / Representación API: https://www.verifacti.com/nifs-docs
- Verifacti error-code catalog: https://www.verifacti.com/openapi/codigos-verifactu.yaml
- Verifacti pricing: https://www.verifacti.com/precios · FAQ: https://www.verifacti.com/preguntas-frecuentes · Quick guide: https://www.verifacti.com/guia-rapida
- RD 1007/2023 (consolidated, last updated 03/12/2025): https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840
- Orden HAC/1177/2024 (consolidated): https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138
- RD 254/2025: https://www.boe.es/buscar/doc.php?id=BOE-A-2025-6600
- RD-ley 15/2025: https://www.boe.es/buscar/doc.php?id=BOE-A-2025-24446
- RD 1619/2012 (Reglamento de facturación, consolidated): https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696
- AEAT developer FAQ "Aclaraciones a dudas de los desarrolladores" (dated 4 Dec 2025): https://sede.agenciatributaria.gob.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/FAQs-Desarrolladores.pdf
- AEAT QR spec "Detalle de las especificaciones técnicas del código QR" v0.5.0: https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/DetalleEspecificacTecnCodigoQRfactura.pdf
- AEAT VERI*FACTU FAQ index: https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes.html

---

## Part A: Verifacti API

### 1. Auth model, multi-tenant use and onboarding

- **[CONFIRMED] Each emisor NIF has its own API key, and each environment has a separate key.** You send the key as `Authorization: Bearer <API_KEY>`. The key determines both the emisor NIF and the environment (test/prod). The invoice JSON carries no emisor data. Sources: https://www.verifacti.com/docs ("Funcionamiento básico") and https://www.verifacti.com/preguntas-frecuentes. Key prefixes are `vf_test_` and `vf_prod_` (FAQ). `GET /verifactu/health` returns `{estado, nif, entorno}` for a key.
- **[CONFIRMED] One account can manage many NIFs, which is the integrator model.** The account has an account-level key (prefix `vfn_...`) from `https://app.verifacti.com/ajustes?tab=api-key`. It drives the NIF management API (https://www.verifacti.com/nifs-docs):
  - `POST /nifs` adds 1–400 NIFs per call. Fields: `nif, nombre, entorno (test|prod), hacienda (verifactu|alava|guipuzcoa|vizcaya), validar_nif, webhooks[], label, direccion, cp, poblacion...`. By default it checks that the NIF is registered with AEAT.
  - `GET /nifs` lists NIFs. `GET|PUT /nifs/{entorno}/{nif}` reads or updates one. `DELETE /nifs/{entorno}/{nif}` deactivates one: billing stops, and its records are **deleted 30 days later** unless you reactivate it. Reactivating does not break the chain. `DELETE .../permanent` deletes a NIF immediately and permanently. `PUT /nifs/activate/{entorno}/{nif}` reactivates one.
  - `GET /nifs/keys/{entorno}/{nif}` returns the per-NIF API key. `POST /nifs/keys/{entorno}/{nif}/rotar` rotates it, and the old key stops working immediately.
  - `POST /nifs/validar` checks a NIF against the AEAT census. `/nifs/validar_lotes` checks up to 20,000 at once. `/nifs/validar/vies` checks VIES.
- **[CONFIRMED] Onboarding with AEAT: the client needs no certificate of its own.** Verifacti sends records to AEAT with **its own certificate, as the emisor's representative**. Before the first production invoice, each NIF must sign Verifacti's "modelo de otorgamiento de representación". One model covers AEAT and the three Basque haciendas. There are two ways to sign (https://www.verifacti.com/nifs-docs, tag "Modelo de representación"):
  1. **Online signature**, for personas físicas only (DNI/NIE holders). Call `POST /representacion/firma_remota/{nif}` with `nombre, apellidos, municipio, calle, numero, email`. It returns a signing URL and also emails it. The signer verifies identity with a DNI or passport, and no certificate is needed. Cost: **€2.90 + IVA per signing process**, charged even if the signature is never completed. When signing finishes, the state changes automatically to `Correcto`.
  2. **Electronic certificate** (free, for físicas and jurídicas). `POST /representacion/generar/{nif}` returns a pre-filled PDF. The emisor signs it with their certificate, and you upload it with `POST /representacion/enviar/{nif}`. Verifacti checks the signature against the NIF.
  - `GET /representacion/estado/{nif}` reports the state. `PUT /representacion/cancelar/{nif}` cancels the representation, after which production sends for that NIF are blocked. `GET /representacion/descargar/{nif}` downloads the signed PDF.
  - Test NIFs need no representation.
- AEAT background **[CONFIRMED]**: third parties may send records through representación, apoderamiento or colaboración social (Orden HAC/1177/2024 art. 5; AEAT dev FAQ §16).

### 2. Endpoints, sync vs async, and responses

All endpoints live under `https://api.verifacti.com/verifactu/`. Source: https://www.verifacti.com/docs.

| Method | Path | Purpose |
|---|---|---|
| POST | `/create` | Registro de alta: a new invoice of any type F1/F2/F3/R1–R5 |
| POST | `/create_bulk` | Up to 50 altas in one call. All-or-nothing validation: one 400 means no records are created |
| PUT | `/modify` | Alta de **subsanación**, i.e. correcting record data when no rectificativa is required. `rechazo_previo` N/S/X |
| POST | `/cancel` | Registro de **anulación**. Fields `serie, numero, fecha_expedicion, rechazo_previo (N/S), sin_registro_previo (N/S)` |
| GET | `/status?uuid=` | State of one **registro** (record) |
| POST | `/status` | State of the **factura** in the AEAT system, by `serie, numero, fecha_expedicion[, fecha_operacion]` |
| POST | `/list` | Invoices registered at AEAT, by `ejercicio`/`periodo` and filters. Pages hold 10k items |
| POST | `/export`, `/downloadXML` | Export XML batches and download record XML |
| GET | `/health` | Key status plus NIF and environment |
| GET | `/declaracion` | URL of Verifacti's own declaración responsable (current and per-version) |

- **[CONFIRMED] Processing is asynchronous.** `/create` validates and returns **200** straight away with `{uuid, estado:"Pendiente", url, qr (PNG base64), huella}`. The record is then queued and sent to AEAT, "typically in under a minute". The FAQ says it can take up to 100–200 s under AEAT rate limiting, and the quick guide says "a maximum of two minutes". `/modify` returns the same shape. `/cancel` returns `{uuid, huella, estado}`.
- **[CONFIRMED] Webhooks are available** (https://www.verifacti.com/nifs-docs, tag Webhooks):
  - You register them with `POST /webhooks {url (https, public), entorno, secret, nifs[]}`. A webhook can cover many NIFs, and a NIF can link to many webhooks.
  - Each body is a JSON **array** of objects, each the same shape as the `GET /status` response.
  - Each delivery is signed in `X-Webhook-Signature`: HMAC-SHA256 hex over the raw body.
  - `X-Webhook-Id` is a UUID that stays the same across retries, so you can use it for idempotency.
  - Your endpoint must return 2xx within **10 s**. Failed deliveries are retried 3 times (after 1 min, 6 min and 30 min). A 4xx counts as permanent and is not retried. An endpoint that fails repeatedly gets the webhook auto-disabled, with an email alert, and you must reactivate it by hand.
- **[CONFIRMED] `GET /status` response fields:** `nif, serie, numero, fecha_expedicion, operacion, estado, url, qr, codigo_error, mensaje_error` (both exactly as AEAT returns them), and `estado_registro_duplicado`.
- **[CONFIRMED] Record states:** `Pendiente`, `Correcto`, `Aceptado con errores`, `Incorrecto`, `Duplicado`, `Anulado`, `Factura inexistente`, `No registrado`, and `Error servidor AEAT` (Verifacti retries automatically on this one).
- **[CONFIRMED] Invoice-level states** (`estadoFactura` schema): `Correcta`, `AceptadaConErrores`, … The schema also carries `huella`, `encadenamiento` (the previous record it was chained to) and `ultima_modificacion`.
- **[INFERRED] There is no AEAT CSV field in the documented response.** Verifacti exposes `uuid`, `huella`, `qr` and `url`. AEAT returns a CSV per accepted submission (Orden art. 16.5), but the docs do not show Verifacti passing it through. **[UNCERTAIN]**: ask Verifacti if you need it.

### 3. Hash chaining, flow control and retries

- **[CONFIRMED] Verifacti does all of this:** the huella (hash), the XML, the QR, the authenticated call, "las colas y los tiempos de espera" (queues and wait times) and storage. Source: https://www.verifacti.com/docs ("Comparativa"). Its docs list the AEAT protocol it handles itself, including "no more than one call per minute, unless more than 1000 submissions accumulate". The regulation behind this: Orden HAC/1177/2024 art. 16.2 sets an initial wait `t` of 60 s, updated by AEAT in each response, or a send as soon as the per-message record limit is reached.
- **[CONFIRMED] Verifacti keeps one chain per NIF.** Deactivating and reactivating a NIF keeps the chain. A permanently deleted NIF that is re-created starts a new chain (nifs-docs).
- **[CONFIRMED]** The regulation requires a separate chain per obligado tributario in a multi-tenant SIF (Orden art. 2.b).
- **[CONFIRMED]** If AEAT has a server error, Verifacti re-sends ("Se intentará reenviar"). The regulation separately requires the SIF to retry at least hourly during an incident and to flag affected records (Orden art. 16.4). The `/create` field `incidencia: "S"` exists for that flag.
- **[UNCERTAIN]** Verifacti's docs do not say whether a Verifacti outage (a 5xx at `/create`) still lets us issue invoices. A 500 means "no record is generated, retry later". Our SaaS must therefore not hand the customer an invoice without a QR. Design our own outbox and retry for this case.

### 4. Sandbox

- **[CONFIRMED]** A free account comes with **1 test NIF**, and no card is needed (https://www.verifacti.com/precios). Test NIFs are free, unlimited, and send to the **AEAT test environment** (`prewww2.aeat.es`).
- **[CONFIRMED]** Test-environment record data is kept for **90 days at most**. Invoice queries still work because they query AEAT (docs, `GET /status`).
- **[CONFIRMED]** `validar_destinatario: false` (skip the census check on the recipient) and `validar_nif: false` (allow unregistered NIFs) are allowed **in test only**. AEAT still rejects unregistered NIFs, even in its test environment (nifs-docs).
- Verifacti also publishes a Postman collection: https://storage.googleapis.com/verifacti_non_sensitive/postman_verifactu.json

### 5. Pricing (as published on 2026-10-02; corrected 2026-10-03)

- **[CONFIRMED] The price per NIF falls with the number of NIFs.** One production NIF costs **€14.99 per month** (the page's structured data: "Suscripción mensual", `price: 14.99`). The headline "desde 2,9 € por NIF al mes" is the unit price at **100 NIFs**. There is 10% off with annual billing. Each NIF includes **3,000 invoices per month**, and each extra 1,000 costs **€2**. Above 100 NIFs the price is a custom quote. Source: https://www.verifacti.com/precios
  - Correction: the first version of this note read "from €2.90 per NIF" as the price of every NIF. It is not: with the first Issuers, Verifacti costs about €15 per Issuer per month.
- **[CONFIRMED] What the free plan covers.** The free plan ("1 NIF de Prueba", €0, no card) is **a test company with its own API key** (`vf_test_…`). That key works with the `/verifactu/*` record endpoints only.
  - The **NIF management API** (account key `vfn_…`: `/nifs`, `/representacion`, `/nifs/validar`) and **unlimited test NIFs** belong to the paid plan, which asks for a card.
  - Verifiq's onboarding (issues 06 and 07: issuer key, Representation, census) therefore needs the paid plan, even against the AEAT test environment.
- **[CONFIRMED]** Online representation signature costs €2.90 + IVA per process (nifs-docs).
  - **[UNCERTAIN]** Whether this is also charged in the test environment. Test NIFs need no Representation, so do not start a signature in test.
- **[CONFIRMED]** Billing by plan:
  - Monthly: new NIFs are added to the next invoice.
  - Annual: new NIFs are charged immediately and prorated.
  - Deactivated NIFs are not billed.
  - Test NIFs are never billed.
- **[UNCERTAIN]** The published pages give no integrator or partner tiers. Ask Verifacti (soporte@verifacti.com) about pricing by total volume, and about a test account with the NIF API while integrating.

### 6. Error model

- **[CONFIRMED] Synchronous errors (HTTP 400):** Verifacti validates the JSON before queuing. Checks include required fields, enums, totals, and whether the recipient NIF exists in the AEAT census (on by default). The response is `{error, codigo}`, where `codigo` is a stable ID such as `vf-verifactu-tipo_factura_valor`. The full catalog is at https://www.verifacti.com/openapi/codigos-verifactu.yaml. On a 400, **no record is generated** and nothing reaches AEAT.
- **[CONFIRMED] HTTP 500:** no record is generated, so retry.
- **[CONFIRMED] Asynchronous AEAT outcomes** arrive via webhook or `GET /status`, with `codigo_error`/`mensaje_error` from AEAT. AEAT's own catalog: https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Validaciones_Errores_Veri-Factu.pdf
- **[CONFIRMED] What each AEAT outcome requires:**
  - **`Aceptado con errores`** means AEAT stored the record, but it contains errors. Fix it with a subsanación (`/modify`, `rechazo_previo=N`) or with a rectificativa, depending on the error type (see §10).
  - **`Incorrecto` / `No registrado`** means AEAT rejected the record, so it does not exist there. Fix it with a subsanación using `rechazo_previo=X`, or with a rectificativa.
  - **`Duplicado`** means the same (serie, numero, fecha_expedicion) already exists.
- **[CONFIRMED]** AEAT checks `ImporteTotal` against the sum of base + cuota + recargo, with ±€10 tolerance. A mismatch produces a **warning, not a rejection** (AEAT dev FAQ §20). Verifacti enforces the same ±€10 rule as a 400, except for claves 03/05/06/08/09.

### 7. Idempotency

- **[CONFIRMED]** `/create`, `/create_bulk`, `/modify` and `/cancel` accept an `Idempotency-Key` header (printable ASCII, 1–255 chars). It is scoped to the emisor NIF, not the API key, so it survives key rotation. It is kept for 24 h.
- **[CONFIRMED] Replay behaviour:**
  - The same key with the same body replays the original status and body, with `Idempotent-Replayed: true`.
  - 2xx and 4xx responses are stored, so to resend corrected data you need a **new key**. 5xx responses are not stored.
  - A concurrent request with an in-flight key gets **409**. The same key with a different body gets **422**.
  - After 24 h, call `POST /verifactu/status` with serie/numero/fecha before resending.
- Source: https://www.verifacti.com/docs ("Idempotencia").

### 8. Supported invoice types and tax features

Source: https://www.verifacti.com/docs (`/create` schema).

- **[CONFIRMED] Invoice types:** `tipo_factura` takes **F1, F2, F3, R1, R2, R3, R4, R5**.
  - Rectificativas require `tipo_rectificativa`: **S** (sustitución) or **I** (diferencias).
  - With `S`, you must also send `importe_rectificativa {base_rectificada, cuota_rectificada, cuota_recargo_rectificada}`.
  - `facturas_rectificadas[]` is optional for R1–R5, and `facturas_sustituidas[]` is optional for F3.
- **[CONFIRMED] Line limits:** at most **12 lines** (`lineas`), an AEAT limit. Each line is a tax breakdown (desglose) row, not an item. Group items by tax rate.
- **[CONFIRMED] Line fields:**
  - `base_imponible` is required. Also `tipo_impositivo` and `cuota_repercutida`.
  - `impuesto`: 01 IVA, 02 IPSI, 03 IGIC, 05 Otros.
  - `calificacion_operacion`: S1 (default), S2 (inversión del sujeto pasivo), N1 or N2 (no sujeta).
  - `clave_regimen` 01–20 (default 01).
  - `operacion_exenta` E1–E6 for IVA (arts. 20, 21, 22, 23–24, 25, other). It is mutually exclusive with the rate and quota fields.
  - `tipo_recargo_equivalencia` and `cuota_recargo_equivalencia` (**recargo de equivalencia is supported**).
  - `base_imponible_a_coste` (allowed only for clave 06, impuesto 02, or impuesto 05).
- **[CONFIRMED] Allowed IVA rates:** 0, 2, 4, 5, 7.5, 10, 21.
- **[CONFIRMED] IRPF retention is NOT part of the VeriFactu record.** Neither Verifacti nor AEAT has a field for it.
  - `importe_total` excludes IRPF, so the QR amount differs from the "total a pagar" (amount due).
  - AEAT recommends printing both "Importe total factura" and "Total a pagar", clearly labelled. The AEAT cotejo page tells recipients that retentions are excluded.
  - Sources: Verifacti FAQ ("¿Cómo incluyo las retenciones por IRPF?") and AEAT dev FAQ §20.
- **[CONFIRMED] `fecha_expedicion` must be today in Verifacti** (shown in red in its docs). Use `fecha_operacion` for an earlier operation date. A future `fecha_operacion` is allowed only with clave 14/15.
  - **[INFERRED]** This means we cannot back-date the issue date. The SaaS must call `/create` on the actual day of issue.
- Other fields: `especial.emitida_por_tercero_o_destinatario` (T/D), `factura_simplificada_art_7273`, `factura_sin_identif_destinatario_art_61d`, `cupon`, `id_otro` (foreign IDs: 02 NIF-IVA, 03 passport, …), and `fecha_fin_verifactu` (renouncing VERI*FACTU at year end).
- The **serie + numero** combination may not exceed 60 characters. `serie` may be an empty string.

---

## Part B: VeriFactu regulation

### 9. Mandatory dates as of October 2026

- **[CONFIRMED]** RD 1007/2023, disposición final cuarta, consolidated text (last update published 03/12/2025, in force 04/12/2025), as amended by **RD-ley 15/2025 (disposición final 1ª)**. Sources: https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840 and https://www.boe.es/buscar/doc.php?id=BOE-A-2025-24446
  - **Impuesto sobre Sociedades taxpayers** (art. 3.1.a): systems must be adapted **before 1 January 2027**.
  - **Everyone else in art. 3.1**, which includes **autónomos (IRPF)**, IRNR with a permanent establishment, and entidades en atribución de rentas: **before 1 July 2027**.
  - **Software producers and sellers (art. 3.2)** must offer fully adapted products **within 9 months of the Orden HAC/1177/2024 entering into force**. The Orden was published 28/10/2024 and entered into force 29/10/2024, so the deadline was **29 July 2025**. RD-ley 15/2025 did not change this date. Products under multi-year maintenance contracts follow the user dates. Source: the same provision. Date confirmed in the AEAT dev FAQ §1 ("hasta el 29/07/2025") and the Verifacti FAQ.
- History: the original dates were 1/7/2025 for all. RD 254/2025 moved them to 1/1/2026 (IS) and 1/7/2026 (others). RD-ley 15/2025 then moved them to 1/1/2027 and 1/7/2027.
- **[UNCERTAIN]** The BOE consolidated text showed no further amendment after 03/12/2025 when fetched today. No newer postponement turned up in searches. Check again before relying on these dates.
- **[INFERRED] Product implication:** as a SIF producer selling now, our SaaS must already comply. The 2027 dates apply to our users, not to us.

### 10. Anulación vs subsanación vs rectificativa

Main source: AEAT developer FAQ (4 Dec 2025) §17 "Forma de proceder ante errores…", plus RD 1007/2023 arts. 8.2.a and 11, and RD 1619/2012 art. 15.

- **Before issue** (draft or proforma): edit freely. A record only exists once the invoice is issued. Proformas must still be kept (dev FAQ §6 and §11).
- **After issue, when the error is covered by the Reglamento de facturación (ROF)** (wrong amount, wrong rate, a missing art. 6/7 requirement, or art. 80 LIVA base changes): issue a **factura rectificativa** (R1–R4, or R5 for simplificadas). It is a new invoice with its own **alta** record, by sustitución (S) or diferencias (I). It must go in a **separate series** (ROF art. 6.1.a.2º). It must be issued as soon as the error is known, within 4 years of the devengo (ROF art. 15.3).
  - The original record stays at AEAT as it was, including when it was "Aceptado con errores". The problem counts as solved once the rectificativa's record is accepted.
- **After issue, when the error is NOT covered by the ROF but affects record-only "internal" fields** (e.g. tax codes not visible on the printed invoice): correct the invoice data and send an **alta de subsanación**.
  - Use `Subsanacion=S`. Use `RechazoPrevio=X` if the original was **rejected**, which means it never existed at AEAT.
  - AEAT says this should be "MUY POCO FRECUENTE".
  - In Verifacti this is `PUT /modify` with `rechazo_previo=N` or `X`.
- **After issue, when the error affects neither the ROF nor the record**: correct the invoice. No new record is needed.
- **Anulación** (registro de anulación, RRSIF art. 11): only when the invoice "se haya emitido erróneamente", meaning it **should never have existed**. Examples are a non-existent operation, a test invoice or a training invoice.
  - AEAT: "La anulación no es … un concepto jurídico"; it is a factual concept.
  - Effect: the invoice "no tendrá ningún efecto fiscal ni en libros registros, ni en autoliquidaciones". Both the alta record and the anulación record remain at AEAT.
  - Invoices for operations that really took place generally **cannot** be anulled. Use a rectificativa for them.
  - Anulación fits best when the invoice was **not yet delivered** to the client.
  - It must not be combined with "compensating" invoices. If you use a rectificativa, do not also send an anulación.
- **No reuse of numbers.** After an anulación, AEAT rejects a new alta with the same NIF + serie+número + fecha as "Registro de facturación duplicado". Test invoices sent from a production SIF are real records and need anulación (dev FAQ §6). Verifacti states the same: an anulled (serie, numero, fecha_expedicion) cannot be re-created.
  - AEAT's procedures FAQ says a replacement must use a "número de factura o fecha de expedición diferente": https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/procedimientos-facturacion.html
  - **[INFERRED]** Always use a new number. Correlative numbering makes "same number, new date" unwise.
- **No fixed deadline for subsanación or anulación records:** send them "en cuanto sea posible" (dev FAQ §17).
- Alteration of any kind must happen through **additional records**, never by editing existing ones (RRSIF art. 8.2.a).

### 11. Numbering, dates and send deadline

- **[CONFIRMED] Numbering is correlative within each series** (ROF art. 6.1.a for completas, 7.1.a for simplificadas). Separate series are allowed when justified. **Specific series are mandatory** for these, among others:
  - **rectificativas**;
  - invoices issued by the recipient or a third party (one series for each);
  - for simplificadas, a separate series from completas issued in the same calendar year (art. 7.1.a, last paragraph).
- **[CONFIRMED] Dates:**
  - `fecha de expedición` is always required.
  - The operation date (or advance-payment date) is required **when it differs** from the issue date (ROF art. 6.1.i and 7.1.c).
  - The alta record carries both dates (RRSIF art. 10.1.e).
- **[CONFIRMED] Issue deadline** (ROF art. 11): at the moment of the operation. When the recipient is an empresario or profesional, **before the 16th of the month after devengo**.
- **[CONFIRMED] Record generation:** "de forma simultánea o inmediatamente anterior a la expedición de cada factura" (RRSIF art. 9).
- **[CONFIRMED] Send deadline:**
  - VERI*FACTU sending must be "continuada, segura, correcta, íntegra, automática, consecutiva, **instantánea** y fehaciente" (RRSIF art. 16.1).
  - The only permitted delay is flow control (art. 16.2: wait `t` seconds, initially 60) or an incident. During an incident, retry at least hourly, respect chronological order, set the incidencia flag and warn the user about pending records (Orden art. 16.4).
  - AEAT: "La inmediatez del envío … es parte del sistema de seguridad", and there is no fixed maximum during incidents: https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/sistemas-verifactu.html
- **[CONFIRMED] VERI*FACTU option lock-in:** once a taxpayer starts sending, they must continue at least until 31 Dec of that year. Renouncing is done through a field in a submission (RRSIF art. 16.5; Orden art. 17). Verifacti exposes this as `fecha_fin_verifactu`.

### 12. QR code requirements

Sources: Orden HAC/1177/2024 arts. 20–21, RD 1619/2012 art. 6.5, and the AEAT QR spec v0.5.0.

- **[CONFIRMED] Size and encoding:** between **30×30 and 40×40 mm**, per **ISO/IEC 18004**, with error-correction level **M** (Orden art. 21.1).
- **[CONFIRMED] Content:** a URL containing the NIF of the emisor, serie+número, fecha de expedición (DD-MM-AAAA) and importe total (Orden art. 21.2). Templates for VERI*FACTU systems:
  - Production: `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=…&numserie=…&fecha=DD-MM-AAAA&importe=NNN.DD`
  - Test: `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?...`
  - Parameters must be URL-encoded (e.g. `&` becomes `%26`). Non-VERI*FACTU systems use `ValidarQRNoVerifactu` instead.
  - Verifacti returns both the URL and the PNG.
- **[CONFIRMED] Placement** (AEAT QR spec):
  - At the **start of the invoice, before its content**, and on the first page only.
  - Portrait layout: top, preferably centred, otherwise top-left. Landscape layout: left side, preferably top-left.
  - At least a **2 mm quiet zone** on all sides (6 mm recommended), with high contrast.
  - It should be the first QR on the invoice.
- **[CONFIRMED] Required texts:**
  - The label **"QR tributario:"** goes above the QR (AEAT spec).
  - VERI*FACTU invoices need the phrase **"Factura verificable en la sede electrónica de la AEAT"** or **"VERI*FACTU"** just below the QR (Orden art. 20.1.b; ROF art. 6.5.b).
  - Both texts must be in a font size equal to or larger than the rest of the invoice data.
- **[CONFIRMED] Structured e-invoices** (B2B data exchange) carry the QR URL as a separate field instead of the image (Orden art. 20.2).
- **[CONFIRMED]** These rules apply to both completas and simplificadas (ROF art. 7.5).

### 13. Mandatory invoice content (RD 1619/2012)

Source: https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696

**Factura completa (art. 6.1):**

- (a) number and serie, correlative;
- (b) fecha de expedición;
- (c) full name or razón social of both the issuer and the recipient;
- (d) issuer NIF. The recipient NIF is required for intra-EU exempt supplies, for inversión del sujeto pasivo, and for operations located in Spain when the issuer is established there. **[INFERRED]** In practice, that covers almost every B2B invoice from an autónomo;
- (e) domicilio of both issuer and recipient;
- (f) description, with all data needed to determine the base. This includes the **unit price without tax** and any discount not already in that price;
- (g) tax rate(s);
- (h) cuota, shown separately;
- (i) operation date, if different from the issue date;
- (j) for exempt operations, a reference to the exempting rule, or the statement that it is exempt;
- (k) for new means of transport, their details;
- (l) the mention "facturación por el destinatario";
- (m) the mention "inversión del sujeto pasivo";
- (n)–(o) the mentions for the special regimes (agencias de viajes, bienes usados, arte, antigüedades);
- (p) the mention "régimen especial del criterio de caja".

Art. 6.2 requires the base to be shown separately per exempt / ISP / tax-rate group. Art. 6.5 adds the **QR** and, for VERI*FACTU, the **legend**.

**Factura simplificada (art. 7.1):**

- (a) number and serie;
- (b) fecha de expedición;
- (c) operation date, if different;
- (d) issuer NIF and name;
- (e) type of goods or services;
- (f) tax rate, optionally with "IVA incluido". If rates are mixed, the base for each;
- (g) contraprestación total;
- (h) for rectificativas, the rectified invoice;
- (i) the art. 6.1 j)–p) mentions.

If the recipient is an empresario and asks for it, a simplificada must also show the recipient NIF, the recipient's domicilio and the cuota (art. 7.2). Art. 7.5 adds the QR and legend.

When a simplificada is allowed (art. 4): amount ≤ €400 incl. IVA; or a rectificativa; or ≤ €3,000 for the listed retail and hospitality sectors. It is never allowed for intra-EU supplies and some other cases.

**Rectificativas (art. 15):** they must identify the rectified invoice(s). They may show either the correction amount or the post-correction figures together with the correction amount.

### 14. Software producer obligations: does Verifacti cover us?

- **[CONFIRMED] Verifacti does not cover us. We must sign our own declaración responsable (DR).** RRSIF art. 13.1 says it "corresponderá a la persona o entidad productora del sistema informático certificar, mediante una declaración responsable…". Our SaaS is the SIF, specifically the **componente principal de facturación (CPF)**. Verifacti is a **componente de facturación (CF)** with its own DR, available at `GET /verifactu/declaracion`.
- Orden art. 15.4: when a system is made of components from different producers, "todas ellas deberán aportar las correspondientes declaraciones responsables de sus componentes".
- AEAT dev FAQ §5: all components (CPF and CF) need a DR. **The CPF's DR must state that it invokes the CF "indefectiblemente"** (unfailingly), naming **the specific CF version** and describing how, when and for what (which requirements the CF implements). The CPF must also guarantee:
  - the CPF↔CF connection always happens and is immediate;
  - the data exchanged is not altered;
  - the two components are coordinated on AEAT responses (rejections, subsanaciones, rectificativas, anulaciones);
  - **no "orphan" invoices without records, and no records without invoices**.
- The Verifacti FAQ says the same: our responsibilities include real-time sending, **publishing our own DR** (they provide a template), and placing the QR on the invoice.
- **[CONFIRMED] DR format** (Orden art. 15):
  - Title: "DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN".
  - Fields, in this order: (a) name; (b) system ID code; (c) full version; (d) components and functions; (e) whether it works exclusively as VERI*FACTU; (f) whether it is multi-obligado; (g) signature types (only if not VERI*FACTU); (h) producer name; (i) producer NIF; (j) postal address; (k) compliance statement; (l) date and place.
  - It must be visible inside the software for **every version**, and given to clients when they acquire the product.
  - **It is not filed with AEAT** (self-certification; RRSIF art. 13; AEAT FAQ on certificación).
  - The producer must keep the DRs of all versions (RRSIF art. 13.3).
- **[CONFIRMED] Multi-tenant SIF duties** (Orden art. 2):
  - behave as an independent SIF per obligado;
  - keep separate chains;
  - allow VERI*FACTU operation per obligado;
  - **always display which obligado is active**, using the name, NIF or similar (dev FAQ §7);
  - show a message saying the SIF serves several obligados.
- The system ID code (`IdSistemaInformatico`) and other SIF data go into every record (RRSIF art. 10.1.o). **[UNCERTAIN]** Verifacti's `/create` schema has no SIF-identification fields. It presumably fills in its own. Confirm with Verifacti how the CPF (our SaaS) is identified in the XML, and whether that matters for our DR.

### 15. Record retention and data the SIF must keep

- **[CONFIRMED] Billing records in VERI*FACTU mode:** the regulation imposes no record-retention duty, because AEAT stores the records. Orden art. 3 exempts VERI*FACTU systems from arts. 6.b–f, 7.f, 7.h–j, 8 (conservación) and 9 (registro de eventos). AEAT nevertheless recommends that systems keep them for practical reasons. Sources: AEAT dev FAQ §13 and the VERI*FACTU FAQ.
- **[CONFIRMED] Invoices themselves:** copies or matrices of issued invoices must be kept for the LGT prescription period (ROF art. 19.1.b). That is **4 years** (LGT art. 66). Keep them **with their original content**, in a legible form, with access for AEAT "sin demora" (arts. 19–21).
  - Records do not contain the invoice lines, so the full invoices must be kept (dev FAQ §13).
  - **[INFERRED / not researched in primary source]** Commercial law (Código de Comercio art. 30) requires 6 years for accounting documents. Many advisers apply 6 years.
  - Storage outside Spain requires prior notice to AEAT and electronic online access (ROF art. 22.2).
- **[CONFIRMED] Proformas and drafts** that never became invoices must still be kept (dev FAQ §6).
- **[CONFIRMED] Verifacti data lifecycle:**
  - Records of a deactivated NIF are **deleted 30 days after deactivation**.
  - A permanent delete removes them immediately.
  - Test data is kept for at most 90 days.
  - **[INFERRED]** Our SaaS should store every Verifacti response (uuid, huella, QR URL, estado, AEAT error codes) and the full invoice ourselves, and must not rely on Verifacti for archival.
- **[CONFIRMED]** If a non-VERI*FACTU fallback were ever used (not planned), arts. 8–9 of the Orden would apply in full: export, event log and signatures.

# Dentist (autónomo odontólogo) invoicing: research

Researched 2026-10-02. This complements `docs/research/verifactu-verifacti.md` and does not repeat it.
Tags: **[CONFIRMED]** means read directly in a primary source. **[INFERRED]** means a reasoned conclusion. **[UNCERTAIN]** means it needs checking with an adviser, the DGT or the vendor.

**Scope (updated by the user mid-research):** the first user is an autónomo dentist who **invoices the clinics they work for** (B2B, with the clinic's CIF/NIF as destinatario). The dentist does **not** invoice patients. Patient-invoicing questions (simplificadas, patients without a NIF, patient census matching) are kept only as short notes in §8.

Key sources:

- LIVA, Ley 37/1992 (consolidated): https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740
- RD 1619/2012, Reglamento de facturación (ROF): https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696
- RIRPF, RD 439/2007 (consolidated): https://www.boe.es/buscar/act.php?id=BOE-A-2007-6820
- RGPD (BOE copy of the DOUE text): https://www.boe.es/buscar/doc.php?id=DOUE-L-2016-80807
- LOPDGDD, LO 3/2018: https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673
- AEPD list of processing that requires a DPIA (art. 35.4): https://www.aepd.es/documento/listas-dpia-es-35-4.pdf
- AEPD list of processing that does not require a DPIA (art. 35.5): https://www.aepd.es/documento/listasdpia-35.5l.pdf
- AEPD Gabinete Jurídico report 015/2024 (on the e-invoicing regulation): https://www.aepd.es/documento/2024-0015.pdf
- AEAT IVA manual, medical and health exemptions: https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/manual-iva-2021/capitulo-3-entregas-bienes-servicios-profesionales/entregas-bienes-servic-realizadas-empresarios-profesionales/operaciones-exentas/exenciones-operaciones-interiores/exenciones-operaciones-medicas-sanitarias.html
- DGT consultas vinculantes. The official search tool at petete.tributos.hacienda.gob.es is JavaScript-only and could not be fetched, so the consultas below were read through the **Iberley** mirror, a **secondary** source that reproduces the DGT text.
- Verifacti API (openapi): https://www.verifacti.com/docs

---

## 1. IVA exemption for dental services billed to a clinic

### The exemption and its scope

- **[CONFIRMED] Legal basis: LIVA art. 20.Uno.5º.** The exemption covers "Las prestaciones de servicios realizadas en el ámbito de sus respectivas profesiones por estomatólogos, odontólogos, mecánicos dentistas y protésicos dentales, así como la entrega, reparación y colocación de prótesis dentales y ortopedias maxilares realizadas por los mismos, **cualquiera que sea la persona a cuyo cargo se realicen dichas operaciones**." Source: https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740 (art. 20).
  - Note: this is 20.Uno.**5º**. The general medical exemption is 20.Uno.3º; some secondary sources wrongly cite 3º for dentists.
- **[CONFIRMED] The exemption applies when the dentist bills a clinic instead of the patient.** The closing words "cualquiera que sea la persona a cuyo cargo se realicen" make the payer irrelevant. The DGT applies this to the exact case:
  - **V0059-25 (03-02-2025).** An odontóloga in IAE group 834 "presta servicios a … distintas clínicas" and invoices them monthly. The DGT treats her dental services as exempt. Only her *resale* of aligners bought from a lab (see the next point) falls outside the exemption. Source: https://www.iberley.es/resoluciones/resolucion-vinculante-direccion-general-tributos-v0059-25-03-02-2025-11674232
  - **V2266-21 (12-08-2021).** An orthodontist invoices a clinic for supplying and fitting appliances on the clinic's patients. This is exempt and is a **single** service, so it goes on **one invoice**; it cannot be split into "device" and "fitting" invoices. Source: https://www.iberley.es/resoluciones/resolucion-vinculante-dgt-v2266-21-12-08-2021-1536833
  - The AEAT manual says the same: "sujetos y exentos del IVA" (link above).
- **[CONFIRMED] Prótesis dentales and ortopedias maxilares (ortodoncia) are covered** when the dentist or protésico supplies, repairs or fits them (art. 20.Uno.5º; V2266-21).
- **[CONFIRMED] Exception: resale is taxed.** If the dentist buys aligners or prostheses from a lab and **re-invoices them to the clinic as a mere intermediary**, that supply is "sujeta y no exenta". The DGT's words: "no se realiza en el marco de sus servicios odontológicos exentos, sino dentro de una actividad meramente comercial" (V0059-25). In that case the dentist also needed IAE 619.2.
  - **[UNCERTAIN]** The applicable rate (10% or 21%). The summary of V0059-25 does not state one, so check with an adviser.
  - **[INFERRED]** The product therefore needs **per-line tax treatment**: exempt E1 for the dental service, and taxed for resold material.
- **[UNCERTAIN] Purely aesthetic treatments** (e.g. cosmetic whitening or veneers without a therapeutic purpose):
  - The AEAT manual excludes "cirugía estética" from the health exemptions.
  - DGT consulta V0310-26 (12-02-2026), on medicina estética, limits the exemption to treatments with a therapeutic purpose. This was seen in secondary sources only (https://prime.tirant.com/es/actualidad-prime/la-dgt-delimita-la-exencion-de-iva-en-medicina-estetica/).
  - Secondary sources disagree on whether dental whitening is exempt.
  - **[INFERRED]** For the MVP, default every line to exempt (E1), and allow an "IVA 21%" line for the rare aesthetic case. Do not try to classify treatments automatically.

### What to print on the invoice

- **[CONFIRMED] The legal mention.** ROF art. 6.1.j requires "una referencia a las disposiciones correspondientes de la Directiva 2006/112/CE … o a los preceptos correspondientes de la Ley del Impuesto o indicación de que la operación está exenta".
  - The law prescribes no fixed wording.
  - **[INFERRED] Recommended text:** "Operación exenta de IVA en virtud del artículo 20.Uno.5º de la Ley 37/1992, del Impuesto sobre el Valor Añadido."
  - Source: https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696 (art. 6.1.j).
- **[CONFIRMED] Mixed invoices.** If one invoice has both exempt and taxed lines, show the base separately for each (ROF art. 6.2.a).
- **[CONFIRMED] An invoice is mandatory even though the service is exempt.** ROF art. 3.1.a waives the invoice for most art. 20 exemptions, but **not** for 20.Uno.5º. ROF art. 2.2.a also requires an invoice "en todo caso" when the recipient is an empresario or profesional, which a clinic is.

### VeriFactu and Verifacti coding

- **[CONFIRMED] Line coding:**
  - Set `impuesto: "01"` (the default) and `operacion_exenta: "E1"`, which Verifacti defines as "Operación exenta según el artículo 20 de la Ley 37/1992".
  - Send **no** `tipo_impositivo`, `cuota_repercutida` or recargo fields; they are mutually exclusive with `operacion_exenta`.
  - Leave out `calificacion_operacion`. Verifacti's own "Exenta de IVA" example sends only `{"base_imponible": "200", "operacion_exenta": "E1"}` and `importe_total` equal to the base.
  - Source: https://www.verifacti.com/docs (`/create`, example "Exenta de IVA").
- **[CONFIRMED] Invoice type:** `tipo_factura: "F1"`, because a completa is required (see §3).
- **[CONFIRMED] The QR amount equals the gross fee, while the amount paid is lower.**
  - For an exempt invoice, `importe_total` = base.
  - The IRPF retention is not in the record, so the "Total a pagar" printed on the invoice will be base − retención.
  - See verifactu-verifacti.md §8.

## 2. IRPF retention when billing clinics

- **[CONFIRMED] Rates (RIRPF art. 95.1):**
  - **15%** for professional activities, "sobre los ingresos íntegros satisfechos".
  - **7%** in the year the professional activity starts and the two following years, if no professional activity was carried on in the year before. The dentist must **communicate this to the payer**, and the payer must keep the signed communication.
  - Source: https://www.boe.es/buscar/act.php?id=BOE-A-2007-6820 (art. 95).
- **[CONFIRMED] A dentist's income counts as professional activity income:**
  - IAE group 834 "Odontólogos" is in section 2 (profesionales). Source: V0059-25.
  - Professional activity income is subject to retention (RIRPF art. 75.1.c).
- **[CONFIRMED] The clinic is obliged to retain:**
  - Legal persons and other entities must retain (RIRPF art. 76.1.a), so a clinic run as an SL must.
  - So must taxpayers carrying on economic activities when they pay income in the course of that activity (art. 76.1.b), so a clinic run by an autónomo owner must too.
  - Source: RIRPF art. 76.
- **[CONFIRMED] There is no retention when a private individual pays outside any business activity.** That case does not apply here. Source: V2154-18, https://www.iberley.es/resoluciones/resolucion-vinculante-dgt-v2154-18-18-07-2018-1477963
- **[CONFIRMED] The retention base is the full invoice amount.** It is not applied line by line, and that includes appliances or prostheses inside a single orthodontic service (V2266-21).
- **[CONFIRMED] The retention is not a legally required invoice field, but it may be shown** (V2154-18).
  - **[INFERRED]** In practice, show it: the clinic pays net, and the dentist's model 130 needs the figure.
- **[INFERRED] Product implications:**
  - Store a per-client retention rate. Default to 15%, offer 7% for new professionals, and allow 0%.
  - Track the start date of the 7% period so the app can warn when it expires (3 tax years).
  - **[UNCERTAIN]** Whether resold material (non-exempt, commercial activity under IAE 619.2) is subject to professional retention. It probably is not, because RIRPF art. 75 lists only professional, agricultural and some módulos business income. Confirm with an adviser.

## 3. Mandatory invoice content for dentist → clinic invoices

All of the following comes from the ROF (https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696).

- **[CONFIRMED] A factura completa (F1) is needed.**
  - A simplificada is allowed only up to €400 (art. 4.1.a). Dental services are not in the art. 4.2 list that raises the limit to €3,000.
  - Monthly invoices to a clinic will usually exceed €400.
  - Even under €400, a simplificada to an empresario must show the recipient's NIF and domicilio when they ask (art. 7.2). **[INFERRED]** Always use F1 for clinics.
- **[CONFIRMED] Recipient data:**
  - The clinic's NIF is mandatory: art. 6.1.d.3º covers operations in Spain by an issuer established there.
  - Also required: the clinic's full razón social (6.1.c) and domicilio (6.1.e).
- **[CONFIRMED] Verifacti census check:**
  - For **personas jurídicas**, a NIF that exists in the census is enough.
  - For **personas físicas**, the NIF must be in the census **and** the `nombre` must be "suficientemente parecido" to the census name. This matters when the clinic is owned by an individual autónomo.
  - The check is on by default (`validar_destinatario`) and can be turned off **only in test**.
  - **[INFERRED]** Validate the clinic with `POST /nifs/validar` when it is created in the app, so `/create` does not fail with a 400.
  - Source: https://www.verifacti.com/docs (field `nif` and `validar_destinatario`).

## 4. Health data on the invoice (RGPD)

- **[CONFIRMED] Treatment descriptions linked to an identifiable patient are health data.**
  - RGPD art. 4.15 defines health data as data on physical or mental health, "incluida la prestación de servicios de atención sanitaria, que revelen información sobre su estado de salud". Health data is a special category under art. 9.1.
  - The AEPD (Gabinete Jurídico 015/2024) says invoice descriptions "podrá consistir, y muchas veces será así, en descripción de operaciones de personas físicas que pongan de manifiesto datos sensibles (de salud, una factura de un tratamiento médico…)". Such data needs both an art. 6 legal basis and an art. 9.2 exception.
  - Sources: https://www.boe.es/buscar/doc.php?id=DOUE-L-2016-80807 and https://www.aepd.es/documento/2024-0015.pdf
- **[INFERRED] What dentist → clinic invoices typically contain, and what that means:**
  - Liquidation invoices often include a **per-patient detail** (patient name, date, treatment, amount) to justify a percentage of production.
  - The ROF does **not** require it. Art. 6.1.f asks only for a description that allows the base to be determined, e.g. "Servicios odontológicos prestados en [clínica] durante [mes/año]" plus the amount.
  - Data minimisation (RGPD art. 5.1.c) points to:
    1. a generic concept on the invoice;
    2. any per-patient breakdown in a **separate annex or liquidation sheet**, ideally with clinic patient IDs or history numbers instead of names. That annex is not part of the fiscal invoice.
  - **[CONFIRMED] The invoice `descripcion` (up to 500 chars) is sent to the AEAT** inside the VeriFactu record. Putting patient names or treatments there would transmit health data to the AEAT and Verifacti.
  - **Product rule:** the description field should hold a generic concept, with patient detail kept in an optional annex (Verifacti `/create`, field `descripcion`).
- **[CONFIRMED] The SaaS is an encargado del tratamiento.** Its contract must meet RGPD art. 28.3. Key points for access during support:
  - (a) process data only on the controller's **documented instructions**. Write support access into the contract or DPA as a processing purpose, for example "acceso puntual para soporte técnico a petición del cliente". **[INFERRED]** Also log every access.
  - (b) staff with access are bound by **confidentiality**;
  - (c) art. 32 security measures;
  - (d) sub-processors (hosting, Verifacti, email) only with the controller's prior authorisation, general or specific, and with the same obligations passed down;
  - (g) delete or return the data at the end of the service;
  - (h) audits.
  - LOPDGDD art. 33.1: access by an encargado that is needed to provide the service is not a "comunicación de datos" when the RGPD is complied with.
  - LOPDGDD art. 33.3: if a legal retention duty applies (invoices: 4 years under the LGT), the data must be **returned, not destroyed**.
  - LOPDGDD art. 33.2: anyone who uses the data for their own purposes becomes a responsable.
  - Sources: RGPD art. 28 (BOE link above) and https://www.boe.es/buscar/act.php?id=BOE-A-2018-16673
- **[INFERRED] Who is the controller of patient data on the invoice?** The clinic is the primary controller of patient data. The dentist processes it to justify the fee, and the SaaS is the dentist's encargado. Avoiding patient-level data in the SaaS avoids most of this complexity.
- **[CONFIRMED] DPIA (EIPD):**
  - The AEPD's art. 35.5 list exempts "Tratamientos realizados en el ejercicio de su labor profesional por trabajadores autónomos que ejerzan de forma individual, en particular médicos, profesionales de la salud", unless the processing significantly meets **two or more** criteria of the art. 35.4 list.
  - The art. 35.4 list counts special-category data (criterion 4) and large scale (criterion 7) as criteria. A DPIA is required in most cases where **two or more** are met.
  - **[INFERRED]** The individual dentist does not need a DPIA.
  - **[INFERRED]** A SaaS holding patient-level treatment data for many dentists would meet criteria 4 and 7. Under art. 28.3.f it must help its controllers with DPIAs.
  - Keeping patient detail **out** of the SaaS removes the issue.
  - Sources: https://www.aepd.es/documento/listasdpia-35.5l.pdf and https://www.aepd.es/documento/listas-dpia-es-35-4.pdf
- **[CONFIRMED] DPO:** an individual health professional is exempt from appointing a DPO (LOPDGDD art. 34.1.l, second sentence). **[INFERRED]** The SaaS needs one only if RGPD art. 37.1 applies, i.e. large-scale special-category processing as a core activity, which again depends on storing patient data.
- **[CONFIRMED] Higher risk factor:** LOPDGDD art. 28.2.c treats processing of art. 9 data that is "no meramente incidental o accesorio" as higher risk, and art. 28.2.a covers loss of confidentiality of data under professional secrecy.

## 5. Other dentist → clinic particularities for the MVP

- **[CONFIRMED] Monthly liquidation invoices (facturas recapitulativas):**
  - Services to the same clinic within one calendar month may go on a single invoice (ROF art. 13.1).
  - With an empresario as recipient, the invoice must be issued **before the 16th of the following month** (art. 13.2 and art. 11.1).
- **[CONFIRMED] Operation date:** it is mandatory when it differs from the issue date (ROF art. 6.1.i). The VeriFactu record has a single `fecha_operacion`, which may be in the past.
  - **[UNCERTAIN]** Which date to use for a monthly invoice. One secondary source says "la fecha de la operación más reciente" (no primary source found). The AEAT FAQ uses "el último día en el que se haya efectuado la operación" only for rectificativas of several invoices (https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/procedimientos-facturacion.html).
  - **[INFERRED]** Default to the last day worked in the month, or the month's last day, and print "Periodo: 1–31 mm/aaaa".
  - Remember that `fecha_expedicion` must be **today** in Verifacti, so the invoice must be generated on the day it is issued.
- **[CONFIRMED] Pricing as a percentage of production** is not regulated by the invoicing rules. The invoice needs only the base and a description (ROF art. 6.1.f).
  - **[INFERRED]** Model each line as "Honorarios X% s/ producción de N €", with a unit price.
  - Note in passing (not researched): heavy economic dependence on a single clinic raises employment-status ("falso autónomo") and TRADE questions that are outside invoicing.
- **[CONFIRMED] Self-billing by the clinic:** clinics often issue the liquidation themselves. That is legal as "facturación por el destinatario" (ROF art. 5), but it requires:
  - a prior agreement;
  - a separate series for each issuer (art. 6.1.a.1º);
  - the mention "facturación por el destinatario" (art. 6.1.l).
  - Then it is the **clinic's** SIF that generates the VeriFactu record, with `emitida_por_tercero_o_destinatario: "D"`.
  - **[INFERRED]** The SaaS must let the dentist record that a clinic self-bills, so the same income is not invoiced twice.
- **[CONFIRMED] Advance payments:** a payment received before the service requires an invoice (ROF art. 2.1, second paragraph). The DGT applied this to exempt dental treatment paid monthly in V0241-18 (https://www.iberley.es/resoluciones/resolucion-vinculante-dgt-v0241-18-01-02-2018-1474166). This mainly affects clinics invoicing patients, not dentist → clinic.
- **[INFERRED] Insurers and mutuas:** if the dentist bills an insurer directly, it is another B2B F1, exempt E1, with retention (the insurer is an entity, RIRPF art. 76.1.a). The structure is the same as a clinic.
- **[INFERRED] Corrections:** if a clinic disputes a liquidation after issue, issue an R1 rectificativa in its own series (see verifactu-verifacti.md §10). Use **R1** (art. 80.Uno/Dos/Seis, or an error under art. 15 ROF) for price changes and **R4** for other errors.
  - **[UNCERTAIN]** Which R-code fits "clinic recalculated production". Confirm with an adviser.

## 6. Notes on patient invoicing (deprioritised; for later)

- **[CONFIRMED]** A simplificada (F2) is allowed for patients only up to €400 incl. IVA (ROF art. 4.1.a). Dental services are not in the €3,000 list (art. 4.2).
- **[CONFIRMED]** In a factura completa, the recipient's NIF is literally mandatory for operations in Spain by an established issuer (ROF art. 6.1.d.3º), and so is the domicilio (6.1.e). The ROF has no exception for consumers.
- **[CONFIRMED]** In Verifacti, `nombre` is required except for F2/R5. A recipient that is a persona física is checked by NIF plus an approximately matching name, and the check cannot be disabled in production.
- **[INFERRED]** Patients with name mismatches would cause 400s. This matters only if patient invoicing is added later.

# Rectificativas (R1–R5) and FechaOperacion for the dentist → clinic invoice

Researched 2026-10-02. This file builds on `verifactu-verifacti.md` (§8, §10, §11) and `dentista.md` (§1, §2, §5) and does not repeat them.
Tags: **[CONFIRMED]** means read directly in a primary source. **[INFERRED]** means a reasoned conclusion. **[UNCERTAIN]** means it needs checking with an adviser or with AEAT.

Context: an autónomo dentist bills clinics monthly with an F1 invoice. Lines are IVA-exempt (E1, LIVA art. 20.Uno.5º) and carry IRPF retention. Corrections are made by differences only (`tipo_rectificativa = I`).

Sources:

- LIVA, Ley 37/1992 (consolidated), arts. 80 and 89: https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740
- ROF, RD 1619/2012 (consolidated), arts. 6, 13 and 15: https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696
- Orden HAC/1177/2024, annex list L2: https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138
- LGT, Ley 58/2003, art. 201: https://www.boe.es/buscar/act.php?id=BOE-A-2003-23186
- AEAT VERI\*FACTU FAQ "Procedimientos de facturación" (page updated 22/07/2026): https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/procedimientos-facturacion.html
- AEAT developer FAQ (4 Dec 2025), §17, §19, §20, §27: https://sede.agenciatributaria.gob.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/FAQs-Desarrolladores.pdf
- AEAT "Validaciones y errores" v1.2.2: https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/Validaciones_Errores_Veri-Factu.pdf
- AEAT XSD `SuministroInformacion.xsd`: https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SuministroInformacion.xsd
- AEAT SII FAQ (30/12/2025), FAQ 2.31: https://sede.agenciatributaria.gob.es/static_files/Sede/Procedimiento_ayuda/G417/FicherosSuministros/V_1_1/FaqGral/FAQs_SII_30_12_2025.pdf
- Verifacti API docs (`/create`): https://www.verifacti.com/docs
- DGT V1269-25 (09/07/2025). I could not fetch the text from petete, so it is read through two reproductions: https://primeralecturaediciones.com/consultas/archivo/facturas-con-retencion-indebida-no-es-obligatorio-emitir-factura-rectificativa-si-los-requisitos-formales-estan-cumplidos/ and https://www.iberley.es/noticias/tributos-senala-si-ha-emitirse-factura-rectificativa-si-se-han-incluido-factura-retenciones-que-no-debian-practicarse-35642

---

## 1. What R1–R5 mean

### Official definitions

- **[CONFIRMED]** Orden HAC/1177/2024, annex list L2:
  - **R1**: "Factura Rectificativa (Error fundado en derecho y art. 80 Uno Dos y Seis LIVA)".
  - **R2**: art. 80.3, concurso de acreedores.
  - **R3**: art. 80.4, crédito incobrable.
  - **R4**: "Factura Rectificativa (Resto)".
  - **R5**: "Factura Rectificativa en facturas simplificadas".
- **[CONFIRMED]** The AEAT procedures FAQ expands these:
  - **R1** covers an "error fundado de derecho", or a cause in art. 80.Uno, Dos or Seis. The FAQ lists those causes as "devoluciones de mercancías, descuentos o alteraciones en el precio posteriores a la realización de la operación, resolución de operaciones, importe de la contraprestación provisional".
  - **R4** applies "Cuando se haya producido una modificación de la base imponible del IVA por causas distintas a las previstas en el artículo 80 LIVA y no se deba a un error fundado de derecho". It also applies "Cuando se haya consignado erróneamente algún dato no monetario de la factura".
  - **R5** is used for a rectified simplificada "cualquiera que sea el motivo". It never applies to our F1 invoices.

### What the LIVA articles say

- **[CONFIRMED]** Art. 80.Uno.2º covers discounts and bonificaciones granted after the operation.
- Art. 80.Dos covers operations that are cancelled ("queden sin efecto"), wholly or partly, or whose price is altered after the operation, "con arreglo a Derecho o a los usos de comercio".
- Art. 80.Seis covers a consideration that is unknown at devengo. It is fixed provisionally "aplicando criterios fundados" and rectified once known.
- Art. 89.Uno requires rectifying cuotas when they were "determinado incorrectamente" or when an art. 80 cause occurs.

### So is R1 vs R4 just "art. 80.Uno/Dos/Seis vs everything else"?

**[CONFIRMED]** Almost. There are two refinements:

- An **error fundado de derecho** also goes in **R1**. This is a legal-qualification error, for example applying exemption vs taxation on a reasonable but wrong interpretation.
- **R4** is the residual code. It covers material errors (wrong figure typed, wrong recipient data or other non-monetary data) and any base change outside art. 80 that is not an error of law.

### Mapping of the plain-language causes

| Cause | Code | Basis |
|---|---|---|
| (a) Material error in base or amount, or wrong recipient data | **R4** | **[CONFIRMED]** |
| (a) Wrong IVA treatment (exempt vs taxed) caused by a reasonable legal misreading | **R1** | **[INFERRED]** error fundado de derecho |
| (a) Wrong IVA treatment caused by a slip | **R4** | **[INFERRED]** |
| (b) Later discount or bonificación | **R1** | **[CONFIRMED]** art. 80.Uno.2º |
| (b) Return (devolución) | **R1** | **[CONFIRMED]** listed in the AEAT FAQ |
| (c) Operation cancelled, or price changed after issue | **R1** | **[CONFIRMED]** art. 80.Dos |
| (d) Clinic recalculates the month's production | **R1** or **R4** | see below |
| (e) Other | **R4** | **[CONFIRMED]** "Resto" |

On (d):

- **[INFERRED]** Use **R1** when the fee depends on figures not final at issue (patient cancellations, collections, laboratory adjustments). That is either a provisional consideration (art. 80.Seis) or a later price alteration agreed under the contract (art. 80.Dos). It is the natural fit for "X% of production" that the clinic settles later.
- **[INFERRED]** Use **R4** if the original invoice simply used the wrong production figure, i.e. a material error.
- **[UNCERTAIN]** No DGT ruling was found on percentage-of-production fees. Confirm with an adviser.

### Sanction risk if the code is wrong

- **[CONFIRMED]** LGT art. 201.2.a makes non-compliance with invoicing requirements, including "rectificación", a serious infraction with a fine of **1% of the operations affected**. Art. 201.3 makes **false data** very serious, at 75%.
- **[INFERRED]** The practical effect of R1 vs R4 is in VAT settlement. Under LIVA art. 89.Cinco, an **increase** in cuota under art. 80 or an error fundado de derecho can go in the current period's return. Any other increase needs a complementary return with surcharge and interest. With exempt lines there is no cuota, so this difference is essentially moot here. The dentist, with only exempt operations, generally files no 303.
- **[INFERRED]** A wrong R1/R4 code on an exempt correction carries low practical risk. Fines are also excluded where there was due diligence or a reasonable interpretation (LGT art. 179.2.d).
- **[UNCERTAIN]** Whether a wrong TipoFactura can be fixed by an alta de subsanación. The developer FAQ §17 allows subsanación for record-only fields not shown on the printed invoice, and the R-code is not printed. But AEAT does not say explicitly that TipoFactura may change in a subsanación.

### What AEAT recommends when unsure

- **[CONFIRMED]** AEAT gives no explicit "when unsure" rule.
- **[CONFIRMED]** In its procedures FAQ examples that are not about art. 80, AEAT uses **R4**: all "rectificación de factura rectificativa" cases are R4, and the "Rx" placeholder is used for generic diferencias.
- **[INFERRED]** Default to **R4** unless the user picks a named art. 80 cause.

## 2. Exempt invoices, and errors in IRPF only

### Exempt invoices still need R1 or R4

- **[CONFIRMED]** ROF art. 15.1 requires a rectificativa whenever the invoice fails an art. 6 requirement. That includes 6.1.f, the description and the data needed to determine the base. Art. 15.2 requires one for art. 80 base modifications.
- Neither article depends on there being a cuota. LIVA art. 89.Dos also applies "cuando, no habiéndose repercutido cuota alguna, se hubiese expedido la factura".
- **[CONFIRMED]** There is no other mechanism. ROF art. 15.6 says only invoices issued for the causes in 15.1 and 15.2 count as rectificativas. AEAT reserves anulación for invoices that should never have existed (developer FAQ §17).
- **[CONFIRMED]** So an exempt F1 is corrected with an **R1 or R4** record whose lines use `operacion_exenta: E1` and a signed base.
  - The XSD type `ImporteSgn12.2Type` for `BaseImponibleOimporteNoSujeto` and `ImporteTotal` allows `-`.
  - No validation forbids a negative exempt base.
  - Verifacti's own diferencias example is negative.

### When only the IRPF retention was wrong

- **[CONFIRMED]** The retention is not an art. 6 ROF requirement and is not in the VeriFactu record (developer FAQ §20).
- **[CONFIRMED, via reproductions]** DGT V1269-25 (09/07/2025): when the invoice met art. 6, a wrong retention does **not** require a rectificativa. The issuer may voluntarily replace the invoice "por causa justificada", but the replacement is **not** a factura rectificativa (art. 15.6; the ruling cites V0611-11).
- **[CONFIRMED]** Developer FAQ §17, case 2.c: an error that is outside the ROF and affects no record field is fixed by correcting the invoice document. **No new record** is needed.
- **[INFERRED]** For a retention-only error, regenerate the PDF with the right retention and "Total a pagar", keeping the same number, date and record. Log the change internally for audit. Do not emit R1 or R4.
- **[UNCERTAIN]** How an AEAT inspector would view a re-issued PDF that differs from the first one sent. Keep both versions.

## 3. Rectificativa by differences (`I`)

- **[CONFIRMED] Fields.** `TipoFactura` is R1–R4 and `TipoRectificativa = I`.
  - `ImporteRectificacion` (Verifacti: `importe_rectificativa`) **must not** be sent. It is "Obligatorio si TipoRectificativa = S" and allowed only then (Validaciones §3, items 3 and 6). AEAT FAQ: "En este caso no se deben rellenar los campos adicionales 'Base rectificada' y 'Cuota rectificada'".
  - The lines and `ImporteTotal` carry **the difference itself**.
- **[CONFIRMED] Negative amounts are allowed.** ROF art. 15.5 says the rectification amount may be stated "con independencia de su signo".
  - AEAT FAQ example 1 (I): base −200, cuota −42, ImporteTotal −242.
  - The XSD amounts are signed.
  - Verifacti's example sends `base_imponible: "-500"` and `importe_total: "-605"`.
  - For E1 lines, send only `base_imponible` (negative or positive) and `operacion_exenta: "E1"`, with `importe_total` equal to the sum of the bases.
- **[CONFIRMED] Identifying the rectified invoices.**
  - The ROF requires it on the invoice document (art. 15.4: "los datos identificativos de la factura rectificada").
  - In the record, `FacturasRectificadas` is **optional** (Validaciones: "no es obligatoria"). Each entry is serie+número plus fecha de expedición.
  - The exception is volume discounts (rappels), where stating the period is enough (art. 15.4; developer FAQ §19).
  - **[INFERRED]** Always send `facturas_rectificadas`. It costs nothing and matches the paper invoice.
- **[CONFIRMED] One rectificativa can cover several invoices.** ROF art. 15.4 allows it "siempre que se identifiquen todas las facturas rectificadas".
  - The XSD allows `IDFacturaRectificada maxOccurs="1000"`.
  - `FechaOperacion` is then the date of the most recent rectified operation. AEAT FAQ: "el último día en el que se haya efectuado la operación que documenta la última factura rectificada".
  - For a single invoice, `FechaOperacion` is the original operation date.
- **[CONFIRMED]** Rectificativas need their own **series** (ROF art. 6.1.a), and the record requires the recipient (Destinatarios is mandatory for R1–R4).
- **[INFERRED]** Rectifying several clinics' invoices in one R is impossible, because each invoice has one recipient. Keep one invoice per clinic.

## 4. FechaOperacion for the monthly recapitulative invoice

- **[CONFIRMED] What the ROF requires.** The operation date is art. **6.1.i**, not 6.1.f. It must appear "siempre que se trate de una fecha distinta a la de expedición de la factura".
  - Art. 6.1.f requires the description of the operations and the data needed for the base. It says nothing about dates or periods.
  - Art. 13.1 allows grouping operations "realizadas en distintas fechas" within one calendar month.
  - Art. 13.2: when the recipient is an empresario, issue before the 16th of the following month.
  - **The ROF does not require stating a "period" as such.**
  - **[INFERRED]** Printing "Periodo de prestación: 01/MM–31/MM/AAAA", or the list of days worked, satisfies 6.1.i for multiple dates.
- **[CONFIRMED] AEAT criterion (SII FAQ 2.31, for art. 13 recapitulativas).** "Se consignará el último día del mes natural en que se hayan efectuado las operaciones que documenta la factura recapitulativa o, en caso de que el periodo recapitulativo sea inferior al mes, el último día en que se realiza la operación de ese periodo." The FAQ's example: an invoice issued on 25 July covering 1, 10, 15 and 20 July gets 20 July.
  - No VERI\*FACTU-specific FAQ on recapitulativas was found.
  - **[INFERRED]** The record field is the same concept and the AEAT VERI\*FACTU FAQs explicitly reuse the SII approach (developer FAQ §17 points to the SII FAQs), so this criterion applies.
- **[CONFIRMED] Validation limits.**
  - `FechaOperacion` is optional in the XSD (`minOccurs="0"`). If omitted, AEAT uses `FechaExpedicionFactura` in the date-dependent validations.
  - It may not be later than the current date or the issue date unless ClaveRegimen is 14 or 15 (Validaciones §3.1 and §3.7).
- **[INFERRED] Rule for the product.**
  - When the invoice is issued **after** the month, which is the normal case (1st–15th of the next month), send `fecha_operacion` = **the last day of the month invoiced**.
  - When it is issued **inside** the month, send the **last day actually worked**. The validation would also reject a future date.
  - If that date equals the issue date, `fecha_operacion` may be omitted.
  - Do not leave it empty when the dates differ: art. 6.1.i makes the date mandatory then.
- **[CONFIRMED]** For an R covering one monthly invoice, `fecha_operacion` = the original invoice's `fecha_operacion` (AEAT procedures FAQ).

## 5. IRPF retention on resold material

- **[CONFIRMED]** RIRPF art. 75.1.c subjects to retention only professional income, agricultural, livestock and forestry income, and some módulos business income. It does not cover ordinary business (commercial) income. Art. 95.2.a defines professional income by IAE sections 2 and 3.
- **[CONFIRMED]** (already in `dentista.md`, V2266-21) When prostheses or appliances are part of the dentist's professional service, the **whole invoice** is the retention base.
- **[INFERRED]** Retention is excluded only if the material is a genuinely separate commercial sale, registered under a section-1 IAE epígrafe and invoiced as such, or a true suplido paid in the clinic's name. For aligners or prostheses fitted by the dentist, assume **retention applies to the full amount**.
- **[UNCERTAIN]** Confirm a separate-sale setup with an adviser.

---

## Recommended mapping (the product's "reason" picker → record)

| User-facing reason | tipo_factura | tipo_rectificativa | Lines | importe_rectificativa | facturas_rectificadas | fecha_operacion |
|---|---|---|---|---|---|---|
| Discount or bonificación agreed after issue | R1 | I | E1, negative base | omit | original(s) | original's (latest if several) |
| Service cancelled, or price changed after issue | R1 | I | E1, ± base | omit | original(s) | same |
| Clinic recalculated production (settled later / provisional fee) | R1 | I | E1, ± base | omit | original | same |
| Typo in amount, or wrong production figure used | R4 | I | E1, ± base | omit | original | same |
| Wrong recipient data or other non-monetary data | R4 | I | E1, base 0 (**[UNCERTAIN]**; many SIFs use S for this) | omit | original | same |
| Wrong IVA treatment, legal misreading | R1 | I | adjust lines | omit | original | same |
| Other / unsure | R4 | I | ± base | omit | original | same |
| Only the IRPF retention was wrong | none (no rectificativa) | — | — | — | — | Re-issue the PDF; no new record |
| Monthly F1 (not a rectificativa) | F1 | — | E1 | — | — | Last day of the month (if issued after it); else last day worked |

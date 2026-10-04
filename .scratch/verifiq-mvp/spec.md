# Spec: Verifiq MVP

Status: ready-for-agent

Referencias: `GLOSSARY.md`, `docs/adr/0001`–`0005`, `docs/research/verifactu-verifacti.md`, `docs/research/dentista.md`, `docs/research/rectificativas-y-fechas.md`. Diseño: `design.html` y el brief de diseño del MVP.

## Problem Statement

A partir del 1 de julio de 2027 todo autónomo en España debe expedir sus facturas con un sistema informático que remita cada Registro de facturación a la AEAT (VeriFactu). Los autónomos a los que atiendo —el primero, un dentista que factura mensualmente a varias clínicas— no tienen formación fiscal, no quieren pelearse con certificados digitales ni con la normativa, y temen las sanciones: una factura mal numerada, borrada, corregida de forma incorrecta o no registrada puede costarles dinero. Necesitan una herramienta sencilla para emitir sus facturas correctamente, ver de un vistazo si Hacienda las ha recibido, corregirlas por la vía legal cuando se equivocan y conservar su histórico.

Como productor del software, además, debo cumplir ya las obligaciones de un SIF (declaración responsable, integridad, trazabilidad) desde la primera factura que se emita con Verifiq.

## Solution

Verifiq es una aplicación web, por invitación, en la que un Usuario da de alta a su Emisor, firma online la Representación para que el conector presente sus registros ante la AEAT (sin certificado digital) y, a partir de ahí:

- Mantiene sus Destinatarios (clínicas/empresas con NIF español validado contra el censo) y un catálogo de Artículos.
- Prepara Borradores de factura con varias líneas, IVA por línea (incluido Exenta con Supuesto de exención), Retención de IRPF por factura y Periodo facturado.
- Pulsa **Emitir**: la factura recibe su número correlativo en la Serie, queda congelada y se registra automáticamente en la AEAT a través de Verifacti. En 1–2 segundos dispone del PDF con el QR tributario; en 1–2 minutos ve la confirmación de Hacienda.
- Si algo falla, la app le dice qué pasa y le ofrece la acción correcta (corregir y reintentar, subsanar, rectificar).
- Corrige facturas emitidas solo por vías legales: Factura rectificativa por diferencias (motivo en lenguaje llano), Corregir destinatario (Anulación si no se entregó, rectificativa total si sí), Corregir retención (nueva versión del PDF) y Anulación para facturas que nunca debieron existir.
- Consulta, filtra y exporta todo su histórico.

El operador del SaaS (yo) invita a los Usuarios y vigila la salud operativa desde un panel que nunca expone facturas ni Destinatarios.

## User Stories

### Acceso y seguridad

1. As an operador, I want to generate an invitation link for a new Usuario, so that only people I approve can create accounts and cost me Verifacti fees.
2. As an invited Usuario, I want to open the invitation link and set my password, so that I can access Verifiq.
3. As an invited Usuario, I want to be forced to set up TOTP 2FA on first access, so that my fiscal data is protected even if my password leaks.
4. As a Usuario, I want to receive recovery codes when I set up 2FA, so that I can regain access if I lose my phone.
5. As a Usuario, I want to log in with email, password and a 2FA code, so that only I can issue invoices in my name.
6. As a Usuario, I want to reset my password by email, so that I can recover access if I forget it.
7. As a Usuario, I want to receive an email when a new login occurs, so that I detect unauthorised access.
8. As a Usuario, I want my session to expire after inactivity, so that a forgotten open browser is not a risk.
9. As a Usuario, I want to see and revoke my active sessions, so that I can cut off devices I don't recognise.
10. As a Usuario, I want to regenerate my 2FA recovery codes, so that I can replace codes I've used or lost.
11. As an operador, I want login attempts to be rate-limited, so that brute-force attacks are impractical.
12. As an expired or invalid invitation holder, I want a clear message, so that I know to ask for a new invitation.

### Alta del Emisor

13. As a new Usuario, I want a step-by-step onboarding wizard that I can leave and resume, so that I can complete it at my own pace.
14. As a new Usuario, I want to enter my fiscal data (name, NIF, fiscal address), so that my invoices carry the legally required Emisor data.
15. As a new Usuario, I want my NIF format to be validated as I type, so that I don't register with a typo.
16. As a new Usuario, I want to optionally add email, phone, IBAN and logo, so that my invoices look professional and tell clients how to pay.
17. As a new Usuario, I want to set my default Retención de IRPF (15 %, 7 % or none), so that I don't choose it on every invoice.
18. As a new Usuario, I want to set my default IVA, including "Exenta" with a Supuesto de exención, so that as a dentist I never have to touch the IVA field.
19. As a new Usuario, I want to choose my Serie prefix once (proposed `F<año>-` / `R<año>-`), with a warning that it must differ from series used in other software, so that my new numbering never collides with invoices issued elsewhere this year.
20. As a new Usuario, I want my numbering to start at 1 in the new Serie, so that I don't need to know my previous software's counter.
21. As a new Usuario, I want to accept the terms of use and the data processing agreement, with the version and date recorded, so that the legal relationship is clear.
22. As a new Usuario, I want to sign the Representación online by verifying my identity with my DNI, without a digital certificate, so that Verifiq can register my invoices at the AEAT.
23. As a new Usuario, I want to see the Representación status (pending, signed, error) and resend the signing link, so that I know whether I can issue invoices yet.
24. As a new Usuario, I want to create Destinatarios, Artículos and Borradores before my Representación is signed, so that I can prepare while waiting.
25. As a Usuario without a valid Representación, I want the Emitir action disabled with a persistent explanation, so that I never issue an invoice that can't be registered.
26. As an operador, I want the Emisor's Verifacti key to be created automatically during onboarding, so that I don't do manual setup per client.

### Destinatarios

27. As a Usuario, I want to create a Destinatario with name/company name, NIF/CIF, address, postal code, municipality and province, so that I can invoice them.
28. As a Usuario, I want the Destinatario's NIF to be checked against the AEAT census when I save it, so that emissions don't fail later for a wrong NIF.
29. As a Usuario, I want a clear message when a NIF isn't in the census, so that I can correct it.
30. As a Usuario, I want to edit a Destinatario, knowing it won't alter already-issued invoices, so that I can keep data up to date safely.
31. As a Usuario, I want Destinatarios with issued invoices to be archived instead of deleted, so that history stays consistent.
32. As a Usuario, I want archived Destinatarios hidden from selectors but visible in their invoices, so that my lists stay clean.
33. As a Usuario, I want to delete a Destinatario that has never been invoiced, so that I can remove mistakes.
34. As a Usuario, I want to search my Destinatarios, so that I find a clinic quickly.

### Artículos

35. As a Usuario, I want to create Artículos with name, default price, default IVA and Supuesto de exención, so that I can fill invoice lines quickly.
36. As a Usuario, I want to add an Artículo to an invoice line and have its values copied, so that later catalogue changes never alter my invoices.
37. As a Usuario, I want to edit and delete Artículos at any time, so that my catalogue stays current.

### Borradores

38. As a Usuario, I want to create a Borrador without a number, so that discarding it never leaves a gap in my Serie.
39. As a Usuario, I want to pick a Destinatario with search, or create one inline, so that I don't leave the invoice form.
40. As a Usuario, I want to add multiple lines with concept, quantity, unit price, optional discount %, IVA and amount, so that I can itemise my work.
41. As a Usuario, I want each line's IVA to default to my Emisor default (or the Artículo's), so that exempt dental services are exempt automatically.
42. As a Usuario, I want to mark a line as Exenta and pick its Supuesto de exención, so that the legally required mention is printed automatically.
43. As a Usuario, I want to set a line to 21/10/4/0 % IVA when needed (e.g. resold material), so that I stay responsible for and able to apply the correct tax.
44. As a Usuario, I want to choose the Retención de IRPF per invoice (15 %, 7 %, none), so that I can handle clinics and exceptions.
45. As a Usuario, I want to set a Periodo facturado (from/to), so that the operation date and the Descripción de la operación are filled automatically.
46. As a Usuario, I want the Descripción de la operación to be prefilled generically (e.g. "Servicios odontológicos septiembre 2026") and editable, with a warning never to include patient data, so that no health data reaches the AEAT.
47. As a Usuario, I want a live summary with bases per IVA rate, quotas, exempt bases with their mention, Importe total, Retención de IRPF and Total a pagar, so that I see exactly what the clinic will pay.
48. As a Usuario, I want amounts calculated with exact decimal arithmetic and consistent rounding, so that totals never differ by cents from what Hacienda expects.
49. As a Usuario, I want the issue date fixed to today, so that I don't attempt invalid back-dating.
50. As a Usuario, I want inline validation errors before emitting, so that I fix problems before anything is registered.
51. As a Usuario, I want to preview the invoice before emitting, so that I check it looks right.
52. As a Usuario, I want to save, edit and delete Borradores freely, so that preparing invoices is low-stress.

### Emisión

53. As a Usuario, I want a confirmation before emitting showing Destinatario, Total a pagar and the number to be assigned, with a clear warning that it's irreversible, so that I don't emit by accident.
54. As a Usuario, I want the next correlative number in my Serie assigned atomically on emission, so that numbering is legal even if I emit two invoices at once.
55. As a Usuario, I want the issued invoice frozen with a snapshot of Emisor and Destinatario data, so that later edits never change it.
56. As a Usuario, I want to see "Enviando…" and then the QR within seconds, so that I know my invoice is registered.
57. As a Usuario, I want the PDF to be downloadable only once the QR exists, so that no unregistered invoice ever leaves Verifiq.
58. As a Usuario, I want submission to retry automatically if Verifacti is temporarily down, so that I don't have to babysit it.
59. As a Usuario, I want retries never to register my invoice twice, so that I don't create duplicates at the AEAT.
60. As a Usuario, I want a Registro blocked by a validation error to show a clear explanation and let me correct the data and retry with the same number, so that I can fix mistakes before the invoice exists at the AEAT.
61. As a Usuario, I want the AEAT's verdict (Aceptada, Aceptada con errores, Rechazada) to appear automatically, so that I know Hacienda has my invoice.
62. As a Usuario, I want a Rechazada Registro to show the AEAT reason and let me correct and resend (Subsanación), so that I can resolve rejections.
63. As a Usuario, I want an Aceptada con errores Registro to offer Subsanar or Rectificar, so that I fix the problem the right way.
64. As a Usuario, I want a visible warning if a Registro remains unconfirmed for more than 24 h, so that I'm not unaware of a stuck invoice.

### Factura emitida y PDF

65. As a Usuario, I want an invoice detail with number, date, Destinatario, Total a pagar, invoice status and Registro status, so that I see its legal situation at a glance.
66. As a Usuario, I want the PDF to include the QR tributario at the top (30–40 mm, with "QR tributario:" and "VERI*FACTU"), so that it complies with the regulation.
67. As a Usuario, I want the PDF to include all mandatory content (Emisor, Destinatario, number, dates/period, lines, tax breakdown, exemption mentions, Importe total, Retención de IRPF, Total a pagar), so that it's a valid invoice.
68. As a Usuario, I want my IBAN and logo on the PDF, so that clinics know how to pay me.
69. As a Usuario, I want the PDF generated once from the frozen snapshot and stored, so that it is identical every time I download it.
70. As a Usuario, I want a timeline of events for each invoice (emitted, sent, accepted, new PDF version, rectified…) with date, time and user, so that I have full traceability.
71. As a Usuario, I want links between a rectified invoice and its rectificativas, so that I can follow corrections.

### Correcciones

72. As a Usuario, I want to Rectificar an issued invoice by choosing a plain-language reason (later discount/return/price change, clinic recalculated production, IVA error, amounts/data error, other) plus a free-text reason, so that the correct legal code (R1/R4) is applied without me knowing it.
73. As a Usuario, I want the rectificativa to be a Borrador in the R Serie linked to the original, where I enter the difference (negative if it decreases), so that I can review it before emitting.
74. As a Usuario, I want a "Rectificar totalmente" shortcut that preloads all lines negated, so that cancelling an invoice's effect is one click.
75. As a Usuario, I want the rectificativa PDF to show the rectified invoice's number and date and the reason, so that it's legally complete.
76. As a Usuario, I want "Corregir destinatario" to ask whether I already sent the invoice, and then Anular (not sent) or Rectificar totalmente (sent), followed by a new prefilled Borrador for the right Destinatario, so that I fix the mistake the legal way in one flow.
77. As a Usuario, I want "Corregir retención" to change only the IRPF % and produce a new PDF version with the same number, keeping the previous version, so that I fix IRPF mistakes without a rectificativa.
78. As a Usuario, I want "Anular" behind a strong confirmation (typing the invoice number) explaining that it's only for invoices that should never have existed and that the number is burned, so that I don't misuse it.
79. As a Usuario, I want Anulación and rectification never combined on the same invoice, so that I don't create contradictory records.
80. As a Usuario, I want an anulada invoice to remain visible, read-only and visually dimmed, so that my numbering history stays complete.

### Listado y exportación

81. As a Usuario, I want an invoice list sorted by date (newest first), so that I find recent work first.
82. As a Usuario, I want to search by number, Destinatario or amount, so that I locate an invoice fast.
83. As a Usuario, I want filters (Borradores, Pendientes, Aceptadas, Con incidencias, Rectificadas, Anuladas), so that I focus on what needs attention.
84. As a Usuario, I want invoices with incidents highlighted at the top with a call to action, so that I resolve them first.
85. As a Usuario, I want to export all my invoices as a ZIP of PDFs plus a summary CSV, so that I can hand them to my accountant or keep them if I leave.
86. As a new Usuario, I want a helpful empty state, so that I know how to create my first invoice.

### Ajustes y legal

87. As a Usuario, I want to edit my Emisor data and defaults (except the Serie, shown locked), so that future invoices are correct.
88. As a Usuario, I want to see my Representación status in settings, so that I know if registration is operative.
89. As a Usuario, I want the active Emisor's name and NIF always visible in the header, so that I always know on whose behalf I act.
90. As a Usuario, I want to read the declaración responsable, with the software version, from settings and the footer, so that the app's compliance is transparent.

### Operador

91. As an operador, I want a minimal admin panel listing Emisores with Representación status and invoice counts, so that I can support onboarding.
92. As an operador, I want alerts for Registros stuck or rejected, so that I can help before the Usuario suffers.
93. As an operador, I want the admin panel never to show invoices or Destinatarios, so that I don't access third-party personal data.
94. As an operador, I want every fiscally relevant action recorded in an append-only audit log, so that I can prove what happened and when.
95. As an operador, I want the Verifacti API keys encrypted at rest, so that a database leak doesn't expose the ability to register invoices.
96. As an operador, I want every Verifacti request and response stored, so that I keep evidence beyond Verifacti's own retention.
97. As an operador, I want issued invoices, PDFs and connector responses preserved for 6 years even if a Usuario leaves, so that legal retention is met.
98. As an operador, I want each Emisor's data strictly isolated, so that no Usuario can ever see another Emisor's data.
99. As an operador, I want the software version injected at build time and shown in the declaración responsable, so that each release is identified.
100. As an operador, I want staging to use the Verifacti sandbox with my own NIF, so that tests never create real invoices.

## Implementation Decisions

### Arquitectura y stack (ADR 0003)
- Monorepo pnpm + Turborepo con tres paquetes: web (React + Vite, TanStack Router/Query), api (NestJS) y domain (paquete compartido de lógica pura y schemas zod).
- Postgres en Neon (Frankfurt) con Drizzle y migraciones SQL versionadas, aplicadas como pre-deploy en Render. Solo migraciones compatibles hacia atrás (expand/contract).
- Autenticación con Better Auth embebido: email+contraseña, 2FA TOTP obligatorio con códigos de recuperación, sesiones por cookie httpOnly, expiración por inactividad, rate limiting en login, email de aviso de nuevo login.
- Despliegue: API y worker en Render (dos servicios del mismo código), web estática en Vercel, emails transaccionales con Resend (UE), almacenamiento de objetos en Cloudflare R2 con jurisdicción UE.
- Ramas: PRs de funcionalidad a `stage` (despliega staging); release por PR `stage` → `main` (despliega producción). Ramas protegidas, CI obligatorio. Bases de datos separadas por entorno.

### Modelo de tenancy
- Emisor es la unidad de aislamiento: toda entidad de negocio pertenece a un Emisor. Usuario ↔ Emisor mediante membresía (el MVP crea exactamente una por Usuario). Toda consulta se filtra por el Emisor de la sesión en una capa común, no en cada endpoint.

### Módulos
- **Dominio de importes (paquete domain)**: interfaz pura que, dado un conjunto de líneas (cantidad, precio con hasta 4 decimales, descuento %, tratamiento de IVA) y una Retención de IRPF, devuelve el desglose: bases por tipo, cuotas, bases exentas por Supuesto de exención, Importe total, retención y Total a pagar. Aritmética decimal exacta. Base de línea redondeada a 2 decimales; cuota por tipo calculada sobre la suma de bases del tipo, redondeo half-up a 2 decimales; IRPF sobre la base total. Usado por web (resumen en vivo) y api (fuente de verdad en la Emisión).
- **Validación de identificadores (domain)**: NIF/NIE/CIF españoles (formato y dígito de control).
- **Supuestos de exención (domain)**: catálogo cerrado de supuestos del art. 20 LIVA, cada uno con su mención legal; todos se codifican como E1 ante VeriFactu. Inicialmente al menos "Servicios sanitarios — odontología (art. 20.Uno.5º)".
- **Motivos de rectificación (domain)**: tabla motivo en lenguaje llano → tipo R1/R4 (descuento/devolución/cambio de precio → R1; recálculo de producción por la clínica → R1; error al aplicar IVA → R1; error en importes o datos → R4; otro → R4). Configuración aislada, pendiente de validación por asesor.
- **Facturación (api)**: Borradores, Emisión, correcciones, máquinas de estado. Dos estados independientes:
  - Factura: `borrador → emitida → (rectificada | anulada)`.
  - Registro: `pendiente_envio → enviado → (aceptado | aceptado_con_errores | rechazado)`, más `bloqueado` (400 síncrono) y `sin_confirmar` (>24 h, derivado).
  Las acciones permitidas dependen de ambos estados.
- **Emisión (ADR 0002)**: una transacción que bloquea la Serie (`SELECT … FOR UPDATE` sobre su contador), asigna el siguiente número, congela la copia de la factura (incluidos datos de Emisor y Destinatario y el desglose calculado), crea el Registro en `pendiente_envio` y encola el trabajo de envío (outbox con pg-boss en la misma transacción). Precondiciones: Representación en estado correcto, Destinatario con NIF validado, validación completa del Borrador. La fecha de expedición es la fecha actual (Europe/Madrid).
- **Bloqueado**: si el conector devuelve error de validación síncrono, el número permanece asignado, la factura no tiene PDF, y el Usuario puede corregir los datos de la copia y reintentar con el mismo número. Nunca se libera un número.
- **Series (ADR 0004)**: una Serie ordinaria y una Serie de rectificativas por Emisor y año, con prefijo elegido una vez en el alta; numeración desde 1, contador por Serie, reinicio anual.
- **Correcciones (ADR 0005)**: rectificativa siempre por diferencias (tipo `I`), en la Serie R, con referencia a la(s) factura(s) rectificada(s) y fecha de operación de la original; importes negativos permitidos. "Corregir destinatario" = Anulación + nuevo Borrador si no se entregó; rectificativa total R4 + nuevo Borrador si se entregó. "Corregir retención" = nueva versión del PDF con el mismo número y Registro (la Retención de IRPF no forma parte del Registro), conservando versiones previas. Nunca se combinan Anulación y rectificativa sobre la misma factura. Sin rectificativas por sustitución.
- **Puerto ConectorVeriFactu (ADR 0001)**: interfaz propia del dominio con operaciones de alta de Emisor (crear clave), Representación (iniciar firma remota, consultar estado), validar NIF contra censo, registrar alta, subsanar, anular y consultar estado. Respuestas normalizadas a resultados de dominio (aceptado en cola con huella/QR/URL; rechazo síncrono con código estable y mensaje; error transitorio). Un adaptador Verifacti lo implementa; nada fuera del adaptador conoce Verifacti.
- **Worker de envíos**: consume el outbox, llama al conector con una clave de idempotencia derivada del Registro, guarda huella, QR, URL de verificación y la respuesta íntegra; reintenta errores transitorios con backoff. Servicio separado en Render.
- **Webhook de resultados**: endpoint público que verifica la firma HMAC-SHA256, deduplica por identificador de webhook, responde en <10 s y actualiza el Registro. Respaldo: tarea periódica cada 15 min que consulta el estado de Registros enviados hace más de 10 min; >24 h sin confirmar genera aviso al Usuario y alerta al operador.
- **PDF**: generado en servidor con @react-pdf/renderer a partir de la copia congelada cuando el Registro tiene QR; almacenado en R2 con versión; requisitos de contenido y QR según el brief de diseño. Las descargas sirven el fichero almacenado.
- **Exportación**: ZIP con los PDF vigentes y un CSV resumen de todas las facturas del Emisor.
- **Alta del Emisor**: asistente con estado persistente; crea la clave del Emisor en Verifacti mediante la cuenta del operador, inicia la firma remota de la Representación y sondea su estado. Registra la aceptación versionada de términos y contrato de encargo.
- **Invitaciones**: el operador genera invitaciones de un solo uso con caducidad; no existe registro público.
- **Panel de administración**: rol operador; muestra Emisores, estado de Representación, recuento de facturas y alertas de Registros atascados/rechazados. Sin acceso a facturas ni Destinatarios.
- **Seguridad de datos**: claves de Verifacti cifradas en reposo (AES-GCM, clave maestra fuera de la base de datos); auditoría append-only de toda acción con efecto fiscal (quién, cuándo, qué, sobre qué); las facturas emitidas y sus versiones no admiten UPDATE/DELETE salvo los campos de estado del Registro y las correcciones permitidas en `bloqueado`/`rechazado`.
- **Conservación**: facturas, PDFs y respuestas del conector se conservan 6 años; baja de un Emisor = manual por el operador (desactivar NIF en Verifacti, cuenta en solo lectura). Exportación periódica a R2.
- **Declaración responsable**: página estática con el texto (operador como productor, persona física autónoma), nombre del SIF "Verifiq", versión inyectada en build y referencia a Verifacti y su versión.
- **Entornos**: local (Postgres en Docker o rama Neon), staging (sandbox Verifacti con el NIF del operador; sin Representación), producción.

## Testing Decisions

- Un buen test ejercita comportamiento observable a través de una frontera pública y nunca detalles internos (tablas intermedias, métodos privados, llamadas concretas entre servicios). Si se refactoriza el interior sin cambiar el comportamiento, ningún test debe romperse.
- **Frontera principal — API HTTP con base de datos real y conector falso**: tests de integración que arrancan la app Nest completa contra una Postgres real de test, con el puerto ConectorVeriFactu sustituido por un fake en memoria programable (200 con huella/QR, 400 con código, 500, timeout, y disparo de webhooks Aceptado / Rechazado / Aceptado con errores). El paso del worker se ejecuta de forma determinista desde el test. Cubre: alta del Emisor y bloqueo sin Representación, Borradores, Emisión y numeración (incluida concurrencia en la misma Serie sin huecos ni duplicados), máquina de estados de Factura y Registro, outbox e idempotencia (reintentos no duplican), Bloqueado y reintento con el mismo número, webhook (firma inválida rechazada, duplicados ignorados), respaldo por sondeo, correcciones (rectificar con cada motivo → tipo correcto, rectificar totalmente, corregir destinatario en ambas ramas, corregir retención con versionado, anular y número quemado, prohibición de combinar), aislamiento entre Emisores, archivado de Destinatarios, exportación, panel de operador sin acceso a datos de negocio, auditoría.
- **Dominio puro (paquete domain)**: tests con tablas de casos exhaustivas para el cálculo de importes (redondeos límite, varios tipos de IVA, líneas exentas, descuentos, retenciones 15/7/0, importes negativos de rectificativas), validación de NIF/NIE/CIF, motivos de rectificación → R1/R4 y menciones de exención. TDD.
- **Contrato del conector**: una única batería de tests de contrato que se ejecuta contra el fake y contra el adaptador Verifacti real en su sandbox (solo en CI bajo demanda o programado, con el NIF de test del operador), garantizando que el fake se comporta como la API real.
- **E2E**: pocos tests con Playwright contra staging: alta completa, crear y emitir una factura y ver el QR, rectificar, anular.
- No hay prior art en el repositorio (proyecto nuevo); estos tests establecen el patrón.
- CI bloquea el merge a `stage` y `main` si falla cualquier test, lint o typecheck.

## Out of Scope

- Facturas simplificadas (F2/R5) y rectificativas por sustitución.
- Recargo de equivalencia, operaciones intracomunitarias e internacionales, exenciones E2–E6, operaciones no sujetas, criterio de caja.
- Destinatarios extranjeros o sin NIF español.
- Registro público, cobro de la suscripción (Stripe).
- Envío de facturas por email.
- Presupuestos, gastos, facturas recurrentes, informes y modelos trimestrales, importación de facturas históricas.
- Varios Emisores por Usuario y varios Usuarios por Emisor (el modelo lo admite; la UI no).
- Acceso de soporte del operador a datos del Emisor.
- Clínicas que facturan en nombre del profesional (autofacturación).
- Conector VeriFactu propio (se sustituirá Verifacti más adelante tras el puerto).
- Multi-idioma.

## Further Notes

- Fechas: VeriFactu obligatorio para autónomos el 1 jul 2027; el productor del SIF debe cumplir desde la primera factura emitida con Verifiq. Revisar antes del lanzamiento que no haya nuevos aplazamientos.
- Pendiente de validación por un asesor fiscal (no bloquea la implementación; son configuración): tabla motivo → R1/R4, criterio de Anulación cuando la factura no se entregó, fecha de operación de facturas mensuales (último día del Periodo facturado).
- Pendiente con Verifacti: cómo se identifica nuestro SIF en el XML, si exponen el CSV de la AEAT, precio para integradores.
- Pendiente del operador: textos legales (términos, contrato de encargo, privacidad, declaración responsable), contratos de subencargo con proveedores.
- El Usuario es responsable de elegir el tratamiento de IVA de cada línea; Verifiq ofrece todas las opciones del alcance.
- Se espera un volumen bajo (1 Emisor piloto, pocas facturas al mes), pero el diseño no debe impedir crecer a muchos Emisores.

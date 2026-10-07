# Verifiq

SaaS de facturación para autónomos españoles que registra cada factura en la AEAT conforme a VeriFactu.

El código está en inglés: cada término lleva su nombre en código (_En código_) y se usa siempre ese, sin sinónimos. Otros nombres fijos: Alta del Emisor → `onboarding`; NIF → `taxId`; IVA → `vat`; Base imponible → `taxBase`; cuota → `taxAmount`; Exenta → `exempt`.

## Actores

**Emisor**:
El obligado tributario (NIF) que expide las facturas. Es la unidad de aislamiento de datos: todo pertenece a un Emisor.
_En código_: `Issuer`
_Avoid_: Cliente, cuenta, empresa, tenant

**Usuario**:
Persona que inicia sesión en Verifiq y actúa en nombre de un Emisor.
_En código_: `User`
_Avoid_: Cliente, cuenta

**Destinatario**:
Persona o entidad a la que el Emisor factura. En la interfaz puede mostrarse como "Clientes".
_En código_: `Recipient`
_Avoid_: Cliente (en código y dominio), receptor, comprador

## Facturación

**Artículo**:
Concepto reutilizable del catálogo del Emisor (nombre, precio e IVA por defecto). Una línea de factura copia sus valores; nunca lo referencia en vivo.
_En código_: `CatalogItem`
_Avoid_: Producto, servicio, item

**Borrador**:
Factura en preparación, sin número ni efecto fiscal. Se puede editar y borrar libremente.
_En código_: `Draft`
_Avoid_: Proforma, presupuesto

**Emisión**:
Acto irreversible que asigna número a un Borrador y genera su Registro de facturación.
_En código_: `Issuance` (verbo: `issue`)
_Avoid_: Timbrado, envío, validación

**Serie**:
Secuencia de numeración correlativa del Emisor. Las rectificativas usan siempre una Serie propia.
_En código_: `Series`

**Factura rectificativa**:
Factura que corrige otra ya emitida; es la vía normal para corregir errores de una factura.
_En código_: `CorrectiveInvoice`
_Avoid_: Abono (salvo como rectificativa total), nota de crédito

**Factura rectificada**:
Factura emitida que una Factura rectificativa corrige. Sigue visible y conserva su número y su Registro de facturación. Corregir la retención no la deja rectificada.
_En código_: `rectified` (estado de la factura)
_Avoid_: Corregida, abonada

**Factura anulada**:
Factura emitida que una Anulación deja sin efecto. Sigue visible, de solo lectura y atenuada; su número no se reutiliza jamás.
_En código_: `voided` (estado de la factura)
_Avoid_: Cancelada, borrada

**Periodo facturado**:
Intervalo de fechas en que se prestaron los servicios que recoge una factura (p. ej. un mes de trabajo en una clínica).
_En código_: `BillingPeriod`
_Avoid_: Mes, liquidación

**Descripción de la operación**:
Texto genérico de la factura que viaja a la AEAT en el Registro de facturación. Nunca contiene datos de pacientes.
_En código_: `OperationDescription`
_Avoid_: Concepto (reservado a las líneas)

**Supuesto de exención**:
Motivo legal por el que una línea está exenta de IVA (p. ej. servicios sanitarios, art. 20.Uno.5º LIVA). Determina la mención legal impresa en la factura.
_En código_: `ExemptionGround`
_Avoid_: Tipo 0 %, sin IVA

**Retención de IRPF**:
Porcentaje de la base que el Destinatario retiene e ingresa a Hacienda por cuenta del Emisor. Se fija por factura y no forma parte del Registro de facturación.
_En código_: `withholding`
_Avoid_: IRPF (a secas), descuento

**Importe total**:
Base imponible más cuotas de IVA. Es el importe que se declara a la AEAT.
_En código_: `totalAmount`

**Total a pagar**:
Importe total menos la retención de IRPF. Es lo que el Destinatario paga.
_En código_: `amountDue`
_Avoid_: Total (a secas)

## VeriFactu

**Representación**:
Autorización que el Emisor firma para que el conector presente sus Registros de facturación ante la AEAT. Sin ella vigente, el Emisor no puede emitir.
_En código_: `Representation`
_Avoid_: Apoderamiento, mandato

**Registro de facturación**:
Registro firmado y encadenado (huella) que se remite a la AEAT por cada alta o anulación de factura.
_En código_: `InvoiceRecord`
_Avoid_: Timbre, ticket

**Huella**:
Hash del Registro de facturación encadenado con el anterior del mismo Emisor.
_En código_: `fingerprint`
_Avoid_: Hash (a secas)

**Conector VeriFactu**:
Servicio que genera, encadena y remite los Registros de facturación a la AEAT por cuenta del Emisor (hoy Verifacti, ADR 0001). Verifiq solo le habla a través de su interfaz propia.
_En código_: `VerifactuConnector`
_Avoid_: Proveedor, pasarela

**Anulación**:
Registro que deja sin efecto una factura que nunca debió existir. No corrige errores; su número no se reutiliza jamás.
_En código_: `Voiding`
_Avoid_: Cancelación, borrado

**Subsanación**:
Reenvío de un Registro de facturación para corregir datos del registro que no alteran la factura, o tras un rechazo de la AEAT.
_En código_: `Amendment`
_Avoid_: Modificación, edición

**Reenvío**:
Nuevo envío del Registro de facturación de una factura con una incidencia (bloqueado, rechazado o aceptado con errores), tras corregir su copia; conserva el número. Si el registro estaba bloqueado se reintenta tal cual se envió, y solo el día de su fecha de expedición; tras el veredicto de la AEAT, es una Subsanación. Aceptada con errores, la factura ya existe en la AEAT: solo se corrige la descripción; los datos del cliente o los importes se corrigen con una Factura rectificativa. Cada Registro conserva la copia que envió.
_En código_: `Resubmission` (verbo: `resubmit`)
_Avoid_: Reintento (a secas), reemisión

**Censo**:
Censo de la AEAT contra el que se comprueba el NIF (y el nombre) de cada Destinatario al guardarlo. Un NIF que no figura, o figura de baja, haría rechazar sus facturas.
_En código_: `census`
_Avoid_: Padrón, registro

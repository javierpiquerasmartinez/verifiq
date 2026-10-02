# Verifiq

SaaS de facturación para autónomos españoles que registra cada factura en la AEAT conforme a VeriFactu.

## Actores

**Emisor**:
El obligado tributario (NIF) que expide las facturas. Es la unidad de aislamiento de datos: todo pertenece a un Emisor.
_Avoid_: Cliente, cuenta, empresa, tenant

**Usuario**:
Persona que inicia sesión en Verifiq y actúa en nombre de un Emisor.
_Avoid_: Cliente, cuenta

**Destinatario**:
Persona o entidad a la que el Emisor factura. En la interfaz puede mostrarse como "Clientes".
_Avoid_: Cliente (en código y dominio), receptor, comprador

## Facturación

**Artículo**:
Concepto reutilizable del catálogo del Emisor (nombre, precio e IVA por defecto). Una línea de factura copia sus valores; nunca lo referencia en vivo.
_Avoid_: Producto, servicio, item

**Borrador**:
Factura en preparación, sin número ni efecto fiscal. Se puede editar y borrar libremente.
_Avoid_: Proforma, presupuesto

**Emisión**:
Acto irreversible que asigna número a un Borrador y genera su Registro de facturación.
_Avoid_: Timbrado, envío, validación

**Serie**:
Secuencia de numeración correlativa del Emisor. Las rectificativas usan siempre una Serie propia.

**Factura rectificativa**:
Factura que corrige otra ya emitida; es la vía normal para corregir errores de una factura.
_Avoid_: Abono (salvo como rectificativa total), nota de crédito

**Periodo facturado**:
Intervalo de fechas en que se prestaron los servicios que recoge una factura (p. ej. un mes de trabajo en una clínica).
_Avoid_: Mes, liquidación

**Descripción de la operación**:
Texto genérico de la factura que viaja a la AEAT en el Registro de facturación. Nunca contiene datos de pacientes.
_Avoid_: Concepto (reservado a las líneas)

**Supuesto de exención**:
Motivo legal por el que una línea está exenta de IVA (p. ej. servicios sanitarios, art. 20.Uno.5º LIVA). Determina la mención legal impresa en la factura.
_Avoid_: Tipo 0 %, sin IVA

**Retención de IRPF**:
Porcentaje de la base que el Destinatario retiene e ingresa a Hacienda por cuenta del Emisor. Se fija por factura y no forma parte del Registro de facturación.
_Avoid_: IRPF (a secas), descuento

**Importe total**:
Base imponible más cuotas de IVA. Es el importe que se declara a la AEAT.

**Total a pagar**:
Importe total menos la retención de IRPF. Es lo que el Destinatario paga.
_Avoid_: Total (a secas)

## VeriFactu

**Representación**:
Autorización que el Emisor firma para que el conector presente sus Registros de facturación ante la AEAT. Sin ella vigente, el Emisor no puede emitir.
_Avoid_: Apoderamiento, mandato

**Registro de facturación**:
Registro firmado y encadenado (huella) que se remite a la AEAT por cada alta o anulación de factura.
_Avoid_: Timbre, ticket

**Anulación**:
Registro que deja sin efecto una factura que nunca debió existir. No corrige errores; su número no se reutiliza jamás.
_Avoid_: Cancelación, borrado

**Subsanación**:
Reenvío de un Registro de facturación para corregir datos del registro que no alteran la factura, o tras un rechazo de la AEAT.
_Avoid_: Modificación, edición

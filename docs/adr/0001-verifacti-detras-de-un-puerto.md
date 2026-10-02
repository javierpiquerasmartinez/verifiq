# Verifacti como conector VeriFactu, aislado tras una interfaz propia

Para llegar a producción antes de que VeriFactu sea obligatorio para autónomos (1 jul 2027) delegamos en la API de Verifacti la generación del XML, la huella encadenada, el control de flujo y la presentación ante la AEAT como representante. A cambio, dependemos de un tercero (2,90 €/NIF/mes) y de su modelo asíncrono. El dominio solo conoce un puerto `ConectorVeriFactu` (en código `VerifactuConnector`); Verifacti es un adaptador, de modo que podamos sustituirlo por un conector propio sin tocar el modelo de facturas.

## Consequences

- Verifacti no nos exime de emitir nuestra propia declaración responsable como productor del SIF.
- Verifacti borra los registros de un NIF desactivado a los 30 días: Verifiq debe conservar facturas y todas las respuestas del conector.

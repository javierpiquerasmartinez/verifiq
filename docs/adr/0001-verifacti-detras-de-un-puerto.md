# Verifacti como conector VeriFactu, aislado tras una interfaz propia

Para llegar a producción antes de que VeriFactu sea obligatorio para autónomos (1 jul 2027) delegamos en la API de Verifacti la generación del XML, la huella encadenada, el control de flujo y la presentación ante la AEAT como representante. A cambio, dependemos de un tercero (de 14,99 €/NIF/mes con un NIF a 2,90 €/NIF/mes con 100; ver `docs/research/verifactu-verifacti.md` §5) y de su modelo asíncrono. El dominio solo conoce un puerto `ConectorVeriFactu` (en código `VerifactuConnector`); Verifacti es un adaptador, de modo que podamos sustituirlo por un conector propio sin tocar el modelo de facturas.

## Consequences

- Verifacti no nos exime de emitir nuestra propia declaración responsable como productor del SIF.
- Verifacti borra los registros de un NIF desactivado a los 30 días: Verifiq debe conservar facturas y todas las respuestas del conector.
- El plan gratuito de Verifacti solo da la clave de una empresa de prueba: el alta de Emisores, la Representación y el censo requieren el plan de pago, también contra la AEAT de pruebas. Mientras tanto, el fake cubre ese tramo y la batería de contrato prueba los Registros con la clave gratuita.

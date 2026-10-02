# 05: Puerto ConectorVeriFactu, adaptador Verifacti y fake

Spec: `../spec.md` (historias 95, 96) · ADR 0001 · `docs/research/verifactu-verifacti.md`

**What to build:** la interfaz propia del dominio para hablar con VeriFactu, su adaptador real contra Verifacti y un fake en memoria programable que usará la frontera principal de tests. Una batería de tests de contrato garantiza que ambos se comportan igual. Prefactor.

**Blocked by:** 01

**Status:** done

- [x] Puerto con operaciones: crear clave de Emisor, iniciar firma remota de Representación, consultar estado de Representación, validar NIF contra censo, registrar alta, subsanar, anular, consultar estado de Registro
- [x] Resultados normalizados de dominio: aceptado en cola (huella, QR, URL), rechazo síncrono (código estable + mensaje), error transitorio; nada fuera del adaptador conoce Verifacti
- [x] Soporte de clave de idempotencia en el alta
- [x] Claves de API por Emisor cifradas en reposo (AES-GCM, clave maestra fuera de la base de datos)
- [x] Cada petición y respuesta al conector se guarda íntegra, asociada al Emisor y al Registro
- [x] Fake en memoria programable: 200, 400 con código, 500, timeout, y disparo de resultados AEAT (Aceptado, Rechazado, Aceptado con errores)
- [x] Tests de contrato ejecutados contra el fake siempre y contra el sandbox de Verifacti bajo demanda en CI (NIF de test del operador)

## Comments

**2026-10-03 (agente):** cierre. Todo en `apps/api/src/verifactu/`, con TDD en tres fronteras acordadas: contrato del puerto (fake siempre, sandbox bajo demanda), adaptador contra un `fetch` simulado y Postgres real, y `SecretBox`.
- Puerto `VerifactuConnector` (`connector.ts`): resultados `ok` / `rejected` (código estable + mensaje) / `transient` (server-error, timeout, network, unauthorized, in-progress). Tras un timeout se reintenta con la misma clave de idempotencia (alta, subsanación y anulación la llevan).
- `VerifactiConnector`: único módulo que conoce Verifacti. `createIssuerKey` da de alta el NIF (un 409 «ya existe» no es error), pide su clave y la guarda sellada con AES-256-GCM (`CONNECTOR_MASTER_KEY`, el issuer id como datos asociados) en `connector_credentials`. Cada petición y respuesta va íntegra a `connector_exchanges` (append-only, migración 0003) con Emisor y `invoice_record_id`; la cabecera Authorization y el `api_key` de la respuesta se ocultan. La FK de `invoice_record_id` llega con la tabla de Registros (issue 10).
- `FakeVerifactuConnector`: censo programable, `failNext` (400 con código, 500, timeout con o sin procesar), `settle` (Aceptado, Rechazado, Aceptado con errores), `signRepresentation`. `createTestApp` lo usa por defecto. El envío del webhook en sí queda para la issue 11.
- Sandbox: workflow manual «Verifacti contract» con los secretos `VERIFACTI_TEST_API_KEY`, `VERIFACTI_TEST_TAX_ID` y `VERIFACTI_TEST_NAME`. Nunca inicia una firma remota (cuesta 2,90 €). Aún no se ha ejecutado: faltan los secretos. Por confirmar con la API real: los estados de Representación y los resultados de censo se tomaron del OpenAPI de Verifacti, no de una llamada real; un valor desconocido lanza un error en vez de adivinar.
- Sin `VERIFACTI_API_KEY` la API usa el fake con un aviso en el log; con `VERIFACTI_ENVIRONMENT=prod` la clave es obligatoria.

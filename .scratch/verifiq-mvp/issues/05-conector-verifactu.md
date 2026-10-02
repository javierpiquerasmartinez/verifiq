# 05: Puerto ConectorVeriFactu, adaptador Verifacti y fake

Spec: `../spec.md` (historias 95, 96) · ADR 0001 · `docs/research/verifactu-verifacti.md`

**What to build:** la interfaz propia del dominio para hablar con VeriFactu, su adaptador real contra Verifacti y un fake en memoria programable que usará la frontera principal de tests. Una batería de tests de contrato garantiza que ambos se comportan igual. Prefactor.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Puerto con operaciones: crear clave de Emisor, iniciar firma remota de Representación, consultar estado de Representación, validar NIF contra censo, registrar alta, subsanar, anular, consultar estado de Registro
- [ ] Resultados normalizados de dominio: aceptado en cola (huella, QR, URL), rechazo síncrono (código estable + mensaje), error transitorio; nada fuera del adaptador conoce Verifacti
- [ ] Soporte de clave de idempotencia en el alta
- [ ] Claves de API por Emisor cifradas en reposo (AES-GCM, clave maestra fuera de la base de datos)
- [ ] Cada petición y respuesta al conector se guarda íntegra, asociada al Emisor y al Registro
- [ ] Fake en memoria programable: 200, 400 con código, 500, timeout, y disparo de resultados AEAT (Aceptado, Rechazado, Aceptado con errores)
- [ ] Tests de contrato ejecutados contra el fake siempre y contra el sandbox de Verifacti bajo demanda en CI (NIF de test del operador)

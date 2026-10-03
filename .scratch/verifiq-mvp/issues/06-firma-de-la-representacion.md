# 06: Firma de la Representación en el alta

Spec: `../spec.md` (historias 22–26, 88)

**What to build:** el paso 5 del alta. Verifiq crea la clave del Emisor en Verifacti con la cuenta del operador e inicia la firma remota de la Representación; el Usuario firma verificándose con DNI, ve el estado (pendiente, firmada, error) y puede reenviar el enlace. Mientras no esté firmada, Emitir queda deshabilitado con un aviso persistente.

**Blocked by:** 03; 05; `design.html`

**Status:** done

- [x] Al llegar al paso 5 se crea la clave del Emisor (idempotente si se reintenta)
- [x] Botón "Firmar autorización" inicia la firma remota y abre la URL; "Reenviar enlace"
- [x] El estado se sondea y se refleja en el asistente y en Ajustes
- [x] El Emisor expone "puede emitir" solo con Representación correcta; aviso persistente en caso contrario
- [x] Mientras tanto se pueden crear Destinatarios, Artículos y Borradores
- [x] Staging usa el NIF de test, que no requiere Representación
- [x] Tests de API con el fake: pendiente → firmada, error, reintento

## Comments

**2026-10-03 (agente):** implementado en `feat/issuer-representation`, con TDD en la frontera HTTP (Postgres real y el fake del conector, `test/representation.test.ts`).
- API: `RepresentationService` (`apps/api/src/issuers/representation.ts`). Al aceptar los términos (paso 4) se crea la clave del Emisor en el conector; si el conector no responde, se reintenta en cada consulta del estado, y una vez creada no se vuelve a pedir (`issuers.connector_registered_at`, migración 0004). Si el conector rechaza el NIF, el estado es `error` / `issuer-not-accepted` y se sigue reintentando.
- `GET /issuer/representation` consulta el estado al conector y guarda el último conocido en el Emisor; si el conector no responde, devuelve ese último estado con `stale: true`. Estados para el Usuario: `not-required`, `not-started`, `pending` (con `signingUrl`), `signed` y `error` (`rejected`, `expired`, `cancelled`, `issuer-not-accepted`).
- `POST /issuer/representation/signing` recibe nombre, apellidos, calle, número y municipio del firmante; el email es el del Usuario. Con una firma pendiente o ya firmada responde 409 `REPRESENTATION_IN_PLACE` sin llamar al conector, porque cada firma cuesta 2,90 €. Dos peticiones simultáneas solo inician una: la que pasa el estado a `pending` con una actualización condicional. Si el conector falla, el estado vuelve al anterior; tras un timeout, la siguiente consulta dice si la firma llegó a iniciarse. Tras un error se puede volver a firmar.
- `POST /issuer/representation/resend` reenvía el enlace pendiente con un email de Verifiq: no inicia otra firma, que costaría otra vez. Si el conector no confirma que la firma sigue pendiente, responde 503 y no reenvía un enlace que puede haber caducado.
- «Puede emitir»: `RepresentationService.canIssue()` (para la Emisión, issue 10) y `canIssue` en `GET /issuer`. Una Representación firmada se da por buena sin volver a consultar al conector.
- Los endpoints de negocio solo exigen el alta completa (pasos 1–4), no la Representación.
- Entorno de pruebas: la Representación solo se exige con `VERIFACTI_ENVIRONMENT=prod` (`representationRequiredFromEnv`). En staging (y en local con el fake) el estado es `not-required` y la firma responde 409 `REPRESENTATION_NOT_REQUIRED`; aun así, para emitir hace falta la clave del Emisor, que se reintenta igual que en producción. Con `VERIFACTI_API_KEY`, `VERIFACTI_ENVIRONMENT` pasa a ser obligatoria, para que una variable olvidada en producción no desactive la Representación sin avisar.
- Web: paso 5 del asistente en `/onboarding/representation` (stepper de 5 pasos; «Continuar sin firmar por ahora»), con el formulario prellenado con los datos fiscales y sondeo cada 5 s mientras está pendiente. El aviso persistente bajo la cabecera sigue `design.html` («Listado — primer uso»). Ajustes mínima en `/settings`, solo con la autorización; el resto llega con la issue 20. Navegación con Facturas y Ajustes.

Pendiente / por confirmar:
- Con Verifacti real: los estados de Representación siguen sin contrastar con una llamada real (ver issue 05), y la firma nunca se ha probado contra el sandbox, porque cuesta.
- Queda una ventana pequeña: si otra pestaña refresca el estado mientras la llamada de firma está en curso, puede devolverlo a `none` y permitir una segunda firma. Hace falta actuar a mano en ese segundo; si Verifacti rechaza una segunda firma pendiente (como hace el fake), desaparece.
- No hay sondeo en servidor: el estado se refresca cuando el Usuario abre la app (cabecera, paso 5 o Ajustes). La Emisión (issue 10) debe usar `canIssue()`, que consulta al conector si no está firmada.


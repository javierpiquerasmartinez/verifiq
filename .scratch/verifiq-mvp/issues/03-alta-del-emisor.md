# 03: Alta del Emisor (datos, valores por defecto, Serie y términos)

Spec: `../spec.md` (historias 13–21, 89, 98) · ADR 0004

**What to build:** tras el primer acceso, un asistente reanudable guía al Usuario por los pasos 1–4 del alta: datos fiscales del Emisor, valores por defecto (Retención de IRPF, IVA o Exenta + Supuesto de exención), prefijo de Serie (una sola vez, numeración desde 1) y aceptación de términos y contrato de encargo. El Emisor queda creado como unidad de aislamiento y su nombre y NIF se ven siempre en la cabecera.

**Blocked by:** 02; 04 (validación de NIF y Supuestos de exención); `design.html`

**Status:** ready-for-agent

- [x] Modelo Emisor + membresía Usuario–Emisor (el MVP crea exactamente una)
- [x] Capa común de aislamiento: toda consulta de negocio se filtra por el Emisor de la sesión; test que demuestra que un Usuario no puede leer ni modificar datos de otro Emisor
- [x] Paso 1: nombre, NIF (validado), domicilio fiscal; opcionales email, teléfono, IBAN, logo (subido a R2)
- [x] Paso 2: IRPF por defecto (15/7/ninguna) e IVA por defecto (21/10/4/0 o Exenta + supuesto)
- [x] Paso 3: prefijo de Serie ordinaria y de rectificativas con año, aviso de no coincidir con series de otro software; inmutable tras confirmar
- [x] Paso 4: aceptación de términos y contrato de encargo con versión y fecha registradas
- [x] El asistente se puede abandonar y retomar en el mismo paso
- [x] Cabecera con nombre y NIF del Emisor activo

## Comments

**2026-10-02 (agente):** implementado en `feat/emisor-onboarding`; pendiente de verificar en staging (ver abajo).
- Dominio (TDD): `fiscalDataSchema` (NIF/NIE/CIF, domicilio con código postal español, email/teléfono/IBAN opcionales; vacío = no indicado), `ibanSchema` (mod 97, IBAN español de 24 caracteres), `emisorDefaultsSchema`, `seriesSchema` y `invoiceNumber`. La Serie es `<prefijo><año>-` y el número va a 4 cifras (`F2026-0001`): el usuario elige solo el prefijo (1–10 letras; cifras solo en medio, para que no se confundan con el año); el de rectificativas debe ser distinto.
- API: `GET /onboarding` (paso actual derivado de lo guardado, así que se retoma en el mismo paso desde cualquier sesión), `PUT /onboarding/fiscal-data` (el primer guardado crea el Emisor y la membresía), `PUT /onboarding/defaults`, `POST /onboarding/serie` (una sola vez: 409 `SERIE_ALREADY_CONFIRMED`; además un trigger impide cambiarla en la base de datos), `POST /onboarding/terms` (registra versión y fecha de cada documento en `legal_acceptances`, solo inserciones) y `GET /emisor` (nombre y NIF para la cabecera). Cada paso exige los anteriores (409 `ONBOARDING_STEP_PENDING`).
- Aislamiento: un interceptor resuelve el Emisor de la sesión por su membresía; los endpoints lo reciben con `@CurrentEmisor()` (exige el alta completa: 403 `ONBOARDING_INCOMPLETE`) o `@OnboardingEmisor()` (durante el alta). Ningún endpoint acepta un id de Emisor. Tests: un Usuario solo lee su Emisor, sus cambios no alcanzan a otro, y no puede quedarse el Emisor de otro con su NIF (NIF único entre Emisores: 409 `NIF_TAKEN`).
- Logo: `PUT/GET/DELETE /emisor/logo` con la imagen como cuerpo; PNG o JPEG (por su firma, no por la cabecera) hasta 1 MB. Puerto `ObjectStorage` con adaptador R2 (endpoint de jurisdicción UE) y, sin variables `R2_*`, una carpeta local `apps/api/.storage`.
- Web: asistente en `/alta` (NIF validado mientras se escribe, aviso de Serie con casilla de confirmación y vista previa del primer número, Serie bloqueada tras confirmarla); `/` exige el alta completa; cabecera con nombre y NIF del Emisor. `design.html` no trae pantallas de alta: compuestas con sus componentes (`.seg`, `.sel`, stepper).
- Decisiones propias: IVA por defecto propuesto 21 % e IRPF 15 % (el dentista elige Exenta); los datos fiscales y valores por defecto se pueden corregir durante el alta (la edición posterior es la issue 20).

Pendiente del operador:
- Textos legales: el paso 4 muestra título y versión (`LEGAL_DOCUMENTS` en `packages/domain/src/onboarding.ts`, ambos `2026-10-02`) pero no el texto, que sigue pendiente (spec, Further Notes). Al publicarlo, enlazarlo desde el paso 4 y subir la versión si cambia.
- Staging: crear un bucket R2 con jurisdicción UE y configurar `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` y `R2_BUCKET` en Render. Sin ellas los logos van al disco de Render, que se borra en cada despliegue.

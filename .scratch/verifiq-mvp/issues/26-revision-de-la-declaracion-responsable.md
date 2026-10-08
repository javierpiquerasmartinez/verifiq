# 26: Revisión de la declaración responsable

Spec: `../spec.md` (historias 90, 99; decisión «Declaración responsable») · issue 20 · `docs/research/verifactu-verifacti.md` §14

**What to build:** cerrar los flecos de la declaración responsable que dejó la issue 20 (`apps/web/src/pages/ResponsibleDeclaration.tsx`). Primero se aclara cada punto (con Verifacti y, donde haga falta, con un asesor); luego se ajusta el texto o el código.

**Blocked by:** 20

**Status:** needs-info

## 1. Código identificador del sistema (campo b)

Hoy se muestra «Pendiente de confirmar con Verifacti». El `IdSistemaInformatico` va en cada Registro (RRSIF art. 10.1.o), y quien lo rellena en el XML es Verifacti. Preguntar a Verifacti:

- ¿Qué valor ponen hoy en `IdSistemaInformatico` (y en el resto de datos del SIF) cuando registran nuestras facturas?
- ¿Podemos o debemos fijar nosotros un código propio para Verifiq? Si es así, ¿cómo se lo pasamos?

La declaración tiene que coincidir con lo que viaja en los Registros.

## 2. Versión de Verifacti (campo d)

La FAQ de la AEAT (§5) pide que la declaración del componente principal nombre **la versión concreta** del componente de facturación al que invoca. Hoy se muestra «pendiente de confirmar con Verifacti».

- Obtener la versión vigente y la URL de su declaración responsable (`GET /verifactu/declaracion`).
- Decidir cómo se mantiene al día: un valor fijo que se revisa en cada release, o leerlo del conector. Ojo: ADR 0001 exige que nada fuera del adaptador conozca Verifacti.
- Valorar si enlazar la declaración de Verifacti desde la nuestra.

## 3. Redacción del campo d) frente al estado Bloqueado

El texto dice que Verifiq invoca a Verifacti «de forma indefectible e inmediata» y que «no hay facturas sin registro ni registros sin factura». Sin embargo, una factura en `bloqueado` (error de validación síncrono) conserva su número sin Registro aceptado hasta que el Usuario la corrige y la reenvía, y en `pendiente_envio` el Registro se envía de forma asíncrona (outbox).

- Confirmar con un asesor si esto cumple el requisito, o si hay que matizar el texto o el comportamiento.

## 4. Fecha y versionado de la declaración

La fecha de firma («En Valencia, a 8 de octubre de 2026») está fija en el código, mientras que la versión se inyecta en cada build. La declaración debe estar visible para cada versión, y el productor debe conservar las de todas las versiones (RRSIF art. 13.3).

- Decidir cuándo se re-firma: ¿en cada release o solo cuando cambia el texto o lo que el sistema hace?
- Decidir si basta con el histórico de git o si hay que guardar una copia por versión (por ejemplo, un PDF por release).

## 5. Entregar la declaración al darse de alta

La declaración debe entregarse al cliente cuando adquiere el producto (`docs/research/verifactu-verifacti.md` §14). Hoy solo se puede consultar: está en el pie de página y en Ajustes, pero nadie se la entrega al Usuario.

- Enlazarla en el paso de condiciones del alta, junto a los términos de uso y el contrato de encargo, o en el email de invitación.
- Decidir si hace falta dejar constancia de la entrega (por ejemplo, la versión vista, como se hace con la aceptación de los términos).

## 6. Revisión legal del texto completo

- Revisar con un asesor los campos a) a l) y la frase de cumplimiento del campo k).
- Confirmar que los datos del productor (nombre, NIF, dirección) son los que deben figurar.

## 7. Responsabilidades fuera de la declaración (relacionado)

La declaración responsable la firma solo el productor, y solo certifica que el software cumple. No dice nada de quién responde del contenido de cada factura. Ese reparto va en los términos de uso y en el contrato de encargo, que siguen pendientes del operador (spec, «Further Notes»):

- El Usuario responde del contenido de sus facturas: datos, tratamiento de IVA, retención y exenciones.
- Verifiq responde de que el sistema cumpla con lo que declara.

Se anota aquí para no perderlo; los textos legales pueden ir en otra issue.

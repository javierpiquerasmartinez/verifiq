# 23: Guardado y vista previa del Borrador

Spec: `../spec.md` (historias 51–52) · issue 08

**What to build:** que el editor de Borradores no muestre como errores lo que solo falta para emitir, y corregir los fallos de navegación y guardado. El comportamiento se mantiene: «Guardar borrador» y «Vista previa» guardan aunque falten cliente, concepto o descripción.

**Blocked by:** 08; 09

**Status:** ready-for-agent

## Contexto

En el editor (`apps/web/src/pages/Draft.tsx`), «Vista previa» llama a `save()` (lo mismo que «Guardar borrador») y, si guarda, navega a `/drafts/$draftId/preview`. La vista previa se pinta desde el Borrador guardado (`GET /drafts/:id`). Las validaciones son las de guardar:
- formato de números y periodo en la web, que bloquean el guardado;
- `draftDataSchema` en la API: 400 si los datos son incoherentes;
- los `problems` (`findDraftProblems`) no bloquean ni guardar ni previsualizar.

## Lo que falta para emitir no es un error

- [ ] **Hoy los `problems` se pintan como errores de validación, aunque no bloquean nada.** Tras el primer intento de guardar en un Borrador nuevo, o nada más abrir uno guardado (`showProblems`), el editor muestra:
  - el concepto y la descripción en rojo (`aria-invalid`);
  - «Elige el cliente al que facturas.» bajo el selector;
  - «Escribe el concepto o elimina esta línea.» en la línea;
  - la alerta roja «Revisa N campos antes de emitir» en la columna del resumen;
  - el periodo que aún no ha terminado, como error rojo bajo las fechas.

  Como el Borrador sí se guarda, o se abre la vista previa, el Usuario cree que algo ha fallado. (`design.html` lo dibuja así, pero el operador prefiere que no lo parezca.)
- [ ] **Corrección esperada:**
  - En el editor, rojo solo para lo que de verdad impide guardar: formato de cantidad, precio o descuento, y periodo incompleto o invertido.
  - Lo que falta para emitir (`findDraftProblems`) aparece como una lista neutra en la columna del resumen, por ejemplo «Para emitir falta: el cliente; la descripción de la operación; el concepto de la línea 2». Tono informativo, sin marcar campos. Mejor si cada punto lleva al campo.
  - Esa lista se ve siempre, también en un Borrador nuevo; deja de depender de `showProblems`.
  - Si se guarda bien, solo se muestra «Borrador guardado.».
  - El periodo sin terminar pasa a esa lista, o a una ayuda neutra bajo las fechas.
  - Al pulsar Emitir (issue 10), si queda algo pendiente, es cuando esos puntos se señalan como errores en sus campos.

## Fallos

- [ ] **Volver desde la vista previa de un Borrador nuevo muestra un formulario vacío.**
  - En `/drafts/new`, «Vista previa» crea el Borrador y navega a la vista previa sin `replace` (`Draft.tsx`, `preview()`). En cambio, «Guardar borrador» sí usa `replace: true` (`saveDraft()`).
  - El historial queda `/drafts/new → /drafts/:id/preview`. El botón «atrás» del navegador vuelve a `/drafts/new`: un formulario en blanco aunque el Borrador ya está guardado.
  - Si el Usuario lo vuelve a rellenar, crea un segundo Borrador.
  - (El enlace «← Volver al borrador» sí va a `/drafts/:id`.)
  - Corrección esperada: al crear desde «Vista previa», sustituir `/drafts/new` por `/drafts/:id` en el historial antes de abrir la vista previa.
- [ ] **Doble clic al guardar un Borrador nuevo puede crear dos.**
  - `save()` vuelve a habilitar los botones (`setPending(false)` en el `finally`) antes de que `saveDraft()`/`preview()` naveguen.
  - Durante ese instante, el formulario sigue siendo «nuevo» y un segundo clic hace otro `POST /drafts`.
  - Corrección esperada: mantener los botones deshabilitados hasta terminar la navegación.
- [ ] **Salir del editor con cambios sin guardar los pierde sin avisar.**
  - No hay bloqueo de navegación (`useBlocker` de TanStack Router) ni `beforeunload`.
  - Ir a «Facturas», «Clientes» o cerrar la pestaña descarta los cambios en silencio, lo que choca con la historia 52 («preparing invoices is low-stress»).
  - Corrección esperada: preguntar antes de salir si hay cambios sin guardar.
- [ ] **El límite de 100 líneas solo existe en la API.**
  - `draftDataSchema` admite como mucho 100 líneas, pero la web deja añadir más.
  - Al guardar, el Usuario solo ve el error genérico «No se ha podido guardar el borrador».
  - Corrección esperada: deshabilitar «Añadir línea» y «Añadir desde artículos» (`CatalogItemPicker`, issue 09) al llegar al límite, y explicarlo.

## Decidido

- **«Vista previa» sigue guardando** (2026-10-04, el operador): se puede guardar y previsualizar un Borrador sin cliente, sin concepto y sin descripción. Por eso el primer fallo hay que corregirlo.
- **Lo que falta para emitir se muestra como una lista neutra** en la columna del resumen, siempre visible y sin marcar campos (2026-10-04, el operador). No se espera a que exista Emitir.

## Tests

Hoy la web no tiene tests de componentes, así que esto se verifica a mano en el navegador:
- Guardar un Borrador nuevo vacío no pinta ningún campo en rojo; muestra «Borrador guardado.» y la lista neutra de lo que falta para emitir.
- Atrás desde la vista previa de un Borrador nuevo lleva al Borrador guardado.
- Un doble clic rápido en «Guardar borrador» crea uno solo.
- Salir con cambios pregunta antes.
- La línea 101 no se puede añadir.

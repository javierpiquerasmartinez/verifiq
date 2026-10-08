# 27: Página de invitaciones del operador

Spec: `../spec.md` (historias 1, 91–93) · issue 19 · PR #38

**What to build:** una página dedicada (`/operator/invitations`) donde el operador consulta **todas** las invitaciones que ha enviado, sea cual sea su estado, para investigar una incidencia o saber qué pasó con una en concreto. El panel (`/operator`) se queda como lo dejó la PR #38: en la tabla de Emisores solo salen las invitaciones pendientes y caducadas; las aceptadas y revocadas solo se verán en esta página.

**Blocked by:** —

**Status:** needs-triage

## Qué debe permitir

- [ ] Listar todas las invitaciones de Usuarios: email, estado (Pendiente, Aceptada, Caducada, Revocada), enviada, caduca y, si aplica, cuándo se aceptó o se revocó
- [ ] Buscar por email (sin distinguir mayúsculas ni acentos)
- [ ] Filtrar por estado, con el recuento de cada uno
- [ ] Ordenar por fecha de envío (por defecto, las más recientes primero), de caducidad y por email
- [ ] Revocar una pendiente desde la propia página (la misma acción que en el panel)
- [ ] Llegar a ella desde el panel: un enlace «Ver todas las invitaciones», por ejemplo junto a la tarjeta «Enviar invitación» o en la cabecera de la tabla de Emisores
- [ ] Mantener la misma cabecera del operador (`OperatorShell`) y el aviso de que el panel no muestra facturas ni clientes
- [ ] Ningún dato de facturas, líneas ni Destinatarios (historia 93): solo datos de la propia invitación

## A decidir en el triage

- **Datos del API.** `GET /operator/invitations` devuelve como mucho 200 invitaciones (`listInvitations`, `.limit(200)`), y no trae `acceptedAt` ni `revokedAt`. Hay dos opciones:
  - Paginar y hacer la búsqueda, el filtro y el orden en el servidor (query params). Es lo que escala.
  - Hacerlo en el cliente y subir el límite. Es suficiente con el volumen del MVP.
- **Enlace al Emisor.** ¿Una invitación aceptada debe mostrar el Emisor que dio de alta (nombre y NIF)? Con `userId` se llega por `issuer_memberships`, y no expone nada de la historia 93.
- **Invitaciones de operador.** Las crea el script `pnpm invite --operator` y hoy el panel las excluye (`role = 'user'`). ¿Se quedan fuera también aquí?
- **Diseño.** `Admin.dc.html` no tiene esta pantalla. Hay que decidir si se diseña antes o se monta con los componentes existentes (`card`, `tbl`, `pills` para el filtro y `affix` para la búsqueda, como en el listado de facturas).
- **Estado en la URL.** Filtro, orden y búsqueda en la URL (search params de TanStack Router), para poder compartir o recargar una vista concreta.

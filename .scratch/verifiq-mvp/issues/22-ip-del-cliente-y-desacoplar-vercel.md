# 22: IP real del cliente y web desacoplada de Vercel

Spec: `../spec.md` (historia 11) · ADR 0003 · issue 02 · issue 21

**What to build:** el rate limiting cuenta los intentos por cliente y no globalmente, y la web deja de depender del proxy de Vercel para hablar con la API. Hoy la web llama a la API por `/api` en su mismo origen (rewrite de `apps/web/vercel.json` → Render) para que la cookie de sesión sea de primera parte. Pero tras ese doble proxy Better Auth no resuelve la IP del cliente: todos los clientes comparten un único contador por endpoint. Cualquiera puede bloquear el inicio de sesión de todos con 5 intentos por minuto, o la recuperación de contraseña con 3 cada 15 min. Verificado en staging: el email de nuevo inicio de sesión muestra «Dirección IP: desconocida».

**Blocked by:** 02; dominio y DNS (operador)

**Status:** needs-triage

Propuesta (pendiente de decidir):
- Web y API bajo un dominio propio del mismo sitio, p. ej. web en `staging.verifiq.jpdev.app` y API en `api.staging.verifiq.jpdev.app` (nombres por decidir). Las cookies son del mismo sitio sin proxy, así que se elimina el rewrite `/api` y la web es estática pura, alojable en cualquier sitio.
- La API resuelve la IP con un único proxy delante (Render): diagnosticar qué cabeceras llegan y configurar `advanced.ipAddress` en consecuencia, sin aceptar cabeceras que el cliente pueda falsear.
- Alternativa descartada: mantener el proxy de Vercel y fiarse de una cabecera de IP de Vercel. La API también es accesible directamente en `onrender.com`, así que un atacante podría saltarse Vercel e inventar esa cabecera. Impedirlo exigiría que Vercel añadiera un secreto compartido que la API comprobara, y ese secreto no puede ir en `vercel.json` (está en el repo): haría falta middleware de Vercel. Con dominio propio no hay proxy de Vercel y no hace falta ningún secreto.
- Coste: los previews de Vercel (`*.vercel.app`) no comparten sitio con la API, así que en ellos no se puede iniciar sesión (solo sirven para revisar UI) salvo que tengan dominio propio.

Checklist:
- [ ] Diagnóstico: registrar temporalmente las cabeceras de IP que recibe la API (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`, `true-client-ip`) y retirarlo después
- [ ] Dominios propios para la web (Vercel) y la API (Render) en staging, con HTTPS
- [ ] `VITE_API_URL` apunta a la API en su dominio; se elimina el rewrite `/api` de `vercel.json` y el proxy de Vite pasa a ser opcional
- [ ] CORS y `trustedOrigins` con el origen exacto de la web; cookies `SameSite=Lax`, `Secure`
- [ ] Configuración de IP en Better Auth según el diagnóstico; el email de nuevo inicio de sesión muestra la IP real
- [ ] Tests de API: dos IPs distintas tienen contadores independientes; una cabecera de IP falsificada no evita el bloqueo
- [ ] README y notas de despliegue actualizados (también lo que afecta a producción, issue 21)

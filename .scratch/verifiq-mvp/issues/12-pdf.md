# 12: PDF de la factura

Spec: `../spec.md` (historias 57, 66–69) · brief de diseño (sección PDF)

**What to build:** en cuanto el Registro tiene QR, se genera el PDF desde la copia congelada, se guarda versionado y el Usuario puede verlo y descargarlo. Antes de eso no existe descarga.

**Blocked by:** 10; `design.html`

**Status:** ready-for-agent

- [ ] Generación en servidor con @react-pdf/renderer desde la copia congelada
- [ ] QR arriba en la primera página, 30–40 mm, margen ≥2 mm, "QR tributario:" encima y "VERI*FACTU" debajo
- [ ] Contenido obligatorio: Emisor, Destinatario, número, fecha de expedición, fecha de operación/Periodo facturado si difiere, líneas, desglose, menciones de exención, Importe total, Retención de IRPF, Total a pagar; IBAN y logo si existen
- [ ] Almacenado en R2 (jurisdicción UE) con número de versión; la descarga sirve el fichero almacenado
- [ ] Sin QR no hay PDF ni descarga (test)
- [ ] Test que comprueba la presencia de los campos obligatorios en el PDF generado

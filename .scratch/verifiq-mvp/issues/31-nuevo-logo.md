# 31: Nuevo logo de Verifiq (monograma q) en la app, los emails y los iconos

Spec: `../spec.md` · diseño: `design.html` (página «Monograma q»)

**What to build:** sustituir la marca actual de Verifiq (un check dentro de un cuadrado teal) por el monograma «q» en todos los sitios donde aparece hoy, y añadir los favicons, el manifest, el `theme-color` y la imagen para compartir que la web todavía no tiene.

**Blocked by:** —

**Status:** ready-for-agent

## Alcance

Se trata de la **marca de Verifiq**, no del **logo del Emisor**. El logo que el Emisor sube y que sale en el PDF de sus facturas (`invoice-pdf.tsx`) no se toca, y el PDF no lleva marca de Verifiq: la factura es del Emisor.

Sitios donde está hoy la marca:

- Barra superior de la app: `apps/web/src/ui/AppShell.tsx`
- Pantallas de login y registro: `apps/web/src/ui/components.tsx`
- Barra de Operator, invertida: `apps/web/src/pages/Operator.tsx`
- Emails: `apps/api/src/mail/logo.ts` (PNG inline en base64) y el texto de `apps/api/src/mail/layout.ts`
- La pestaña del navegador, que hoy no tiene favicon: `apps/web/index.html`

## Geometría (de `design.html`)

Lienzo `0 0 48 48`, todo dentro de `<g transform="translate(2.5 -1)">`, en un solo color:

- Normal: `circle cx=21.5 cy=20 r=13`, trazo 5,5, sin relleno; cola `M31.75 20H37.25V46L31.75 40.5Z`; cuadrado `x=18.25 y=16.75 6.5×6.5 rx=1`.
- Variante de 16 px, con más trazo para que no se empaste: `r=12.75`, trazo 6,5; cola `M31 20H37.5V46L31 39.5Z`; cuadrado `x=18 y=16.5 7×7 rx=1`.
- Colores: teal `#0D4A57` sobre fondo claro; blanco sobre teal o sobre `#141E26`; mono `#141E26`.
- Icono de app: el símbolo en blanco sobre un cuadrado teal; en el diseño, a 68 px dentro de 96 px.
- Área de respeto: el hueco de la q (unos 14 px con el símbolo a 32 px).

## Decisiones

- [x] **Una fuente única.** SVGs maestros en el repo (símbolo, símbolo de 16 px e icono de app) y un script en `scripts/` que genera los PNG y el ICO y los optimiza (`svgo`, `oxipng` o equivalente). Los resultados se versionan en `apps/web/public/`; el script solo se vuelve a ejecutar si cambia el logo. Nada se genera en el build de Vercel.
- [x] **`BrandMark`** (`apps/web/src/ui/icons.tsx`): SVG inline con `currentColor`, de modo que la versión invertida de Operator es solo el color blanco. Un único componente para las versiones clara, invertida y mono.
- [x] **Lockup en la app:** símbolo de 32 px, «verifiq» en minúsculas como texto real (IBM Plex Sans, 600, 20 px, `letter-spacing: -.03em`), separación de 8 px, en las tres cabeceras.
- [x] **Minúsculas solo en el lockup gráfico.** En la prosa, el `<title>`, el remitente de los emails y el resto de textos sigue «Verifiq».
- [x] **Favicons**, el conjunto mínimo actual:
  - `favicon.ico` con 16, 32 y 48 (el de 16 con la variante de 16 px), en teal;
  - `icon.svg`: símbolo sin fondo, en teal, que pasa a blanco con `@media (prefers-color-scheme: dark)` para las pestañas oscuras;
  - `apple-touch-icon.png` de 180×180: icono de app con fondo teal a sangre, sin esquinas redondeadas (iOS las pone);
  - `manifest.webmanifest`: `name: "Verifiq"`, `short_name: "Verifiq"`, `lang: "es"`, `start_url: "/"`, `display: "standalone"`, `theme_color: "#FFFFFF"`, `background_color: "#F4F5F2"`, iconos de 192 y 512 (`any`) y un 512 `maskable` con el símbolo dentro de la zona segura (círculo del 80 %);
  - `<meta name="theme-color" content="#FFFFFF">`.
  - Nada de PNGs redundantes (96, 144…): los navegadores actuales no los piden.
- [x] **Emails:** símbolo en PNG (96 px, mostrado a 32, inline por CID como ahora) más «verifiq» como texto, que sigue legible si el cliente bloquea imágenes. El PNG sale del mismo script y sustituye al base64 de `logo.ts`, con un `alt` «Verifiq».
- [x] **Imagen para compartir:** `og-image.png` de 1200×630 (lockup en blanco sobre teal, con el wordmark convertido a trazos porque es una imagen), con las meta `og:title`, `og:description`, `og:image`, `og:type`, `og:locale=es_ES` y `twitter:card=summary_large_image`. La URL es absoluta y fija a producción: `https://app.verifiq.es/og-image.png` (staging y las previews están detrás del login de Vercel).
- [x] `design.html` va en el mismo PR, como referencia.
- [x] Optimización: SVGs sin metadatos, PNGs comprimidos sin pérdida y el ICO con solo los tres tamaños. Que Lighthouse no marque nada de iconos ni de manifest.

## Fuera de alcance

- SEO (robots, sitemap, `noindex` en staging, descripciones por página): se hará más adelante. Aquí solo se adelantan las meta OG y los iconos.
- Modo oscuro de la app.

## Comments

- (implementación) Los maestros son `scripts/brand/symbol.svg` y `symbol-16.svg`; el icono de app no tiene maestro propio, porque `scripts/brand-assets.js` (`pnpm brand-assets`) lo compone a partir del símbolo con la proporción del diseño (68 de 96, esquinas de 22). El script renderiza con resvg, recomprime sin pérdida con oxipng (wasm), optimiza `icon.svg` con svgo (sin `inlineStyles`, que rompería el modo oscuro) y regenera `apps/api/src/mail/logo.ts`. El wordmark de la imagen OG sale en trazos de la IBM Plex Sans 600 con opentype.js. En el email, la imagen lleva `alt=""` y no «Verifiq»: el wordmark en texto está justo al lado, así que con `alt` los lectores de pantalla leerían el nombre dos veces (y se vería dos veces con las imágenes bloqueadas). `BrandMark` toma el color de `.brand svg` (teal, o blanco en la barra de Operator); una versión mono necesitaría su propia regla. Además de las meta OG, se ha añadido una `meta description` global y la descripción del manifest, con el lema de los emails.

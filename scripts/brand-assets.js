// Generates every raster and icon of Verifiq's brand from the master symbols in scripts/brand/ (the
// "q" monogram of design.html). Its output is committed: run it again only when the logo changes.
//   pnpm brand-assets
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import optimisePng, { init as initOxipng } from '@jsquash/oxipng/optimise.js';
import { Resvg } from '@resvg/resvg-js';
import opentype from 'opentype.js';
import { optimize } from 'svgo';

const require = createRequire(import.meta.url);
/** A path relative to this script. */
const fromScript = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const publicDir = (file) => fromScript(`../apps/web/public/${file}`);

const TEAL = '#0D4A57';
const WHITE = '#FFFFFF';

/** The drawing inside a master's 48 × 48 viewBox, in `currentColor`. */
const readMaster = (file) =>
  readFileSync(fromScript(`brand/${file}`), 'utf8').match(/<svg[^>]*>([\s\S]*)<\/svg>/)[1].trim();
const SYMBOL = readMaster('symbol.svg');
// From 16 px down the stroke grows from 5.5 to 6.5 so the q does not clog.
const SYMBOL_16 = readMaster('symbol-16.svg');

/** The symbol at `size` px with its 48-unit box at (`x`, `y`), in one colour. */
const placed = (drawing, color, x, y, size) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 48 48" color="${color}">${drawing}</svg>`;

const canvas = (width, height, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;

/** The symbol centred on a canvas of `size`, scaled to `ratio` of it, over an optional background. */
function icon(size, { drawing = SYMBOL, color = TEAL, ratio = 1, background, radius = 0 } = {}) {
  const symbol = size * ratio;
  const offset = (size - symbol) / 2;
  const tile = background ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${background}"/>` : '';
  return canvas(size, size, tile + placed(drawing, color, offset, offset, symbol));
}

/** design.html's app icon: the white symbol on a teal square, 68 px of 96, with corners of 22 (when `rounded`). */
const appIcon = (size, { rounded = false, ratio = 68 / 96 } = {}) =>
  icon(size, { color: WHITE, background: TEAL, ratio, radius: rounded ? (size * 22) / 96 : 0 });

await initOxipng(readFileSync(require.resolve('@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm')));

/** The SVG rendered, then recompressed without loss by oxipng. */
async function png(svg) {
  const raw = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
  return Buffer.from(await optimisePng(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), { level: 6 }));
}

/** An ICO whose images are PNGs, which every browser since IE 11 reads. */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + 16 * index;
    // One byte per side, where 0 stands for 256.
    header.writeUInt8(size % 256, entry);
    header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(({ data }) => data)]);
}

/** The wordmark "verifiq" as outlines (IBM Plex Sans 600, tracking −0.03 em), with its bounds. */
function wordmark(fontSize) {
  const file = readFileSync(require.resolve('@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff'));
  const font = opentype.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  const outline = font.getPath('verifiq', 0, 0, fontSize, { letterSpacing: -0.03 });
  const em = (units) => (units / font.unitsPerEm) * fontSize;
  return { outline, bounds: outline.getBoundingBox(), ascent: em(font.ascender), descent: -em(font.descender) };
}

/** The lockup (symbol + wordmark, as on design.html's hero) in white, centred on a teal card. */
function socialCard(width, height) {
  // design.html's hero lockup, ×2.5: symbol 64, gap 12, wordmark 46.
  const scale = 2.5;
  const symbol = 64 * scale;
  const gap = 12 * scale;
  const fontSize = 46 * scale;
  const { outline, bounds, ascent, descent } = wordmark(fontSize);
  const lockupWidth = symbol + gap + (bounds.x2 - bounds.x1);
  const left = (width - lockupWidth) / 2;
  const symbolTop = (height - symbol) / 2;
  // The text box sits centred on the symbol, as with `align-items: center` and `line-height: 1`; its
  // baseline is the font's ascent below the top, less the (negative) half-leading.
  const baseline = height / 2 - fontSize / 2 + ascent - (ascent + descent - fontSize) / 2;
  outline.fill = WHITE;
  const text = `<g transform="translate(${left + symbol + gap - bounds.x1} ${baseline})">${outline.toSVG(2)}</g>`;
  return canvas(width, height, `<rect width="${width}" height="${height}" fill="${TEAL}"/>${placed(SYMBOL, WHITE, left, symbolTop, symbol)}${text}`);
}

// Without inlining the styles: an inline `color` would beat the dark media query.
const svgo = (svg) =>
  optimize(svg, {
    multipass: true,
    plugins: [{ name: 'preset-default', params: { overrides: { inlineStyles: false } } }],
  }).data;

const outputs = {
  // Light tabs get the teal symbol; dark tabs, white. Browsers read `color` and media queries in an SVG favicon.
  'icon.svg': svgo(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><style>svg{color:${TEAL}}@media (prefers-color-scheme:dark){svg{color:${WHITE}}}</style>${SYMBOL}</svg>`,
  ),
  'favicon.ico': ico([
    { size: 16, data: await png(icon(16, { drawing: SYMBOL_16 })) },
    { size: 32, data: await png(icon(32)) },
    { size: 48, data: await png(icon(48)) },
  ]),
  // iOS rounds the corners itself, so its icon is full-bleed.
  'apple-touch-icon.png': await png(appIcon(180)),
  'icon-192.png': await png(appIcon(192, { rounded: true })),
  'icon-512.png': await png(appIcon(512, { rounded: true })),
  // Android crops a maskable icon to any shape within the central circle of 80 %: the symbol stays inside it.
  'icon-maskable-512.png': await png(appIcon(512, { ratio: 0.66 })),
  'og-image.png': await png(socialCard(1200, 630)),
};

for (const [file, data] of Object.entries(outputs)) {
  writeFileSync(publicDir(file), data);
  console.log(`${file}: ${data.length} B`);
}

// Email clients drop SVG, so the emails carry the symbol as a PNG: 96 px, shown at 32.
const emailLogo = (await png(icon(96))).toString('base64');
writeFileSync(
  fromScript('../apps/api/src/mail/logo.ts'),
  `import type { InlineImage } from './mailer.js';

/**
 * Verifiq's symbol as a 96 px PNG, shown at 32 px. Email clients drop SVG, so it travels inline with
 * each email instead. Generated by scripts/brand-assets.js: do not edit by hand.
 */
export const LOGO: InlineImage = {
  contentId: 'verifiq-logo',
  filename: 'verifiq.png',
  content: Buffer.from(
    '${emailLogo}',
    'base64',
  ),
};
`,
);
console.log(`apps/api/src/mail/logo.ts: ${emailLogo.length} B of base64`);

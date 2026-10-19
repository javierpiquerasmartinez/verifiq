import { LOGO } from './logo.js';
import type { EmailMessage } from './mailer.js';

/** Text within a notice; `{ strong }` is highlighted in the HTML version. */
export type Inline = string | { strong: string };

export type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'button'; label: string; url: string }
  | { kind: 'notice'; text: string | Inline[] }
  | { kind: 'details'; rows: [label: string, value: string][] }
  | { kind: 'list'; items: string[] };

export interface EmailContent {
  subject: string;
  /** Shown by the inbox next to the subject; HTML version only. */
  preview: string;
  /** HTML version only: the plain text opens straight with the body. */
  heading: string;
  blocks: Block[];
  /** Small print under the card, e.g. what to do if the email was not expected. */
  aside?: string;
}

const FOOTER = 'Verifiq · Facturación registrada en la AEAT con VERI*FACTU';

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Lays out an email after design.html's email boards, in plain text and in HTML. */
export function composeEmail(to: string, content: EmailContent): EmailMessage {
  return {
    to,
    subject: content.subject,
    text: plainText(content),
    html: html(content),
    inlineImages: [LOGO],
  };
}

const inlineText = (inline: string | Inline[]) =>
  typeof inline === 'string' ? inline : inline.map((part) => (typeof part === 'string' ? part : part.strong)).join('');

function blockText(block: Block): string {
  switch (block.kind) {
    case 'paragraph':
      return block.text;
    case 'button':
      return block.url;
    case 'notice':
      return inlineText(block.text);
    case 'details':
      return block.rows.map(([label, value]) => `${label}: ${value}`).join('\n');
    case 'list':
      return block.items.map((item) => `- ${item}`).join('\n');
  }
}

function plainText({ blocks, aside }: EmailContent): string {
  const sections = blocks.map(blockText);
  if (aside) sections.push(aside);
  return `${sections.join('\n\n')}\n\n--\n${FOOTER}`;
}

const INK = '#141E26';
const INK_2 = '#46515B';
const MUTED = '#5C6770';
const BRAND = '#0D4A57';
const LINE = '#DCDFDA';
const BOX_STYLE = 'padding: 14px 16px; background: #F0F1EE; border-radius: 6px; font-size: 15px; line-height: 1.5';

const inlineHtml = (inline: string | Inline[]) =>
  (typeof inline === 'string' ? [inline] : inline)
    .map((part) =>
      typeof part === 'string'
        ? escapeHtml(part)
        : `<strong style="color: ${INK}; font-weight: 600">${escapeHtml(part.strong)}</strong>`,
    )
    .join('');

/** The space under a block, desktop and mobile (as `.card .gap-*` in the media query). */
const GAPS = {
  normal: 16, // mobile 14
  wide: 28, // mobile 24: around the button
  wider: 32, // mobile 28: above the divider
  none: 0, // on the card's padding
};
type Gap = keyof typeof GAPS;

function gapAfter(blocks: Block[], index: number, divider: boolean): Gap {
  const next = blocks[index + 1];
  if (!next) return divider ? 'wider' : 'none';
  return blocks[index]!.kind === 'button' || next.kind === 'button' ? 'wide' : 'normal';
}

function blockHtml(block: Block, gap: Gap): string {
  const gapClass = `gap-${gap}`;
  const margin = GAPS[gap];
  switch (block.kind) {
    case 'paragraph':
      return `<p class="${gapClass}" style="margin: 0 0 ${margin}px; font-size: 16px; line-height: 1.55">${escapeHtml(block.text)}</p>`;
    case 'button':
      return `<table role="presentation" class="button ${gapClass}" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 0 0 ${margin}px"><tr>
<td style="background: ${BRAND}; border-radius: 6px"><a href="${escapeHtml(block.url)}" style="display: inline-block; padding: 15px 28px; font-size: 16px; font-weight: 600; line-height: 1; color: #FFFFFF; text-decoration: none; border-radius: 6px">${escapeHtml(block.label)}</a></td>
</tr></table>`;
    case 'notice':
      return `<p class="notice ${gapClass}" style="margin: 0 0 ${margin}px; ${BOX_STYLE}; color: ${INK_2}">${inlineHtml(block.text)}</p>`;
    case 'details': {
      const rows = block.rows
        .map(
          ([label, value]) =>
            `<tr><td style="padding: 3px 16px 3px 0; color: ${MUTED}; white-space: nowrap; vertical-align: top">${escapeHtml(label)}</td><td style="padding: 3px 0; word-break: break-word">${escapeHtml(value)}</td></tr>`,
        )
        .join('\n');
      return `<table role="presentation" class="notice ${gapClass}" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: separate; margin: 0 0 ${margin}px; ${BOX_STYLE}; color: ${INK}">
${rows}
</table>`;
    }
    case 'list': {
      const items = block.items.map((item) => `<li style="margin: 0 0 6px">${escapeHtml(item)}</li>`).join('\n');
      return `<ul class="${gapClass}" style="margin: 0 0 ${margin}px; padding: 0 0 0 20px; font-size: 15px; line-height: 1.5">
${items}
</ul>`;
    }
  }
}

/** If the button does not work: the link to copy, under a divider. */
const copyableLinkHtml = (
  url: string,
) => `<div class="divider" style="border-top: 1px solid ${LINE}; padding-top: 20px">
<p style="margin: 0 0 8px; font-size: 13.5px; line-height: 1.5; color: ${MUTED}">Si el botón no funciona, copia y pega esta dirección en tu navegador:</p>
<p style="margin: 0; font-family: 'IBM Plex Mono', Menlo, Consolas, monospace; font-size: 13px; line-height: 1.5; word-break: break-all"><a href="${url}" style="color: ${BRAND}">${url}</a></p>
</div>`;

function html({ subject, preview, heading, blocks, aside }: EmailContent): string {
  const button = blocks.find((block) => block.kind === 'button');
  const body = blocks.map((block, index) => blockHtml(block, gapAfter(blocks, index, !!button))).join('\n');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
<style>
@media (max-width: 600px) {
  .outer { padding: 24px 16px 32px !important; }
  .header { padding-bottom: 16px !important; }
  .logo img { width: 26px !important; height: 26px !important; }
  .wordmark { font-size: 17px !important; }
  .card { padding: 28px 22px !important; }
  .card h1 { margin-bottom: 18px !important; font-size: 22px !important; }
  .card .gap-normal { margin-bottom: 14px !important; }
  .card .gap-wide { margin-bottom: 24px !important; }
  .card .gap-wider { margin-bottom: 28px !important; }
  .card .notice { padding: 14px !important; }
  .card .button { width: 100% !important; }
  .card .button a { display: block !important; padding: 16px 20px !important; text-align: center; }
  .divider { padding-top: 18px !important; }
  .footer { padding: 20px 6px 0 !important; }
}
</style>
</head>
<body style="margin: 0; padding: 0; background: #F4F5F2">
<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background: #F4F5F2">
<tr><td class="outer" style="padding: 40px 20px; font-family: 'IBM Plex Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: ${INK}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; border-collapse: collapse">
<tr><td class="header" style="padding: 0 0 20px">
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse"><tr>
<td class="logo" width="28" style="width: 28px"><img src="cid:${LOGO.contentId}" width="28" height="28" alt="" style="display: block; width: 28px; height: 28px; border: 0"></td>
<td class="wordmark" style="padding-left: 10px; font-size: 18px; font-weight: 600; letter-spacing: -.01em; color: ${INK}">Verifiq</td>
</tr></table>
</td></tr>
<tr><td class="card" style="background: #FFFFFF; border: 1px solid ${LINE}; border-radius: 10px; padding: 40px">
<h1 style="margin: 0 0 20px; font-size: 24px; line-height: 1.25; font-weight: 600; letter-spacing: -.01em; color: ${INK}">${escapeHtml(heading)}</h1>
${body}
${button ? copyableLinkHtml(escapeHtml(button.url)) : ''}
</td></tr>
<tr><td class="footer" style="padding: 24px 8px 0; font-size: 13px; line-height: 1.55; color: ${MUTED}">
${aside ? `<p style="margin: 0 0 8px">${escapeHtml(aside)}</p>\n` : ''}<p style="margin: 0">${FOOTER}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

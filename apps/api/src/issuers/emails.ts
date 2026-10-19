import { composeEmail } from '../mail/layout.js';
import type { EmailMessage } from '../mail/mailer.js';

export function representationLinkEmail(to: string, url: string): EmailMessage {
  return composeEmail(to, {
    subject: 'Firma la autorización para registrar tus facturas',
    preview: 'Solo necesitas tu DNI, sin certificado digital.',
    heading: 'Firma la autorización',
    blocks: [
      { kind: 'paragraph', text: 'Hola:' },
      {
        kind: 'paragraph',
        text: 'Para que Verifiq pueda registrar tus facturas en la AEAT, falta que firmes la autorización.',
      },
      {
        kind: 'paragraph',
        text: 'Abre este enlace y verifica tu identidad con tu DNI; no necesitas certificado digital:',
      },
      { kind: 'button', label: 'Firmar la autorización', url },
      {
        kind: 'notice',
        text: 'Mientras no la firmes podrás preparar clientes, artículos y borradores, pero no emitir facturas.',
      },
    ],
  });
}

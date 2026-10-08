import { composeEmail } from '../mail/layout.js';
import type { EmailMessage } from '../mail/mailer.js';

export function representationLinkEmail(to: string, url: string): EmailMessage {
  return composeEmail(to, {
    subject: 'Firma la autorización para registrar tus facturas',
    preview: 'Solo necesitas tu DNI, sin certificado digital.',
    heading: 'Firma la autorización',
    blocks: [
      { paragraph: 'Hola:' },
      {
        paragraph: 'Para que Verifiq pueda registrar tus facturas en la AEAT, falta que firmes la autorización.',
      },
      {
        paragraph: 'Abre este enlace y verifica tu identidad con tu DNI; no necesitas certificado digital:',
      },
      { button: 'Firmar la autorización', url },
      {
        notice: 'Mientras no la firmes podrás preparar clientes, artículos y borradores, pero no emitir facturas.',
      },
    ],
  });
}

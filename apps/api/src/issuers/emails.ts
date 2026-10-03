import type { EmailMessage } from '../mail/mailer.js';

export function representationLinkEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Firma la autorización para registrar tus facturas',
    text: [
      'Hola:',
      '',
      'Para que Verifiq pueda registrar tus facturas en la AEAT, falta que firmes la autorización.',
      'Abre este enlace y verifica tu identidad con tu DNI; no necesitas certificado digital:',
      '',
      url,
      '',
      'Mientras no la firmes podrás preparar clientes, artículos y borradores, pero no emitir facturas.',
    ].join('\n'),
  };
}

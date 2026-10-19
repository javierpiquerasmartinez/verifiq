import { composeEmail } from '../mail/layout.js';
import type { EmailMessage } from '../mail/mailer.js';

const dateTime = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});

export function invitationEmail(to: string, url: string, expiresAt: Date): EmailMessage {
  const expiry = dateTime.format(expiresAt);
  return composeEmail(to, {
    subject: 'Te han invitado a Verifiq',
    preview: `Crea tu contraseña. El enlace caduca el ${expiry}.`,
    heading: 'Te han invitado a Verifiq',
    blocks: [
      { kind: 'paragraph', text: 'Hola:' },
      {
        kind: 'paragraph',
        text: 'Te han invitado a Verifiq, la aplicación para emitir tus facturas con VERI*FACTU.',
      },
      {
        kind: 'paragraph',
        text: 'Abre este enlace para crear tu contraseña y configurar la verificación en dos pasos:',
      },
      { kind: 'button', label: 'Crear mi contraseña', url },
      {
        kind: 'notice',
        text: ['El enlace sirve una sola vez y caduca el ', { strong: expiry }, '.'],
      },
    ],
    aside: 'Si no esperabas esta invitación, puedes ignorar este correo: no se creará ninguna cuenta.',
  });
}

export function passwordResetEmail(to: string, url: string): EmailMessage {
  return composeEmail(to, {
    subject: 'Restablece tu contraseña de Verifiq',
    preview: 'Elige una contraseña nueva. El enlace caduca en 1 hora.',
    heading: 'Restablece tu contraseña',
    blocks: [
      { kind: 'paragraph', text: 'Hola:' },
      {
        kind: 'paragraph',
        text: 'Hemos recibido una solicitud para restablecer tu contraseña de Verifiq.',
      },
      { kind: 'paragraph', text: 'Abre este enlace para elegir una nueva:' },
      { kind: 'button', label: 'Elegir nueva contraseña', url },
      { kind: 'notice', text: ['El enlace caduca en ', { strong: '1 hora' }, '.'] },
    ],
    aside: 'Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambiará.',
  });
}

export function loginNotificationEmail(
  to: string,
  { at, ipAddress, userAgent }: { at: Date; ipAddress?: string; userAgent?: string },
): EmailMessage {
  const when = dateTime.format(at);
  return composeEmail(to, {
    subject: 'Nuevo inicio de sesión en Verifiq',
    preview: `Se ha iniciado sesión en tu cuenta el ${when}.`,
    heading: 'Nuevo inicio de sesión',
    blocks: [
      { kind: 'paragraph', text: 'Hola:' },
      { kind: 'paragraph', text: 'Se ha iniciado sesión en tu cuenta de Verifiq.' },
      {
        kind: 'details',
        rows: [
          ['Fecha', when],
          ['Dirección IP', ipAddress ?? 'desconocida'],
          ['Navegador', userAgent ?? 'desconocido'],
        ],
      },
      {
        kind: 'notice',
        text: 'Si no has sido tú, cambia tu contraseña cuanto antes desde «¿Has olvidado tu contraseña?».',
      },
    ],
  });
}

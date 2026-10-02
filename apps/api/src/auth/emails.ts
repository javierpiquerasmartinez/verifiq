import type { EmailMessage } from '../mail/mailer.js';

const dateTime = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});

export function invitationEmail(to: string, url: string, expiresAt: Date): EmailMessage {
  return {
    to,
    subject: 'Tu invitación a Verifiq',
    text: [
      'Hola:',
      '',
      'Te han invitado a Verifiq, la aplicación para emitir tus facturas con VERI*FACTU.',
      'Abre este enlace para crear tu contraseña y configurar la verificación en dos pasos:',
      '',
      url,
      '',
      `El enlace sirve una sola vez y caduca el ${dateTime.format(expiresAt)}.`,
    ].join('\n'),
  };
}

export function passwordResetEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Restablece tu contraseña de Verifiq',
    text: [
      'Hola:',
      '',
      'Hemos recibido una solicitud para restablecer tu contraseña de Verifiq.',
      'Abre este enlace para elegir una nueva (caduca en 1 hora):',
      '',
      url,
      '',
      'Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambiará.',
    ].join('\n'),
  };
}

export function loginNotificationEmail(
  to: string,
  { at, ipAddress, userAgent }: { at: Date; ipAddress?: string; userAgent?: string },
): EmailMessage {
  return {
    to,
    subject: 'Nuevo inicio de sesión en Verifiq',
    text: [
      'Hola:',
      '',
      'Se ha iniciado sesión en tu cuenta de Verifiq.',
      '',
      `Fecha: ${dateTime.format(at)}`,
      `Dirección IP: ${ipAddress ?? 'desconocida'}`,
      `Navegador: ${userAgent ?? 'desconocido'}`,
      '',
      'Si no has sido tú, cambia tu contraseña cuanto antes desde «¿Has olvidado tu contraseña?».',
    ].join('\n'),
  };
}

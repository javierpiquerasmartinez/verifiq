import type { EmailMessage } from '../mail/mailer.js';

const dateTime = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
});

const FOOTER = 'Verifiq · Facturación registrada en la AEAT con VERI*FACTU';

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function invitationEmail(to: string, url: string, expiresAt: Date): EmailMessage {
  const expiry = dateTime.format(expiresAt);
  return {
    to,
    subject: 'Te han invitado a Verifiq',
    text: [
      'Hola:',
      '',
      'Te han invitado a Verifiq, la aplicación para emitir tus facturas con VERI*FACTU.',
      '',
      'Abre este enlace para crear tu contraseña y configurar la verificación en dos pasos:',
      '',
      url,
      '',
      `El enlace sirve una sola vez y caduca el ${expiry}.`,
      '',
      'Si no esperabas esta invitación, puedes ignorar este correo: no se creará ninguna cuenta.',
      '',
      '--',
      FOOTER,
    ].join('\n'),
    html: invitationHtml(url, expiry),
  };
}

/** The layout of design.html's invitation boards. Inline styles and tables, as email clients need. */
function invitationHtml(rawUrl: string, rawExpiry: string): string {
  const url = escapeHtml(rawUrl);
  const expiry = escapeHtml(rawExpiry);
  const paragraphStyle = 'margin: 0 0 16px; font-size: 16px; line-height: 1.55';
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Te han invitado a Verifiq</title>
<style>
@media (max-width: 600px) {
  .outer { padding: 24px 16px 32px !important; }
  .header { padding-bottom: 16px !important; }
  .logo { width: 26px !important; height: 26px !important; line-height: 26px !important; }
  .wordmark { font-size: 17px !important; }
  .card { padding: 28px 22px !important; }
  .card h1 { margin-bottom: 18px !important; font-size: 22px !important; }
  .card p { margin-bottom: 14px !important; }
  .card .lead { margin-bottom: 24px !important; }
  .button { width: 100% !important; margin-bottom: 24px !important; }
  .button a { display: block !important; padding: 16px 20px !important; text-align: center; }
  .card .expiry { margin-bottom: 28px !important; padding: 14px !important; }
  .divider { padding-top: 18px !important; }
  .card .divider p { margin-bottom: 8px !important; }
  .card .divider p + p { margin-bottom: 0 !important; }
  .footer { padding: 20px 6px 0 !important; }
}
</style>
</head>
<body style="margin: 0; padding: 0; background: #F4F5F2">
<div style="display: none; max-height: 0; overflow: hidden; mso-hide: all">Crea tu contraseña. El enlace caduca el ${expiry}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse; background: #F4F5F2">
<tr><td class="outer" style="padding: 40px 20px; font-family: 'IBM Plex Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: #141E26">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; border-collapse: collapse">
<tr><td class="header" style="padding: 0 0 20px">
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse"><tr>
<td class="logo" width="28" height="28" align="center" style="width: 28px; height: 28px; background: #0D4A57; border-radius: 7px; color: #FFFFFF; font-size: 16px; font-weight: 700; line-height: 28px">&#10003;</td>
<td class="wordmark" style="padding-left: 10px; font-size: 18px; font-weight: 600; letter-spacing: -.01em; color: #141E26">Verifiq</td>
</tr></table>
</td></tr>
<tr><td class="card" style="background: #FFFFFF; border: 1px solid #DCDFDA; border-radius: 10px; padding: 40px">
<h1 style="margin: 0 0 20px; font-size: 24px; line-height: 1.25; font-weight: 600; letter-spacing: -.01em; color: #141E26">Te han invitado a Verifiq</h1>
<p style="${paragraphStyle}">Hola:</p>
<p style="${paragraphStyle}">Te han invitado a Verifiq, la aplicación para emitir tus facturas con VERI*FACTU.</p>
<p class="lead" style="${paragraphStyle}; margin-bottom: 28px">Abre este enlace para crear tu contraseña y configurar la verificación en dos pasos:</p>
<table role="presentation" class="button" cellpadding="0" cellspacing="0" style="border-collapse: collapse; margin: 0 0 28px"><tr>
<td style="background: #0D4A57; border-radius: 6px"><a href="${url}" style="display: inline-block; padding: 15px 28px; font-size: 16px; font-weight: 600; line-height: 1; color: #FFFFFF; text-decoration: none; border-radius: 6px">Crear mi contraseña</a></td>
</tr></table>
<p class="expiry" style="margin: 0 0 32px; padding: 14px 16px; background: #F0F1EE; border-radius: 6px; font-size: 15px; line-height: 1.5; color: #46515B">El enlace sirve una sola vez y caduca el <strong style="color: #141E26; font-weight: 600">${expiry}</strong>.</p>
<div class="divider" style="border-top: 1px solid #DCDFDA; padding-top: 20px">
<p style="margin: 0 0 8px; font-size: 13.5px; line-height: 1.5; color: #5C6770">Si el botón no funciona, copia y pega esta dirección en tu navegador:</p>
<p style="margin: 0; font-family: 'IBM Plex Mono', Menlo, Consolas, monospace; font-size: 13px; line-height: 1.5; word-break: break-all"><a href="${url}" style="color: #0D4A57">${url}</a></p>
</div>
</td></tr>
<tr><td class="footer" style="padding: 24px 8px 0; font-size: 13px; line-height: 1.55; color: #5C6770">
<p style="margin: 0 0 8px">Si no esperabas esta invitación, puedes ignorar este correo: no se creará ninguna cuenta.</p>
<p style="margin: 0">${FOOTER}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
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

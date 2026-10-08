import { describe, expect, it } from 'vitest';
import { invitationEmail, loginNotificationEmail, passwordResetEmail } from '../src/auth/emails.js';
import { unconfirmedRecordsEmail } from '../src/invoices/emails.js';
import { representationLinkEmail } from '../src/issuers/emails.js';

const INVITATION_URL = 'https://app.example.com/invitation/Hw7A1xrwltcTXSFViz6CNBpbkwKhJPomS10L2ekxSt4';
const EXPIRES_AT = new Date('2026-10-15T08:03:00Z');
const SIGNATURE = ['', '--', 'Verifiq · Facturación registrada en la AEAT con VERI*FACTU'];

describe('invitationEmail', () => {
  const email = invitationEmail('lucia@example.com', INVITATION_URL, EXPIRES_AT);

  it('is addressed to the invited user', () => {
    expect(email.to).toBe('lucia@example.com');
    expect(email.subject).toBe('Te han invitado a Verifiq');
  });

  it('has a plain-text version with the link, its expiry and a footer', () => {
    expect(email.text).toBe(
      [
        'Hola:',
        '',
        'Te han invitado a Verifiq, la aplicación para emitir tus facturas con VERI*FACTU.',
        '',
        'Abre este enlace para crear tu contraseña y configurar la verificación en dos pasos:',
        '',
        INVITATION_URL,
        '',
        'El enlace sirve una sola vez y caduca el 15 de octubre de 2026 a las 10:03.',
        '',
        'Si no esperabas esta invitación, puedes ignorar este correo: no se creará ninguna cuenta.',
        '',
        '--',
        'Verifiq · Facturación registrada en la AEAT con VERI*FACTU',
      ].join('\n'),
    );
  });

  it('has an HTML version with a preview text, a button to the link and the link to copy', () => {
    const html = email.html!;
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('Crea tu contraseña. El enlace caduca el 15 de octubre de 2026 a las 10:03.');
    expect(html).toContain(`<a href="${INVITATION_URL}"`);
    expect(html).toContain('Crear mi contraseña</a>');
    expect(html).toContain(`>${INVITATION_URL}</a>`);
    expect(html).toContain('<strong');
    expect(html).toContain('15 de octubre de 2026 a las 10:03</strong>');
    expect(html).toContain('no se creará ninguna cuenta');
  });

  it('escapes the link in the HTML version', () => {
    const html = invitationEmail('lucia@example.com', 'https://app.example.com/invitation/a"b<c&d', EXPIRES_AT).html!;
    expect(html).toContain('https://app.example.com/invitation/a&quot;b&lt;c&amp;d');
    expect(html).not.toContain('a"b<c');
  });
});

describe('passwordResetEmail', () => {
  const url = 'https://api.example.com/auth/reset-password/abc?callbackURL=x';
  const email = passwordResetEmail('lucia@example.com', url);

  it('has a plain-text version with the link and its expiry', () => {
    expect(email.subject).toBe('Restablece tu contraseña de Verifiq');
    expect(email.text).toBe(
      [
        'Hola:',
        '',
        'Hemos recibido una solicitud para restablecer tu contraseña de Verifiq.',
        '',
        'Abre este enlace para elegir una nueva:',
        '',
        url,
        '',
        'El enlace caduca en 1 hora.',
        '',
        'Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambiará.',
        ...SIGNATURE,
      ].join('\n'),
    );
  });

  it('has an HTML version with a button to the link', () => {
    expect(email.html).toContain('Restablece tu contraseña</h1>');
    expect(email.html).toContain('Elegir nueva contraseña</a>');
    expect(email.html).toContain('href="https://api.example.com/auth/reset-password/abc?callbackURL=x"');
  });
});

describe('loginNotificationEmail', () => {
  const at = new Date('2026-10-08T10:15:00Z');

  it('has a plain-text version with the sign-in details', () => {
    const email = loginNotificationEmail('lucia@example.com', {
      at,
      ipAddress: '10.0.0.1',
      userAgent: 'Firefox',
    });
    expect(email.subject).toBe('Nuevo inicio de sesión en Verifiq');
    expect(email.text).toBe(
      [
        'Hola:',
        '',
        'Se ha iniciado sesión en tu cuenta de Verifiq.',
        '',
        'Fecha: 8 de octubre de 2026 a las 12:15',
        'Dirección IP: 10.0.0.1',
        'Navegador: Firefox',
        '',
        'Si no has sido tú, cambia tu contraseña cuanto antes desde «¿Has olvidado tu contraseña?».',
        ...SIGNATURE,
      ].join('\n'),
    );
  });

  it('says when the IP address or the browser are unknown', () => {
    const email = loginNotificationEmail('lucia@example.com', { at });
    expect(email.text).toContain('Dirección IP: desconocida');
    expect(email.text).toContain('Navegador: desconocido');
  });

  it('escapes the browser, which the client chooses, in the HTML version', () => {
    const email = loginNotificationEmail('lucia@example.com', {
      at,
      userAgent: '<img src=x onerror=alert(1)>',
    });
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(email.html).not.toContain('<img');
  });
});

describe('representationLinkEmail', () => {
  const url = 'https://sign.example.com/r/123';
  const email = representationLinkEmail('lucia@example.com', url);

  it('has a plain-text version with the signing link', () => {
    expect(email.subject).toBe('Firma la autorización para registrar tus facturas');
    expect(email.text).toBe(
      [
        'Hola:',
        '',
        'Para que Verifiq pueda registrar tus facturas en la AEAT, falta que firmes la autorización.',
        '',
        'Abre este enlace y verifica tu identidad con tu DNI; no necesitas certificado digital:',
        '',
        url,
        '',
        'Mientras no la firmes podrás preparar clientes, artículos y borradores, pero no emitir facturas.',
        ...SIGNATURE,
      ].join('\n'),
    );
  });

  it('has an HTML version with a button to the link', () => {
    expect(email.html).toContain('Firmar la autorización</a>');
    expect(email.html).toContain(`href="${url}"`);
  });
});

describe('unconfirmedRecordsEmail', () => {
  const email = unconfirmedRecordsEmail('operator@example.com', [
    {
      invoiceRecordId: 'rec-1',
      invoiceNumber: 'A-2026-0001',
      issuerTaxId: 'B12345678',
      issuedAt: new Date('2026-10-07T08:00:00Z'),
    },
  ]);

  it('lists the records in its plain-text version', () => {
    expect(email.text).toBe(
      [
        'Estos registros de facturación siguen sin respuesta de la AEAT más de 24 h después de emitirse:',
        '',
        '- A-2026-0001 · Emisor B12345678 · emitida 2026-10-07T08:00:00.000Z · registro rec-1',
        '',
        'Revisa su estado en el conector y en el registro de intercambios (connector_exchanges).',
        ...SIGNATURE,
      ].join('\n'),
    );
  });

  it('lists the records in its HTML version, without a button', () => {
    expect(email.html).toContain(
      'A-2026-0001 · Emisor B12345678 · emitida 2026-10-07T08:00:00.000Z · registro rec-1</li>',
    );
    expect(email.html).not.toContain('Si el botón no funciona');
  });
});

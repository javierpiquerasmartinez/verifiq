import { describe, expect, it } from 'vitest';
import { invitationEmail } from '../src/auth/emails.js';

const INVITATION_URL = 'https://app.example.com/invitation/Hw7A1xrwltcTXSFViz6CNBpbkwKhJPomS10L2ekxSt4';
const EXPIRES_AT = new Date('2026-10-15T08:03:00Z');

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

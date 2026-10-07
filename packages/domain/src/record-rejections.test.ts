import { describe, expect, it } from 'vitest';
import { explainRecordRejection } from './record-rejections.js';

describe('explainRecordRejection', () => {
  it('explains a known refusal in plain language', () => {
    expect(explainRecordRejection({ code: 'recipient-not-in-census', message: 'El NIF/NOMBRE (B1/X) del destinatario…' })).toBe(
      'Hacienda no reconoce el NIF o el nombre del cliente. Corrígelos en su ficha: el nombre debe coincidir con el que figura en Hacienda.',
    );
  });

  it("falls back to the connector's message for a code it does not know", () => {
    expect(explainRecordRejection({ code: 'vf-verifactu-nuevo', message: 'Algo nuevo ha fallado.' })).toBe('Algo nuevo ha fallado.');
  });
});

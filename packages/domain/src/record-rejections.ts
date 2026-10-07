// Why the VeriFactu connector refuses a record synchronously (it is then blocked: nothing reached the
// AEAT). The connector adapters translate their own codes into these; codes they do not know pass
// through as they come, and the user sees the connector's message instead.

export const RECORD_REJECTION_CODES = {
  /** The issuer has no key at the connector. */
  issuerNotRegistered: 'issuer-not-registered',
  /** The recipient's tax ID and name are not in the AEAT census (a legal person's tax ID, or a person's name too). */
  recipientNotInCensus: 'recipient-not-in-census',
  recipientTaxIdInvalid: 'recipient-tax-id-invalid',
  /** Longer than the 120 characters the AEAT takes. */
  recipientNameTooLong: 'recipient-name-too-long',
  /** A text of the record (the recipient's name, the description) has a control character. */
  invalidCharacter: 'invalid-character',
  /** A new record is registered on its issue date only. */
  issueDateNotToday: 'issue-date-not-today',
  /** The AEAT takes up to 12 breakdown rows. */
  tooManyLines: 'too-many-lines',
  totalMismatch: 'total-mismatch',
  /** Another record has the same series, number and issue date. */
  duplicateInvoice: 'duplicate-invoice',
} as const;

export type RecordRejectionCode = (typeof RECORD_REJECTION_CODES)[keyof typeof RECORD_REJECTION_CODES];

const EXPLANATIONS: Record<RecordRejectionCode, string> = {
  'issuer-not-registered':
    'Tu cuenta aún no está dada de alta en el sistema que registra las facturas en Hacienda. Ya lo estamos revisando; vuelve a intentarlo más tarde.',
  'recipient-not-in-census':
    'Hacienda no reconoce el NIF o el nombre del cliente. Corrígelos en su ficha: el nombre debe coincidir con el que figura en Hacienda.',
  'recipient-tax-id-invalid': 'El NIF del cliente no tiene un formato válido. Corrígelo en su ficha.',
  'recipient-name-too-long': 'El nombre del cliente supera los 120 caracteres que admite Hacienda. Acórtalo en su ficha.',
  'invalid-character':
    'El nombre del cliente o la descripción de la operación contienen un carácter que Hacienda no admite. Revísalos y vuelve a intentarlo.',
  'issue-date-not-today':
    'Hacienda solo admite registrar una factura el mismo día de su fecha de expedición. Habrá que anularla (su número no se reutiliza) y emitir una nueva.',
  'too-many-lines': 'Hacienda admite como máximo 12 tipos de IVA o exención distintos en una factura.',
  'total-mismatch':
    'El importe total no cuadra con la suma de bases y cuotas. Es un error nuestro: vuelve a intentarlo y, si se repite, escríbenos.',
  'duplicate-invoice': 'Hacienda ya tiene una factura registrada con este número y fecha.',
};

/** What the user is told about a refusal: a clear explanation of a known code, or the connector's own message. */
export function explainRecordRejection(rejection: { code: string; message: string }): string {
  return (EXPLANATIONS as Record<string, string | undefined>)[rejection.code] ?? rejection.message;
}

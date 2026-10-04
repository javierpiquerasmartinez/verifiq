import { UNCONFIRMED_RECORD_HOURS } from '@verifiq/domain';
import type { EmailMessage } from '../mail/mailer.js';

export interface UnconfirmedRecord {
  invoiceRecordId: string;
  invoiceNumber: string;
  issuerTaxId: string;
  issuedAt: Date;
}

/** To the operator: records the AEAT has not confirmed long after their Issuance. */
export function unconfirmedRecordsEmail(to: string, records: UnconfirmedRecord[]): EmailMessage {
  return {
    to,
    subject: `${records.length} registro(s) sin confirmar por la AEAT tras ${UNCONFIRMED_RECORD_HOURS} h`,
    text: [
      `Estos registros de facturación siguen sin respuesta de la AEAT más de ${UNCONFIRMED_RECORD_HOURS} h después de emitirse:`,
      '',
      ...records.map(
        (record) =>
          `- ${record.invoiceNumber} · Emisor ${record.issuerTaxId} · emitida ${record.issuedAt.toISOString()} · registro ${record.invoiceRecordId}`,
      ),
      '',
      'Revisa su estado en el conector y en el registro de intercambios (connector_exchanges).',
    ].join('\n'),
  };
}

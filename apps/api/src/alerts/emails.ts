import { composeEmail } from '../mail/layout.js';
import type { EmailMessage } from '../mail/mailer.js';
import type { OperatorAlert, OperatorAlertKind } from './operator-alerts.js';

const COPY: Record<OperatorAlertKind, { subject: string; explanation: string }> = {
  'record-submission-failing': {
    subject: 'Un registro no consigue enviarse a VeriFactu',
    explanation:
      'El worker no consigue enviar este registro de facturación al conector (o dibujar su PDF) y seguirá reintentándolo durante un día. Comprueba el estado de Verifacti y el registro de intercambios (connector_exchanges).',
  },
  'record-submission-abandoned': {
    subject: 'Un registro ha dejado de reintentarse',
    explanation:
      'El worker ha agotado los reintentos de este registro de facturación: no volverá a enviarlo (ni a dibujar su PDF) por sí solo. Revisa el conector y los logs del worker.',
  },
  'status-poll-failed': {
    subject: 'El sondeo del estado de los registros ha fallado',
    explanation:
      'Ha fallado una ronda del sondeo cada 15 minutos que respalda al webhook de resultados. Si se repite, los veredictos de la AEAT solo llegan por el webhook: revisa los logs del worker.',
  },
  'webhook-signature-invalid': {
    subject: 'Avisos del webhook con firma no válida',
    explanation:
      'Han llegado avisos al webhook de resultados con una firma que no corresponde a VERIFACTI_WEBHOOK_SECRET. Si vienen de Verifacti, el secreto no coincide y los veredictos solo llegarán por el sondeo cada 15 minutos; si no, alguien está probando el endpoint.',
  },
  'webhook-failed': {
    subject: 'Un aviso del webhook no se pudo procesar',
    explanation:
      'Un aviso de Verifacti con firma válida falló al procesarse y se respondió 500: Verifacti lo reintentará, pero desactiva el webhook si sus envíos siguen fallando.',
  },
  'archive-round-failed': {
    subject: 'La copia diaria del archivo de conservación ha fallado',
    explanation:
      'La copia diaria a R2 (archive/) ha fallado. La próxima copia exportará también lo que esta no pudo; si se repite, revisa R2 y los logs del worker.',
  },
  'archive-file-missing': {
    subject: 'Falta el fichero de un PDF emitido',
    explanation:
      'El archivo de conservación no encontró en R2 el fichero de estas versiones de PDF y no ha podido copiarlas. Son pruebas perdidas: revisa el bucket y los logs del worker.',
  },
};

/** To the operator: a failure of the worker or the results webhook. */
export function operatorAlertEmail(to: string, { kind, detail }: OperatorAlert): EmailMessage {
  const { subject, explanation } = COPY[kind];
  return composeEmail(to, {
    subject,
    preview: explanation,
    heading: subject,
    blocks: [
      { kind: 'paragraph', text: explanation },
      { kind: 'list', items: detail },
      { kind: 'paragraph', text: 'Durante la próxima hora, los avisos de este tipo solo quedan en los logs.' },
    ],
  });
}

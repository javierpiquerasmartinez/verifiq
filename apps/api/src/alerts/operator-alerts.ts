import { Inject, Injectable, Logger } from '@nestjs/common';
import { composeEmail } from '../mail/layout.js';
import { MAILER, type EmailMessage, type Mailer } from '../mail/mailer.js';
import { SUBMISSION_OPTIONS, type SubmissionOptions } from '../invoices/submission-queue.js';

const HOUR = 3_600_000;

/** What went wrong in the background, with nobody watching but the operator. */
export type OperatorAlertKind =
  | 'record-submission-failing'
  | 'webhook-signature-invalid'
  | 'webhook-failed'
  | 'archive-round-failed'
  | 'archive-file-missing';

export interface OperatorAlert {
  kind: OperatorAlertKind;
  /** What happened, for the operator: ids, error messages. */
  detail: string;
}

/**
 * Alerts the operator by email (OPERATOR_EMAIL) of the failures of the worker and the results webhook
 * (issue 21). At most one email an hour of each kind, per process: the rest go only to the log, which
 * always gets them. Never throws: a failed alert must not break what raised it.
 */
@Injectable()
export class OperatorAlerts {
  private readonly logger = new Logger(OperatorAlerts.name);
  /** When the last email of each kind went out. */
  private readonly lastSent = new Map<OperatorAlertKind, number>();

  constructor(
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(SUBMISSION_OPTIONS) private readonly options: SubmissionOptions,
  ) {}

  async raise(alert: OperatorAlert, now = new Date()): Promise<void> {
    this.logger.error(`${alert.kind}: ${alert.detail}`);
    const { operatorEmail } = this.options;
    if (!operatorEmail) return;
    const last = this.lastSent.get(alert.kind);
    if (last !== undefined && now.getTime() - last < HOUR) return;
    this.lastSent.set(alert.kind, now.getTime());
    try {
      await this.mailer.send(operatorAlertEmail(operatorEmail, alert));
    } catch (error) {
      this.lastSent.delete(alert.kind);
      this.logger.error(`Could not email the operator the alert ${alert.kind}`, error);
    }
  }
}

/** An error's message, for an alert. */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const COPY: Record<OperatorAlertKind, { subject: string; explanation: string }> = {
  'record-submission-failing': {
    subject: 'Un registro no consigue enviarse a VeriFactu',
    explanation:
      'El worker no consigue enviar este registro de facturación al conector (o dibujar su PDF). Comprueba el estado de Verifacti y el registro de intercambios (connector_exchanges).',
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

function operatorAlertEmail(to: string, { kind, detail }: OperatorAlert): EmailMessage {
  const { subject, explanation } = COPY[kind];
  return composeEmail(to, {
    subject,
    preview: explanation,
    heading: subject,
    blocks: [
      { kind: 'paragraph', text: explanation },
      { kind: 'list', items: detail.split('\n') },
      { kind: 'paragraph', text: 'Durante la próxima hora, los avisos de este tipo solo quedan en los logs.' },
    ],
  });
}

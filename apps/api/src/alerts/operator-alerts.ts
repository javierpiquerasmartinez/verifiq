import { Inject, Injectable, Logger } from '@nestjs/common';
import { SUBMISSION_OPTIONS, type SubmissionOptions } from '../invoices/submission-queue.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { operatorAlertEmail } from './emails.js';

const HOUR = 3_600_000;

/** What went wrong in the background, with nobody watching but the operator. */
export type OperatorAlertKind =
  | 'record-submission-failing'
  | 'record-submission-abandoned'
  | 'status-poll-failed'
  | 'webhook-signature-invalid'
  | 'webhook-failed'
  | 'archive-round-failed'
  | 'archive-file-missing';

export interface OperatorAlert {
  kind: OperatorAlertKind;
  /** What happened, for the operator, one fact a line: ids, error messages. */
  detail: string[];
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
    this.logger.error(`${alert.kind}: ${alert.detail.join(' | ')}`);
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

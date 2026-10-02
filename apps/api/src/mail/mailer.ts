import { Logger } from '@nestjs/common';
import { Resend } from 'resend';

export const MAILER = Symbol('MAILER');

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Port for transactional emails. Nothing outside the adapters knows the provider. */
export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

/** Resend adapter. The sending domain must be registered in Resend's EU region. */
export class ResendMailer implements Mailer {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.resend = new Resend(apiKey);
  }

  async send({ to, subject, text }: EmailMessage): Promise<void> {
    const { error } = await this.resend.emails.send({ from: this.from, to, subject, text });
    if (error) throw new Error(`Resend rejected the email: ${error.name}: ${error.message}`);
  }
}

/** Local development without a Resend key: emails go to the log. */
export class LogMailer implements Mailer {
  private readonly logger = new Logger('Mail');

  async send({ to, subject, text }: EmailMessage): Promise<void> {
    this.logger.log(`To: ${to}\nSubject: ${subject}\n\n${text}`);
  }
}

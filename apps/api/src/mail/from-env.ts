import { Logger } from '@nestjs/common';
import type { Env } from '../config.js';
import { LogMailer, ResendMailer, type Mailer } from './mailer.js';

export function mailerFromEnv(env: Env): Mailer {
  if (env.RESEND_API_KEY) return new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM);
  new Logger('Mail').warn('RESEND_API_KEY is not set: emails are written to the log');
  return new LogMailer();
}

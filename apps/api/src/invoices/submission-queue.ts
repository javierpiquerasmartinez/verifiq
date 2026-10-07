import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PgBoss, type Job } from 'pg-boss';
import type pg from 'pg';

export const SUBMISSION_OPTIONS = Symbol('SUBMISSION_OPTIONS');

export interface SubmissionOptions {
  databaseUrl: string;
  /** The pg-boss queue; tests give each app its own. */
  queueName: string;
  /** Whether this process sends the records and polls their status: the worker service does (and maintains the queue). */
  work: boolean;
  /** Where to alert the operator of records the AEAT has not confirmed in 24 h. */
  operatorEmail?: string;
}

export const SUBMISSION_QUEUE_NAME = 'invoice-record-submission';

export interface SubmissionJob {
  invoiceRecordId: string;
}

/**
 * The outbox of InvoiceRecords to send (pg-boss). A job is added in the transaction of the Issuance,
 * so it exists exactly when the record does. Failed jobs come back with exponential backoff.
 */
@Injectable()
export class SubmissionQueue implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SubmissionQueue.name);
  private readonly boss: PgBoss;

  constructor(@Inject(SUBMISSION_OPTIONS) private readonly options: SubmissionOptions) {
    this.boss = new PgBoss({
      connectionString: options.databaseUrl,
      max: 3,
      // Maintenance and schedules run in the worker only.
      supervise: options.work,
      schedule: options.work,
    });
    this.boss.on('error', (error) => this.logger.error(error));
  }

  async onModuleInit(): Promise<void> {
    await this.boss.start();
    await this.boss.createQueue(this.options.queueName, {
      // Seconds: 10 s, 20 s, 40 s… up to an hour between attempts, for about a day.
      retryLimit: 30,
      retryDelay: 10,
      retryBackoff: true,
      retryDelayMax: 3600,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.boss.stop({ graceful: true });
  }

  /** Adds the job on `client`, inside the transaction open on it. */
  async enqueue(job: SubmissionJob, client: pg.PoolClient): Promise<void> {
    await this.boss.send(this.options.queueName, job, {
      db: { executeSql: (text, values) => client.query(text, values) },
    });
  }

  /** Runs `handler` on every job as it comes; a job whose handler throws is retried later. */
  async work(handler: (job: SubmissionJob) => Promise<void>): Promise<void> {
    await this.boss.work<SubmissionJob>(this.options.queueName, async (jobs) => {
      for (const job of jobs) await handler(job.data);
    });
  }

  /** Runs the status poll every 15 minutes, one round at a time; a round that throws is not retried. */
  async scheduleStatusPoll(handler: () => Promise<void>): Promise<void> {
    const name = `${this.options.queueName}-status-poll`;
    await this.boss.createQueue(name, { policy: 'exclusive', retryLimit: 0 });
    await this.boss.schedule(name, '*/15 * * * *');
    await this.boss.work(name, () => handler());
  }

  /** The jobs ready to run now, claimed for this caller. */
  async fetch(): Promise<Job<SubmissionJob>[]> {
    return this.boss.fetch<SubmissionJob>(this.options.queueName, { batchSize: 10 });
  }

  async complete(job: Job<SubmissionJob>): Promise<void> {
    await this.boss.complete(this.options.queueName, job);
  }

  async fail(job: Job<SubmissionJob>, error: unknown): Promise<void> {
    await this.boss.fail(this.options.queueName, job, { message: String(error) });
  }
}

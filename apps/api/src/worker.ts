import 'reflect-metadata';
import { Logger, Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadEnv, type Env } from './config.js';
import { DatabaseModule } from './database/database.module.js';
import { SubmissionModule } from './invoices/invoices.module.js';
import { SUBMISSION_QUEUE_NAME } from './invoices/submission-queue.js';
import { mailerFromEnv } from './mail/from-env.js';
import { MailModule } from './mail/mail.module.js';
import { objectStorageFromEnv } from './storage/from-env.js';
import { StorageModule } from './storage/storage.module.js';
import { verifactuConnectorFromEnv } from './verifactu/from-env.js';
import { VerifactuModule } from './verifactu/verifactu.module.js';
import { loadBuildVersion } from './version.js';

/**
 * Background worker (Render): sends the InvoiceRecords of the outbox to the VeriFactu connector, draws
 * their PDFs, and polls the status of those still without the AEAT's verdict.
 */
@Module({})
class WorkerModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        DatabaseModule.forRoot(env.DATABASE_URL),
        VerifactuModule.forRoot(verifactuConnectorFromEnv(env)),
        StorageModule.forRoot(objectStorageFromEnv(env)),
        MailModule.forRoot(mailerFromEnv(env)),
        SubmissionModule.forRoot({
          databaseUrl: env.DATABASE_URL,
          queueName: SUBMISSION_QUEUE_NAME,
          work: true,
          operatorEmail: env.OPERATOR_EMAIL,
        }),
      ],
    };
  }
}

const env = loadEnv();
const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(env));
app.enableShutdownHooks();
new Logger('Worker').log(`Verifiq worker ${loadBuildVersion()} started`);

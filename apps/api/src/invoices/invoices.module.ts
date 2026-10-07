import { Module, type DynamicModule } from '@nestjs/common';
import { DraftsModule } from '../drafts/drafts.module.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicePdfsService } from './invoice-pdfs.js';
import { InvoicesService } from './invoices.js';
import { RecordStatusPoller } from './record-status-poller.js';
import { RecordVerdicts } from './record-verdicts.js';
import { WebhooksController } from './webhooks.controller.js';
import { SUBMISSION_OPTIONS, SubmissionQueue, type SubmissionOptions } from './submission-queue.js';
import { SubmissionWorker } from './submission-worker.js';

/**
 * The outbox of InvoiceRecords, the worker that sends them to the VeriFactu connector, the PDFs it
 * draws once they have their QR, and the AEAT's verdicts on them (webhook and poll).
 */
@Module({})
export class SubmissionModule {
  static forRoot(options: SubmissionOptions): DynamicModule {
    return {
      module: SubmissionModule,
      global: true,
      providers: [
        { provide: SUBMISSION_OPTIONS, useValue: options },
        SubmissionQueue,
        SubmissionWorker,
        InvoicePdfsService,
        RecordVerdicts,
        RecordStatusPoller,
      ],
      exports: [SubmissionQueue, InvoicePdfsService, RecordVerdicts],
    };
  }
}

/** Issuance, issued invoices, and the connector's results webhook. */
@Module({
  imports: [DraftsModule],
  controllers: [InvoicesController, WebhooksController],
  providers: [InvoicesService],
})
export class InvoicesModule {}

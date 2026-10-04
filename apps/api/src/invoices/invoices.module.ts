import { Module, type DynamicModule } from '@nestjs/common';
import { DraftsModule } from '../drafts/drafts.module.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoicePdfsService } from './invoice-pdfs.js';
import { InvoicesService } from './invoices.js';
import { SUBMISSION_OPTIONS, SubmissionQueue, type SubmissionOptions } from './submission-queue.js';
import { SubmissionWorker } from './submission-worker.js';

/** The outbox of InvoiceRecords, the worker that sends them to the VeriFactu connector, and the PDFs it draws once they have their QR. */
@Module({})
export class SubmissionModule {
  static forRoot(options: SubmissionOptions): DynamicModule {
    return {
      module: SubmissionModule,
      global: true,
      providers: [{ provide: SUBMISSION_OPTIONS, useValue: options }, SubmissionQueue, SubmissionWorker, InvoicePdfsService],
      exports: [SubmissionQueue, InvoicePdfsService],
    };
  }
}

/** Issuance and issued invoices. */
@Module({
  imports: [DraftsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}

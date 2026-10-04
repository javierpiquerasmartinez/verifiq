import { Module } from '@nestjs/common';
import { DraftsController } from './drafts.controller.js';
import { DraftsService } from './drafts.js';

/** The issuer's Drafts: invoices in preparation, without number. */
@Module({
  controllers: [DraftsController],
  providers: [DraftsService],
  exports: [DraftsService],
})
export class DraftsModule {}

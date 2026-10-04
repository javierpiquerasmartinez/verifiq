import { Module } from '@nestjs/common';
import { RecipientsController } from './recipients.controller.js';
import { RecipientsService } from './recipients.js';

/** The issuer's Recipients, with their tax ID checked against the AEAT census. */
@Module({
  controllers: [RecipientsController],
  providers: [RecipientsService],
  exports: [RecipientsService],
})
export class RecipientsModule {}

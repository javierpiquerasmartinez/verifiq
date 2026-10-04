import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  RECIPIENT_LIST_STATUSES,
  RecipientErrorCode,
  recipientDataSchema,
  type Recipient,
} from '@verifiq/domain';
import { z } from 'zod';
import { conflict, parseBody, withHttpErrors } from '../issuers/http.js';
import { CurrentIssuer } from '../issuers/issuer-context.js';
import {
  CensusNameMismatchError,
  CensusRejectedError,
  RecipientHasInvoicesError,
  RecipientNotFoundError,
  RecipientsService,
  TaxIdInactiveError,
  TaxIdNotInCensusError,
} from './recipients.js';

const notFound = () => new NotFoundException({ code: RecipientErrorCode.NotFound, message: 'Recipient not found' });

function httpError(error: unknown): unknown {
  if (error instanceof RecipientNotFoundError) return notFound();
  if (error instanceof TaxIdNotInCensusError) {
    return new UnprocessableEntityException({
      code: RecipientErrorCode.TaxIdNotInCensus,
      message: 'The AEAT census does not have this tax ID',
    });
  }
  if (error instanceof TaxIdInactiveError) {
    return new UnprocessableEntityException({
      code: RecipientErrorCode.TaxIdInactive,
      message: 'The AEAT census has this tax ID deregistered or revoked',
    });
  }
  if (error instanceof CensusNameMismatchError) {
    return new UnprocessableEntityException({
      code: RecipientErrorCode.CensusNameMismatch,
      message: error.message,
      censusName: error.censusName ?? null,
    });
  }
  if (error instanceof CensusRejectedError) {
    return new UnprocessableEntityException({ code: RecipientErrorCode.CensusRejected, message: error.message });
  }
  if (error instanceof RecipientHasInvoicesError) {
    return conflict(RecipientErrorCode.HasInvoices, 'A recipient with issued invoices can only be archived');
  }
  return error;
}

const run = <T>(work: Promise<T>) => withHttpErrors(work, httpError);

const listQuerySchema = z.object({
  q: z.string().default(''),
  status: z.enum(RECIPIENT_LIST_STATUSES).default('active'),
});

/** Anything that is not a uuid is no recipient. */
function recipientId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw notFound();
  return id;
}

/** The issuer's Recipients ("Clientes" in the web). Reachable before the Representation is signed. */
@Controller('recipients')
export class RecipientsController {
  constructor(private readonly recipients: RecipientsService) {}

  @Get()
  list(@CurrentIssuer() issuerId: string, @Query() query: unknown): Promise<Recipient[]> {
    const { q, status } = parseBody(listQuerySchema, query);
    return this.recipients.list(issuerId, { query: q, status });
  }

  @Post()
  create(@CurrentIssuer() issuerId: string, @Body() body: unknown): Promise<Recipient> {
    return run(this.recipients.create(issuerId, parseBody(recipientDataSchema, body)));
  }

  @Get(':id')
  show(@CurrentIssuer() issuerId: string, @Param('id') id: string): Promise<Recipient> {
    return run(this.recipients.find(issuerId, recipientId(id)));
  }

  @Put(':id')
  update(@CurrentIssuer() issuerId: string, @Param('id') id: string, @Body() body: unknown): Promise<Recipient> {
    const data = parseBody(recipientDataSchema, body);
    return run(this.recipients.update(issuerId, recipientId(id), data));
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@CurrentIssuer() issuerId: string, @Param('id') id: string): Promise<void> {
    return run(this.recipients.delete(issuerId, recipientId(id)));
  }

  @Post(':id/archive')
  @HttpCode(200)
  archive(@CurrentIssuer() issuerId: string, @Param('id') id: string): Promise<Recipient> {
    return run(this.recipients.setArchived(issuerId, recipientId(id), true));
  }

  @Post(':id/restore')
  @HttpCode(200)
  restore(@CurrentIssuer() issuerId: string, @Param('id') id: string): Promise<Recipient> {
    return run(this.recipients.setArchived(issuerId, recipientId(id), false));
  }
}

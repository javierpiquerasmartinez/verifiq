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
  UnprocessableEntityException,
} from '@nestjs/common';
import { correctiveDraftDataSchema, DraftErrorCode, draftDataSchema, type Draft, type DraftSummary } from '@verifiq/domain';
import { z } from 'zod';
import { parseBody, withHttpErrors } from '../issuers/http.js';
import { CurrentIssuer } from '../issuers/issuer-context.js';
import { DraftNotFoundError, DraftRecipientNotFoundError, DraftsService } from './drafts.js';

const notFound = () => new NotFoundException({ code: DraftErrorCode.NotFound, message: 'Draft not found' });

function httpError(error: unknown): unknown {
  if (error instanceof DraftNotFoundError) return notFound();
  if (error instanceof DraftRecipientNotFoundError) {
    return new UnprocessableEntityException({
      code: DraftErrorCode.RecipientNotFound,
      message: 'The recipient does not exist',
    });
  }
  return error;
}

const run = <T>(work: Promise<T>) => withHttpErrors(work, httpError);

/** Anything that is not a uuid is no draft. */
function draftId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw notFound();
  return id;
}

/** The issuer's Drafts. Reachable before the Representation is signed. */
@Controller('drafts')
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Get()
  list(@CurrentIssuer() issuerId: string): Promise<DraftSummary[]> {
    return this.drafts.list(issuerId);
  }

  @Post()
  create(@CurrentIssuer() issuerId: string, @Body() body: unknown): Promise<Draft> {
    return run(this.drafts.create(issuerId, parseBody(draftDataSchema, body)));
  }

  @Get(':id')
  show(@CurrentIssuer() issuerId: string, @Param('id') id: string): Promise<Draft> {
    return run(this.drafts.find(issuerId, draftId(id)));
  }

  /** Only a corrective draft takes negative lines: its lines are the difference. */
  @Put(':id')
  async update(@CurrentIssuer() issuerId: string, @Param('id') id: string, @Body() body: unknown): Promise<Draft> {
    const corrective = await run(this.drafts.isCorrective(issuerId, draftId(id)));
    const data = parseBody(corrective ? correctiveDraftDataSchema : draftDataSchema, body);
    return run(this.drafts.update(issuerId, id, data));
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@CurrentIssuer() issuerId: string, @Param('id') id: string): Promise<void> {
    return run(this.drafts.delete(issuerId, draftId(id)));
  }
}

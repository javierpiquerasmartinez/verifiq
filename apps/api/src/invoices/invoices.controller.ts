import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DraftErrorCode,
  InvoiceErrorCode,
  invoiceListQuerySchema,
  invoiceResubmissionSchema,
  issueInvoiceSchema,
  type Invoice,
  type InvoiceIncident,
  type InvoiceList,
  type NextInvoiceNumber,
} from '@verifiq/domain';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentSession, type AuthSession } from '../auth/session.guard.js';
import { DraftNotFoundError } from '../drafts/drafts.js';
import { parseBody, withHttpErrors } from '../issuers/http.js';
import { CurrentIssuer } from '../issuers/issuer-context.js';
import { decodeCursor, InvoiceListService } from './invoice-list.js';
import { InvoicePdfNotAvailableError, InvoicePdfsService } from './invoice-pdfs.js';
import {
  CannotIssueError,
  DraftNotReadyError,
  InvoiceNotFoundError,
  InvoicesService,
  NotResubmittableError,
  RecipientNotReadyError,
  RetryDayOverError,
} from './invoices.js';

const notFound = () => new NotFoundException({ code: InvoiceErrorCode.NotFound, message: 'Invoice not found' });

function httpError(error: unknown): unknown {
  if (error instanceof InvoiceNotFoundError) return notFound();
  if (error instanceof InvoicePdfNotAvailableError) {
    return new NotFoundException({
      code: InvoiceErrorCode.PdfNotAvailable,
      message: 'The invoice has no PDF until its record has the QR',
    });
  }
  if (error instanceof DraftNotFoundError) {
    return new NotFoundException({ code: DraftErrorCode.NotFound, message: 'Draft not found' });
  }
  if (error instanceof CannotIssueError) {
    return new ConflictException({
      code: InvoiceErrorCode.CannotIssue,
      message: 'The issuer needs a valid Representation to issue',
    });
  }
  if (error instanceof NotResubmittableError) {
    return new ConflictException({
      code: InvoiceErrorCode.NotResubmittable,
      message: 'Only an invoice whose record is blocked, rejected or accepted with errors is sent again',
    });
  }
  if (error instanceof RetryDayOverError) {
    return new ConflictException({
      code: InvoiceErrorCode.RetryDayOver,
      message: 'A blocked record is retried on its issue date only',
    });
  }
  if (error instanceof RecipientNotReadyError) {
    return new UnprocessableEntityException({
      code: InvoiceErrorCode.RecipientNotReady,
      message: "The recipient's tax ID is not confirmed in the census",
    });
  }
  if (error instanceof DraftNotReadyError) {
    return new UnprocessableEntityException({
      code: InvoiceErrorCode.DraftNotReady,
      message: 'The draft cannot be issued yet',
      problems: error.problems,
    });
  }
  return error;
}

const run = <T>(work: Promise<T>) => withHttpErrors(work, httpError);

/** Anything that is not a uuid is no invoice. */
function invoiceId(id: string): string {
  if (!z.uuid().safeParse(id).success) throw notFound();
  return id;
}

/** The query of the list, with the cursor read: one the list did not give is a validation error. */
const listQuerySchema = invoiceListQuerySchema.transform(({ cursor, ...query }, context) => {
  const decoded = cursor === undefined ? null : decodeCursor(cursor);
  if (cursor !== undefined && decoded === null) {
    context.addIssue({ code: 'custom', path: ['cursor'], message: 'Not a cursor of this list' });
    return z.NEVER;
  }
  return { ...query, cursor: decoded };
});

/** Issued invoices, and the Issuance that makes them out of drafts. */
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly list: InvoiceListService,
    private readonly pdfs: InvoicePdfsService,
  ) {}

  /** The main screen: drafts and invoices together, newest first, searched, filtered and paged. */
  @Get()
  index(@CurrentIssuer() issuerId: string, @Query() query: unknown): Promise<InvoiceList> {
    return this.list.list(issuerId, parseBody(listQuerySchema, query));
  }

  /** The invoices whose record needs the user, shown above the list. */
  @Get('incidents')
  incidents(@CurrentIssuer() issuerId: string): Promise<InvoiceIncident[]> {
    return this.list.incidents(issuerId);
  }

  /** Issues a draft: irreversible. The draft becomes the invoice. */
  @Post()
  issue(
    @CurrentIssuer() issuerId: string,
    @CurrentSession() session: AuthSession,
    @Body() body: unknown,
  ): Promise<Invoice> {
    const { draftId } = parseBody(issueInvoiceSchema, body);
    return run(this.invoices.issue(issuerId, session.user.id, draftId));
  }

  @Get('next-number')
  async nextNumber(@CurrentIssuer() issuerId: string): Promise<NextInvoiceNumber> {
    return { number: await this.invoices.nextNumber(issuerId) };
  }

  @Get(':id')
  show(@CurrentIssuer() issuerId: string, @Param('id') id: string): Promise<Invoice> {
    return run(this.invoices.find(issuerId, invoiceId(id)));
  }

  /**
   * Corrects the copy of an invoice whose record has an incident (blocked, rejected or accepted with
   * errors) and sends its record again, with the same number.
   */
  @Post(':id/resubmission')
  resubmit(
    @CurrentIssuer() issuerId: string,
    @CurrentSession() session: AuthSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<Invoice> {
    const correction = parseBody(invoiceResubmissionSchema, body);
    return run(this.invoices.resubmit(issuerId, session.user.id, invoiceId(id), correction));
  }

  /** The stored file of the current PDF version: shown in the browser, or saved with `?download`. */
  @Get(':id/pdf')
  async pdf(
    @CurrentIssuer() issuerId: string,
    @Param('id') id: string,
    @Query('download') download: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const pdf = await run(this.pdfs.currentFile(issuerId, invoiceId(id)));
    response
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download === undefined ? 'inline' : 'attachment'}; filename="${pdf.number}.pdf"`,
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(pdf.body);
  }
}

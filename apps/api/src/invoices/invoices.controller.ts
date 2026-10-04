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
  issueInvoiceSchema,
  type Invoice,
  type NextInvoiceNumber,
} from '@verifiq/domain';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentSession, type AuthSession } from '../auth/session.guard.js';
import { DraftNotFoundError } from '../drafts/drafts.js';
import { parseBody, withHttpErrors } from '../issuers/http.js';
import { CurrentIssuer } from '../issuers/issuer-context.js';
import { InvoicePdfNotAvailableError, InvoicePdfsService } from './invoice-pdfs.js';
import { CannotIssueError, DraftNotReadyError, InvoiceNotFoundError, InvoicesService } from './invoices.js';

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

/** Issued invoices, and the Issuance that makes them out of drafts. */
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly pdfs: InvoicePdfsService,
  ) {}

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

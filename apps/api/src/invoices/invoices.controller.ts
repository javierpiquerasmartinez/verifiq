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
  invoiceVoidingSchema,
  issueInvoiceSchema,
  newCorrectiveDraftSchema,
  nextInvoiceNumberQuerySchema,
  recipientCorrectionSchema,
  type CorrectedRecipient,
  type Draft,
  type Invoice,
  type InvoiceIncident,
  type InvoiceList,
  type NextInvoiceNumber,
  type VoidedInvoice,
  withholdingCorrectionSchema,
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
  NotRectifiableError,
  NotResubmittableError,
  NotVoidableError,
  NotWithholdingCorrectableError,
  RecipientNotReadyError,
  RetryDayOverError,
} from './invoices.js';

const notFound = () => new NotFoundException({ code: InvoiceErrorCode.NotFound, message: 'Invoice not found' });

function httpError(error: unknown): unknown {
  if (error instanceof InvoiceNotFoundError) return notFound();
  if (error instanceof InvoicePdfNotAvailableError) {
    return new NotFoundException({
      code: InvoiceErrorCode.PdfNotAvailable,
      message: 'The invoice has no PDF until its record has the QR, nor that version',
    });
  }
  if (error instanceof DraftNotFoundError) {
    return new NotFoundException({ code: DraftErrorCode.NotFound, message: 'Draft not found' });
  }
  if (error instanceof CannotIssueError) {
    return new ConflictException({
      code: InvoiceErrorCode.CannotIssue,
      message: 'The issuer needs a valid Representation to issue or void',
    });
  }
  if (error instanceof NotResubmittableError) {
    return new ConflictException({
      code: InvoiceErrorCode.NotResubmittable,
      message: 'Only an invoice whose record is blocked, rejected or accepted with errors is sent again',
    });
  }
  if (error instanceof NotRectifiableError) {
    return new ConflictException({
      code: InvoiceErrorCode.NotRectifiable,
      message: 'Only an invoice the AEAT has, neither voided nor corrective, is rectified',
    });
  }
  if (error instanceof NotVoidableError) {
    return new ConflictException({
      code: InvoiceErrorCode.NotVoidable,
      message: 'Only an issued invoice, neither rectified nor corrective, without a corrective draft and with its verdict, is voided',
    });
  }
  if (error instanceof NotWithholdingCorrectableError) {
    return new ConflictException({
      code: InvoiceErrorCode.NotWithholdingCorrectable,
      message: 'Only an invoice not voided, whose latest record has its QR and without a corrective draft, has its withholding corrected',
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

/** The query of a PDF download: a version, by default the current one; saved with `download`. */
const pdfQuerySchema = z.object({
  version: z.coerce.number().int().positive().optional(),
  download: z.string().optional(),
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
  async nextNumber(@CurrentIssuer() issuerId: string, @Query() query: unknown): Promise<NextInvoiceNumber> {
    const { series } = parseBody(nextInvoiceNumberQuerySchema, query);
    return { number: await this.invoices.nextNumber(issuerId, { corrective: series === 'corrective' }) };
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

  /**
   * Rectifying (ADR 0005): a corrective draft for the invoice, by differences, in its recipient and with
   * its operation date. The user reviews it and issues it like any draft.
   */
  @Post(':id/corrective-draft')
  startCorrection(@CurrentIssuer() issuerId: string, @Param('id') id: string, @Body() body: unknown): Promise<Draft> {
    const request = parseBody(newCorrectiveDraftSchema, body);
    return run(this.invoices.startCorrection(issuerId, invoiceId(id), request));
  }

  /**
   * Voiding (ADR 0005), for an invoice that should never have existed: irreversible, its number is never
   * reused. With `reissue`, also a new draft with its content. Sends a blocked or rejected Voiding again.
   */
  @Post(':id/voiding')
  void(
    @CurrentIssuer() issuerId: string,
    @CurrentSession() session: AuthSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<VoidedInvoice> {
    const request = parseBody(invoiceVoidingSchema, body);
    return run(this.invoices.void(issuerId, session.user.id, invoiceId(id), request));
  }

  /**
   * "Corregir destinatario" (ADR 0005): voids an invoice not sent yet, or issues a total corrective
   * invoice for one already sent, and gives a new draft with its content and no recipient.
   */
  @Post(':id/recipient-correction')
  correctRecipient(
    @CurrentIssuer() issuerId: string,
    @CurrentSession() session: AuthSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<CorrectedRecipient> {
    const correction = parseBody(recipientCorrectionSchema, body);
    return run(this.invoices.correctRecipient(issuerId, session.user.id, invoiceId(id), correction));
  }

  /**
   * "Corregir retención" (ADR 0005): the right IRPF withholding, with the same number and record and
   * nothing sent to the AEAT. Its PDF gets a new version; the earlier ones stay.
   */
  @Post(':id/withholding-correction')
  correctWithholding(
    @CurrentIssuer() issuerId: string,
    @CurrentSession() session: AuthSession,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<Invoice> {
    const correction = parseBody(withholdingCorrectionSchema, body);
    return run(this.invoices.correctWithholding(issuerId, session.user.id, invoiceId(id), correction));
  }

  /**
   * The stored file of the current PDF version, or of an earlier one with `?version`: shown in the
   * browser, or saved with `?download`.
   */
  @Get(':id/pdf')
  async pdf(
    @CurrentIssuer() issuerId: string,
    @Param('id') id: string,
    @Query() query: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const { version, download } = parseBody(pdfQuerySchema, query);
    const pdf = await run(this.pdfs.file(issuerId, invoiceId(id), version));
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

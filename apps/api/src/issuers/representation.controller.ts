import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IssuerErrorCode, representationSignerSchema, type Representation } from '@verifiq/domain';
import { CurrentSession, type AuthSession } from '../auth/session.guard.js';
import { CurrentIssuer } from './issuer-context.js';
import {
  ConnectorRejectedError,
  ConnectorUnavailableError,
  RepresentationInPlaceError,
  RepresentationNotPendingError,
  RepresentationNotRequiredError,
  RepresentationService,
} from './representation.js';

const conflict = (code: IssuerErrorCode, message: string) => new ConflictException({ code, message });

function httpError(error: unknown): unknown {
  if (error instanceof RepresentationInPlaceError) {
    return conflict(IssuerErrorCode.RepresentationInPlace, 'A signing is pending or the Representation is signed');
  }
  if (error instanceof RepresentationNotRequiredError) {
    return conflict(IssuerErrorCode.RepresentationNotRequired, 'This environment needs no Representation');
  }
  if (error instanceof RepresentationNotPendingError) {
    return conflict(IssuerErrorCode.RepresentationNotPending, 'There is no pending signing');
  }
  if (error instanceof ConnectorRejectedError) {
    return conflict(IssuerErrorCode.ConnectorRejected, error.message);
  }
  if (error instanceof ConnectorUnavailableError) {
    return new ServiceUnavailableException({
      code: IssuerErrorCode.ConnectorUnavailable,
      message: 'The VeriFactu connector did not answer: try again later',
    });
  }
  return error;
}

async function run<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    throw httpError(error);
  }
}

/**
 * Onboarding step 5: the Representation the issuer signs so the connector can register its
 * invoices. Reachable once onboarding is complete; the web polls GET while a signing is pending.
 */
@Controller('issuer/representation')
export class RepresentationController {
  constructor(private readonly representation: RepresentationService) {}

  @Get()
  show(@CurrentIssuer() issuerId: string): Promise<Representation> {
    return this.representation.status(issuerId);
  }

  @Post('signing')
  @HttpCode(200)
  startSigning(
    @CurrentIssuer() issuerId: string,
    @CurrentSession() { user }: AuthSession,
    @Body() body: unknown,
  ): Promise<Representation> {
    const parsed = representationSignerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: IssuerErrorCode.ValidationFailed, issues: parsed.error.issues });
    }
    return run(this.representation.startSigning(issuerId, parsed.data, user.email));
  }

  @Post('resend')
  @HttpCode(200)
  resendLink(@CurrentIssuer() issuerId: string, @CurrentSession() { user }: AuthSession): Promise<Representation> {
    return run(this.representation.resendLink(issuerId, user.email));
  }
}

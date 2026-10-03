import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
} from '@nestjs/common';
import {
  acceptTermsSchema,
  IssuerErrorCode,
  issuerDefaultsSchema,
  fiscalDataSchema,
  LEGAL_DOCUMENTS,
  seriesSchema,
  type Onboarding,
} from '@verifiq/domain';
import type { z } from 'zod';
import { CurrentSession, type AuthSession } from '../auth/session.guard.js';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  acceptTerms,
  confirmSeries,
  findOnboarding,
  TaxIdTakenError,
  saveDefaults,
  saveFiscalData,
  SeriesAlreadyConfirmedError,
  StepPendingError,
} from './issuers.js';
import { OnboardingIssuer } from './issuer-context.js';
import { RepresentationService } from './representation.js';

function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      code: IssuerErrorCode.ValidationFailed,
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

const conflict = (code: IssuerErrorCode, message: string) => new ConflictException({ code, message });

/** Runs a step, mapping the errors of issuers.ts to HTTP. */
async function step<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    throw stepError(error);
  }
}

function stepError(error: unknown): unknown {
  if (error instanceof StepPendingError) {
    return conflict(IssuerErrorCode.OnboardingStepPending, 'Complete the previous steps first');
  }
  if (error instanceof SeriesAlreadyConfirmedError) {
    return conflict(IssuerErrorCode.SeriesAlreadyConfirmed, 'The series is confirmed and cannot change');
  }
  if (error instanceof TaxIdTakenError) {
    return conflict(IssuerErrorCode.TaxIdTaken, 'There is already an issuer with this tax ID');
  }
  return error;
}

/**
 * Issuer onboarding: a resumable wizard. Each step is saved as it is sent; GET tells where the
 * user left it. Every response is the updated state.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly representation: RepresentationService,
  ) {}

  @Get()
  show(@OnboardingIssuer() issuerId: string | null): Promise<Onboarding> {
    return findOnboarding(this.db, issuerId);
  }

  @Put('fiscal-data')
  async saveFiscalData(
    @CurrentSession() { user }: AuthSession,
    @OnboardingIssuer() issuerId: string | null,
    @Body() body: unknown,
  ): Promise<Onboarding> {
    const data = parseBody(fiscalDataSchema, body);
    const savedId = await step(saveFiscalData(this.db, { userId: user.id, issuerId }, data));
    return findOnboarding(this.db, savedId);
  }

  @Put('defaults')
  async saveDefaults(
    @OnboardingIssuer() issuerId: string | null,
    @Body() body: unknown,
  ): Promise<Onboarding> {
    const defaults = parseBody(issuerDefaultsSchema, body);
    await step(saveDefaults(this.db, issuerId, defaults));
    return findOnboarding(this.db, issuerId!);
  }

  @Post('series')
  @HttpCode(200)
  async confirmSeries(
    @OnboardingIssuer() issuerId: string | null,
    @Body() body: unknown,
  ): Promise<Onboarding> {
    const series = parseBody(seriesSchema, body);
    await step(confirmSeries(this.db, issuerId, series));
    return findOnboarding(this.db, issuerId!);
  }

  @Post('terms')
  @HttpCode(200)
  async acceptTerms(
    @CurrentSession() { user }: AuthSession,
    @OnboardingIssuer() issuerId: string | null,
    @Body() body: unknown,
  ): Promise<Onboarding> {
    const accepted = parseBody(acceptTermsSchema, body);
    if (
      accepted.termsOfUseVersion !== LEGAL_DOCUMENTS.termsOfUse.version ||
      accepted.dataProcessingAgreementVersion !== LEGAL_DOCUMENTS.dataProcessingAgreement.version
    ) {
      throw conflict(IssuerErrorCode.LegalVersionOutdated, 'The legal documents have changed: read them again');
    }
    await step(acceptTerms(this.db, { userId: user.id, issuerId }));
    // Step 5 starts here. If the connector does not answer, GET /issuer/representation retries.
    await this.representation.ensureIssuerKey(issuerId!);
    return findOnboarding(this.db, issuerId!);
  }
}

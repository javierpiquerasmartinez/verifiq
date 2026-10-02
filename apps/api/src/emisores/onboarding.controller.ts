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
  EmisorErrorCode,
  emisorDefaultsSchema,
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
  NifTakenError,
  saveDefaults,
  saveFiscalData,
  SerieAlreadyConfirmedError,
  StepPendingError,
} from './emisores.js';
import { OnboardingEmisor } from './tenancy.js';

function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      code: EmisorErrorCode.ValidationFailed,
      issues: parsed.error.issues,
    });
  }
  return parsed.data;
}

const conflict = (code: EmisorErrorCode, message: string) => new ConflictException({ code, message });

/** Runs a step, mapping the errors of emisores.ts to HTTP. */
async function step<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    throw stepError(error);
  }
}

function stepError(error: unknown): unknown {
  if (error instanceof StepPendingError) {
    return conflict(EmisorErrorCode.OnboardingStepPending, 'Complete the previous steps first');
  }
  if (error instanceof SerieAlreadyConfirmedError) {
    return conflict(EmisorErrorCode.SerieAlreadyConfirmed, 'The Serie is confirmed and cannot change');
  }
  if (error instanceof NifTakenError) {
    return conflict(EmisorErrorCode.NifTaken, 'There is already an Emisor with this NIF');
  }
  return error;
}

/**
 * Alta del Emisor: a resumable wizard. Each step is saved as it is sent; GET tells where the
 * Usuario left it. Every response is the updated state.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  show(@OnboardingEmisor() emisorId: string | null): Promise<Onboarding> {
    return findOnboarding(this.db, emisorId);
  }

  @Put('fiscal-data')
  async saveFiscalData(
    @CurrentSession() { user }: AuthSession,
    @OnboardingEmisor() emisorId: string | null,
    @Body() body: unknown,
  ): Promise<Onboarding> {
    const data = parseBody(fiscalDataSchema, body);
    const savedId = await step(saveFiscalData(this.db, { userId: user.id, emisorId }, data));
    return findOnboarding(this.db, savedId);
  }

  @Put('defaults')
  async saveDefaults(
    @OnboardingEmisor() emisorId: string | null,
    @Body() body: unknown,
  ): Promise<Onboarding> {
    const defaults = parseBody(emisorDefaultsSchema, body);
    await step(saveDefaults(this.db, emisorId, defaults));
    return findOnboarding(this.db, emisorId!);
  }

  @Post('serie')
  @HttpCode(200)
  async confirmSeries(
    @OnboardingEmisor() emisorId: string | null,
    @Body() body: unknown,
  ): Promise<Onboarding> {
    const series = parseBody(seriesSchema, body);
    await step(confirmSeries(this.db, emisorId, series));
    return findOnboarding(this.db, emisorId!);
  }

  @Post('terms')
  @HttpCode(200)
  async acceptTerms(
    @CurrentSession() { user }: AuthSession,
    @OnboardingEmisor() emisorId: string | null,
    @Body() body: unknown,
  ): Promise<Onboarding> {
    const accepted = parseBody(acceptTermsSchema, body);
    if (
      accepted.terminosVersion !== LEGAL_DOCUMENTS.terminos.version ||
      accepted.contratoEncargoVersion !== LEGAL_DOCUMENTS.contratoEncargo.version
    ) {
      throw conflict(EmisorErrorCode.LegalVersionOutdated, 'The legal documents have changed: read them again');
    }
    await step(acceptTerms(this.db, { userId: user.id, emisorId }));
    return findOnboarding(this.db, emisorId!);
  }
}

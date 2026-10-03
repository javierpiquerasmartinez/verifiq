import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Put,
  Res,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { IssuerErrorCode, type IssuerSummary } from '@verifiq/domain';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { DATABASE, type Database } from '../database/database.module.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { findLogoKey, findSummary, replaceLogoKey } from './issuers.js';
import { CurrentIssuer, OnboardingIssuer } from './issuer-context.js';
import { RepresentationService } from './representation.js';

/** The content type comes from the file's signature, never from what the client claims. */
function logoContentType(body: unknown): string | null {
  if (!Buffer.isBuffer(body)) return null;
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  return null;
}

function requireIssuer(issuerId: string | null): string {
  if (!issuerId) {
    throw new ConflictException({
      code: IssuerErrorCode.OnboardingStepPending,
      message: 'Save the fiscal data first',
    });
  }
  return issuerId;
}

const logoNotFound = () =>
  new NotFoundException({ code: IssuerErrorCode.LogoNotFound, message: 'There is no logo' });

/** The issuer of the session. The logo can be set from onboarding step 1 on. */
@Controller('issuer')
export class IssuerController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly representation: RepresentationService,
  ) {}

  @Get()
  async show(@CurrentIssuer() issuerId: string): Promise<IssuerSummary> {
    const [summary, canIssue] = await Promise.all([
      findSummary(this.db, issuerId),
      this.representation.canIssue(issuerId),
    ]);
    return { ...summary, canIssue };
  }

  /** Raw PNG or JPEG body (see configureHttp), up to LOGO_MAX_BYTES. */
  @Put('logo')
  async uploadLogo(
    @OnboardingIssuer() issuerId: string | null,
    @Body() body: unknown,
  ): Promise<{ hasLogo: true }> {
    const id = requireIssuer(issuerId);
    const contentType = logoContentType(body);
    if (!contentType) {
      throw new UnsupportedMediaTypeException({
        code: IssuerErrorCode.LogoInvalid,
        message: 'The logo must be a PNG or JPEG image',
      });
    }
    const key = `issuers/${id}/logo/${randomUUID()}`;
    await this.storage.put(key, { body: body as Buffer, contentType });
    const previous = await replaceLogoKey(this.db, id, key);
    if (previous) await this.storage.delete(previous);
    return { hasLogo: true };
  }

  @Get('logo')
  async logo(
    @OnboardingIssuer() issuerId: string | null,
    @Res() response: Response,
  ): Promise<void> {
    const key = await findLogoKey(this.db, requireIssuer(issuerId));
    const logo = key ? await this.storage.get(key) : null;
    if (!logo) throw logoNotFound();
    response
      .set({
        'Content-Type': logo.contentType,
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(logo.body);
  }

  @Delete('logo')
  async removeLogo(@OnboardingIssuer() issuerId: string | null): Promise<{ hasLogo: false }> {
    const previous = await replaceLogoKey(this.db, requireIssuer(issuerId), null);
    if (previous) await this.storage.delete(previous);
    return { hasLogo: false };
  }
}

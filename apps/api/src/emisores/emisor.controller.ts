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
import { EmisorErrorCode, type EmisorSummary } from '@verifiq/domain';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { DATABASE, type Database } from '../database/database.module.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/object-storage.js';
import { findLogoKey, findSummary, replaceLogoKey } from './emisores.js';
import { CurrentEmisor, OnboardingEmisor } from './tenancy.js';

/** The content type comes from the file's signature, never from what the client claims. */
function logoContentType(body: unknown): string | null {
  if (!Buffer.isBuffer(body)) return null;
  if (body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (body.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  return null;
}

function requireEmisor(emisorId: string | null): string {
  if (!emisorId) {
    throw new ConflictException({
      code: EmisorErrorCode.OnboardingStepPending,
      message: 'Save the fiscal data first',
    });
  }
  return emisorId;
}

const logoNotFound = () =>
  new NotFoundException({ code: EmisorErrorCode.LogoNotFound, message: 'There is no logo' });

/** The Emisor of the session. The logo can be set from step 1 of the alta on. */
@Controller('emisor')
export class EmisorController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  @Get()
  show(@CurrentEmisor() emisorId: string): Promise<EmisorSummary> {
    return findSummary(this.db, emisorId);
  }

  /** Raw PNG or JPEG body (see configureHttp), up to LOGO_MAX_BYTES. */
  @Put('logo')
  async uploadLogo(
    @OnboardingEmisor() emisorId: string | null,
    @Body() body: unknown,
  ): Promise<{ hasLogo: true }> {
    const id = requireEmisor(emisorId);
    const contentType = logoContentType(body);
    if (!contentType) {
      throw new UnsupportedMediaTypeException({
        code: EmisorErrorCode.LogoInvalid,
        message: 'The logo must be a PNG or JPEG image',
      });
    }
    const key = `emisores/${id}/logo/${randomUUID()}`;
    await this.storage.put(key, { body: body as Buffer, contentType });
    const previous = await replaceLogoKey(this.db, id, key);
    if (previous) await this.storage.delete(previous);
    return { hasLogo: true };
  }

  @Get('logo')
  async logo(
    @OnboardingEmisor() emisorId: string | null,
    @Res() response: Response,
  ): Promise<void> {
    const key = await findLogoKey(this.db, requireEmisor(emisorId));
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
  async removeLogo(@OnboardingEmisor() emisorId: string | null): Promise<{ hasLogo: false }> {
    const previous = await replaceLogoKey(this.db, requireEmisor(emisorId), null);
    if (previous) await this.storage.delete(previous);
    return { hasLogo: false };
  }
}

import { Controller, Get, Inject, Req } from '@nestjs/common';
import type { HealthResponse } from '@verifiq/domain';
import { sql } from 'drizzle-orm';
import type { Request } from 'express';
import { Public } from '../auth/session.guard.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { APP_VERSION } from '../version.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_VERSION) private readonly version: string,
  ) {}

  /** Fails with 500 when the database is unreachable, so it doubles as Render's health check. */
  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    await this.db.execute(sql`select 1`);
    return { status: 'ok', version: this.version, database: 'up' };
  }

  /**
   * TEMPORARY (issue 22): the headers that may carry the client IP, as they reach the API behind its
   * host, to decide which one to trust. Remove once decided.
   */
  @Public()
  @Get('ip-headers')
  ipHeaders(@Req() request: Request): Record<string, unknown> {
    const names = ['x-forwarded-for', 'x-real-ip', 'true-client-ip', 'cf-connecting-ip', 'forwarded', 'x-forwarded-proto', 'x-forwarded-host', 'via', 'cf-ray', 'rndr-id'];
    return {
      socket: request.socket.remoteAddress,
      headers: Object.fromEntries(names.map((name) => [name, request.headers[name] ?? null])),
    };
  }
}

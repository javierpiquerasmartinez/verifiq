import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@verifiq/domain';
import { sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { APP_VERSION } from '../version.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(APP_VERSION) private readonly version: string,
  ) {}

  /** Fails with 500 when the database is unreachable, so it doubles as Render's health check. */
  @Get()
  async check(): Promise<HealthResponse> {
    await this.db.execute(sql`select 1`);
    return { status: 'ok', version: this.version, database: 'up' };
  }
}

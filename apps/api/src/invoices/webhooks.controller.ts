import { Controller, HttpCode, Post, Req, UnauthorizedException, type RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/session.guard.js';
import { RecordVerdicts } from './record-verdicts.js';

/**
 * The connector's results webhook: public, trusted only through its HMAC-SHA256 signature. It must
 * answer within 10 s; a 4xx is final for the connector, so only a bad signature gets one.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly verdicts: RecordVerdicts) {}

  @Public()
  @Post('verifactu')
  @HttpCode(204)
  async results(@Req() request: RawBodyRequest<Request>): Promise<void> {
    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([name, value]) => [name, Array.isArray(value) ? value[0] : value]),
    );
    const received = await this.verdicts.receive({ headers, body: request.rawBody ?? Buffer.alloc(0) });
    if (!received) throw new UnauthorizedException({ message: 'Invalid webhook signature' });
  }
}

import {
  Controller,
  HttpCode,
  PayloadTooLargeException,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../auth/session.guard.js';
import { RecordVerdicts } from './record-verdicts.js';

// What the JSON parser accepts, by default.
const MAX_BODY_BYTES = 100 * 1024;

/** The body as it arrived: kept by the JSON parser, or read here when no parser took it (another content type). */
async function rawBodyOf(request: RawBodyRequest<Request>): Promise<Buffer> {
  if (request.rawBody) return request.rawBody;
  if (!request.readable) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk as Buffer));
    size += chunks.at(-1)!.length;
    if (size > MAX_BODY_BYTES) throw new PayloadTooLargeException();
  }
  return Buffer.concat(chunks);
}

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
    const received = await this.verdicts.receive({ headers, body: await rawBodyOf(request) });
    if (!received) throw new UnauthorizedException({ message: 'Invalid webhook signature' });
  }
}

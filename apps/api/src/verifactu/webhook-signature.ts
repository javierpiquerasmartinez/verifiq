import { createHmac, timingSafeEqual } from 'node:crypto';

/** HMAC-SHA256 of the raw body, in hex: how the connector signs each webhook delivery. */
export function signWebhookBody(secret: string, body: Buffer | string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Whether `signature` is the body's, compared in constant time. */
export function isWebhookSignatureValid(secret: string, body: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signWebhookBody(secret, body), 'hex');
  const given = Buffer.from(signature.trim().toLowerCase(), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

import { createHmac } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  let bits = '';
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => parseInt(byte, 2)));
}

/** RFC 6238 code (SHA-1, 6 digits, 30 s), as an authenticator app would show it. */
export function totpCode(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, '0');
}

/** The secret inside an otpauth:// URI. */
export function secretFromUri(uri: string): string {
  const secret = new URL(uri).searchParams.get('secret');
  if (!secret) throw new Error(`No secret in ${uri}`);
  return secret;
}

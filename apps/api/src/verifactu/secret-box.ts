import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * AES-256-GCM for secrets stored in the database (the issuers' connector API keys).
 * The master key lives only in the environment. The context (e.g. the issuer id) is bound as
 * associated data, so a sealed secret copied to another row does not open.
 */
export class SecretBox {
  private readonly key: Buffer;

  /** `masterKey`: 32 random bytes in base64 (`openssl rand -base64 32`). */
  constructor(masterKey: string) {
    this.key = Buffer.from(masterKey, 'base64');
    if (this.key.length !== 32) throw new Error('The master key must be 32 bytes in base64');
  }

  /** Returns `v1:<iv>:<ciphertext + tag>`, both in base64. */
  seal(plaintext: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    return `${VERSION}:${iv.toString('base64')}:${data.toString('base64')}`;
  }

  /** Throws if the secret was tampered with, or sealed with another key or context. */
  open(sealed: string, context: string): string {
    const [version, iv, data] = sealed.split(':');
    if (version !== VERSION || !iv || !data) throw new Error('Unknown sealed secret format');
    const bytes = Buffer.from(data, 'base64');
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64'), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
    return Buffer.concat([decipher.update(bytes.subarray(0, bytes.length - TAG_BYTES)), decipher.final()]).toString(
      'utf8',
    );
  }
}

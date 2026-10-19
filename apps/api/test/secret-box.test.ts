import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SecretBox } from '../src/verifactu/secret-box.js';

const masterKey = () => randomBytes(32).toString('base64');

describe('SecretBox', () => {
  it('opens what it sealed', () => {
    const box = new SecretBox(masterKey());
    const sealed = box.seal('vf_test_abc123', 'issuer-1');
    expect(sealed).not.toContain('vf_test_abc123');
    expect(box.open(sealed, 'issuer-1')).toBe('vf_test_abc123');
  });

  it('seals the same secret differently each time', () => {
    const box = new SecretBox(masterKey());
    expect(box.seal('vf_test_abc123', 'issuer-1')).not.toBe(box.seal('vf_test_abc123', 'issuer-1'));
  });

  it('refuses a secret sealed for another context', () => {
    const box = new SecretBox(masterKey());
    const sealed = box.seal('vf_test_abc123', 'issuer-1');
    expect(() => box.open(sealed, 'issuer-2')).toThrow();
  });

  it('refuses a tampered secret', () => {
    const box = new SecretBox(masterKey());
    const [version, iv, data] = box.seal('vf_test_abc123', 'issuer-1').split(':');
    const bytes = Buffer.from(data!, 'base64');
    bytes[0]! ^= 1;
    expect(() => box.open(`${version}:${iv}:${bytes.toString('base64')}`, 'issuer-1')).toThrow();
  });

  it('refuses a secret sealed with another master key', () => {
    const sealed = new SecretBox(masterKey()).seal('vf_test_abc123', 'issuer-1');
    expect(() => new SecretBox(masterKey()).open(sealed, 'issuer-1')).toThrow();
  });

  it('requires a 256-bit master key', () => {
    expect(() => new SecretBox(randomBytes(16).toString('base64'))).toThrow();
  });
});

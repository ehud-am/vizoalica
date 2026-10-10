import { describe, expect, it } from 'vitest';
import { generateAccessKey, parseAccessKey, verifySecret } from '../src/auth/access-keys.js';

describe('generateAccessKey', () => {
  it('produces the vzk_<id>_<secret> format', async () => {
    const { key, id, secretHash } = await generateAccessKey();
    expect(key).toMatch(/^vzk_[a-z0-9]{12}_[A-Za-z0-9_-]{43}$/);
    expect(key).toContain(id);
    expect(secretHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never repeats an id or a secret across many keys', async () => {
    const keys = await Promise.all(Array.from({ length: 200 }, () => generateAccessKey()));
    expect(new Set(keys.map((item) => item.id)).size).toBe(200);
    expect(new Set(keys.map((item) => item.key)).size).toBe(200);
  });

  it('carries 256 bits of secret entropy (32 raw bytes once decoded)', async () => {
    const { key } = await generateAccessKey();
    const secret = parseAccessKey(key)!.secret;
    const padded = secret
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(secret.length / 4) * 4, '=');
    expect(Buffer.from(padded, 'base64')).toHaveLength(32);
  });
});

describe('parseAccessKey', () => {
  it('splits a well-formed key', async () => {
    const { key, id } = await generateAccessKey();
    const parsed = parseAccessKey(key);
    expect(parsed?.id).toBe(id);
    expect(`vzk_${parsed?.id}_${parsed?.secret}`).toBe(key);
  });

  it('rejects anything else', async () => {
    const { key } = await generateAccessKey();
    for (const bad of [
      'not-a-key',
      key.slice(0, -1),
      `${key}x`,
      key.replace('vzk_', 'vzz_'),
      key.toUpperCase(),
      '',
      `vzk_${'a'.repeat(11)}_${'b'.repeat(43)}`, // id too short
      `vzk_${'a'.repeat(13)}_${'b'.repeat(43)}` // id too long
    ])
      expect(parseAccessKey(bad), bad).toBeUndefined();
  });
});

describe('verifySecret', () => {
  it('accepts only the exact secret that produced the hash', async () => {
    const { key, secretHash } = await generateAccessKey();
    const { secret } = parseAccessKey(key)!;
    expect(await verifySecret(secret, secretHash)).toBe(true);
    expect(await verifySecret(`${secret.slice(0, -1)}x`, secretHash)).toBe(false);
    expect(await verifySecret(secret.slice(0, -4), secretHash)).toBe(false);
    expect(await verifySecret(`${secret}extra`, secretHash)).toBe(false);
    const other = await generateAccessKey();
    expect(await verifySecret(secret, other.secretHash)).toBe(false);
  });
});

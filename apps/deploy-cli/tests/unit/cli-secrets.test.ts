import { describe, expect, it } from 'vitest';
import {
  SECRETS,
  formatSecretBlock,
  generateSecret,
  generateSecrets,
  isValidSecret,
  parseSecretKind
} from '../../../../scripts/cli/secrets.js';

describe('generated secrets', () => {
  it('are 256 random bits as 43 base64url characters and never repeat', () => {
    const values = new Set(Array.from({ length: 50 }, generateSecret));
    expect(values.size).toBe(50);
    for (const value of values) expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('are generated per requested kind with the exact Worker names', () => {
    expect(Object.keys(generateSecrets()).sort()).toEqual([
      'VIZOALICA_ADMIN_SECRET',
      'VIZOALICA_ANALYTICS_DIGEST_SECRET',
      'VIZOALICA_TOKEN_SECRET'
    ]);
    expect(Object.keys(generateSecrets(['admin']))).toEqual(['VIZOALICA_ADMIN_SECRET']);
  });

  it('accepts only what the Worker and token endpoint accept', () => {
    expect(isValidSecret(generateSecret())).toBe(true);
    for (const bad of [
      'short',
      'x'.repeat(31),
      `${'x'.repeat(32)} `,
      'é'.repeat(40),
      'x'.repeat(257)
    ])
      expect(isValidSecret(bad)).toBe(false);
  });

  it('parses rotate arguments', () => {
    expect(parseSecretKind('admin')).toBe('admin');
    expect(parseSecretKind('all')).toBe('all');
    expect(parseSecretKind('nope')).toBeUndefined();
    expect(parseSecretKind(undefined)).toBeUndefined();
  });

  it('are shown once in a labelled block that says what each is for', () => {
    const secrets = generateSecrets();
    const block = formatSecretBlock(secrets);
    for (const kind of Object.values(SECRETS)) {
      expect(block).toContain(kind.name);
      expect(block).toContain(secrets[kind.name]!);
      expect(block).toContain(kind.purpose);
    }
    expect(block).toMatch(/does not store them/i);
    // A partial set (a single rotated secret) shows only that one.
    expect(formatSecretBlock(generateSecrets(['token']))).not.toContain('VIZOALICA_ADMIN_SECRET');
  });
});

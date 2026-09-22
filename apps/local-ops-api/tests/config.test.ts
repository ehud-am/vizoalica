import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ensureCredential, loadConfig, resolvePreferencesPath } from '../src/config.js';

const validEnv = {
  VIZOALICA_REMOTE_URL: 'https://worker.test',
  VIZOALICA_ADMIN_SECRET: 'secret'
};

describe('loadConfig', () => {
  it('rejects a non-HTTPS remote URL that is not localhost', () => {
    expect(() => loadConfig({ ...validEnv, VIZOALICA_REMOTE_URL: 'http://worker.test' })).toThrow(
      'remote_url_must_use_https'
    );
  });

  it('accepts an http localhost remote URL', () => {
    expect(
      loadConfig({ ...validEnv, VIZOALICA_REMOTE_URL: 'http://localhost:8787' }).remoteUrl
    ).toBe('http://localhost:8787');
  });

  it('defaults the session lifetime to 30 minutes and accepts a whole number of milliseconds in bounds', () => {
    expect(loadConfig(validEnv).sessionTtlMs).toBe(30 * 60_000);
    expect(loadConfig({ ...validEnv, VIZOALICA_SESSION_TTL_MS: '' }).sessionTtlMs).toBe(
      30 * 60_000
    );
    for (const value of ['60000', '1800000', '86400000'])
      expect(loadConfig({ ...validEnv, VIZOALICA_SESSION_TTL_MS: value }).sessionTtlMs).toBe(
        Number(value)
      );
  });

  it.each(['abc', 'NaN', '-1', '0', '59999', '86400001', '1.5', '1e3x', 'Infinity'])(
    'rejects the session lifetime %s, so a session can never fail to expire',
    (value) => {
      expect(() => loadConfig({ ...validEnv, VIZOALICA_SESSION_TTL_MS: value })).toThrow(
        'invalid_session_ttl'
      );
    }
  );

  it('rejects a console origin that is not loopback', () => {
    expect(() =>
      loadConfig({ ...validEnv, VIZOALICA_CONSOLE_ORIGIN: 'https://evil.test' })
    ).toThrow('console_origin_must_be_loopback');
  });
});

describe('ensureCredential', () => {
  it('returns the config unchanged when a credential is present', () => {
    const config = loadConfig(validEnv);
    expect(ensureCredential(config)).toBe(config);
  });

  it('throws when the credential has been revoked (blanked)', () => {
    const config = { ...loadConfig(validEnv), adminSecret: '  ' };
    expect(() => ensureCredential(config)).toThrow('access_revoked');
  });
});

describe('resolvePreferencesPath', () => {
  it('places preferences.json in the configured environments home directory', () => {
    expect(resolvePreferencesPath({ homeDir: '/home/op/.config/vizoalica' })).toBe(
      join('/home/op/.config/vizoalica', 'preferences.json')
    );
  });

  it('falls back to the default ~/.config/vizoalica directory when no home directory is set', () => {
    expect(resolvePreferencesPath({})).toContain(join('.config', 'vizoalica', 'preferences.json'));
  });
});

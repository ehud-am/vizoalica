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
  it('places preferences.json beside the configured local-operations file', () => {
    const config = {
      ...loadConfig(validEnv),
      configFilePath: '/home/op/.config/vizoalica/local-operations.json'
    };
    expect(resolvePreferencesPath(config)).toBe(
      join('/home/op/.config/vizoalica', 'preferences.json')
    );
  });

  it('falls back to the default ~/.config/vizoalica directory when no config file path is set', () => {
    const config = loadConfig(validEnv);
    expect(resolvePreferencesPath(config)).toContain(
      join('.config', 'vizoalica', 'preferences.json')
    );
  });
});

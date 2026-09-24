import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSettings, resolvePreferencesPath } from '../src/config.js';

describe('loadSettings', () => {
  it('defaults the port, the console origin, and the session lifetime', () => {
    const settings = loadSettings({});
    expect(settings.port).toBe(4318);
    expect(settings.consoleOrigin).toBe('http://127.0.0.1:5173');
    expect(settings.sessionTtlMs).toBe(30 * 60_000);
    expect(settings.allowedOrigins).toEqual(['http://127.0.0.1:4318', 'http://127.0.0.1:5173']);
  });

  it('accepts a session lifetime in bounds, and an empty value means the default', () => {
    expect(loadSettings({ VIZOALICA_SESSION_TTL_MS: '' }).sessionTtlMs).toBe(30 * 60_000);
    for (const value of ['60000', '1800000', '86400000'])
      expect(loadSettings({ VIZOALICA_SESSION_TTL_MS: value }).sessionTtlMs).toBe(Number(value));
  });

  it.each(['abc', 'NaN', '-1', '0', '59999', '86400001', '1.5', '1e3x', 'Infinity'])(
    'rejects the session lifetime %s, so a session can never fail to expire',
    (value) => {
      expect(() => loadSettings({ VIZOALICA_SESSION_TTL_MS: value })).toThrow(
        'invalid_session_ttl'
      );
    }
  );

  it.each(['80', '70000', 'abc', '1.5'])('rejects the port %s', (value) => {
    expect(() => loadSettings({ VIZOALICA_PORT: value })).toThrow('invalid_port');
  });

  it('rejects a console origin that is not loopback', () => {
    expect(() => loadSettings({ VIZOALICA_CONSOLE_ORIGIN: 'https://evil.test' })).toThrow(
      'console_origin_must_be_loopback'
    );
  });
});

describe('resolvePreferencesPath', () => {
  it('places preferences.json in the configured home directory', () => {
    expect(resolvePreferencesPath({ homeDir: '/home/op/.config/vizoalica' })).toBe(
      join('/home/op/.config/vizoalica', 'preferences.json')
    );
  });

  it('falls back to the default ~/.config/vizoalica directory when no home directory is set', () => {
    expect(resolvePreferencesPath({})).toContain(join('.config', 'vizoalica', 'preferences.json'));
  });
});

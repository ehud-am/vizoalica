import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConnectionStore, normalizeRemoteUrl } from '../src/connection-store.js';

const dir = () => mkdtempSync(join(tmpdir(), 'vizoalica-store-'));
const write = (path: string, values: Record<string, string>, mode = 0o600) => {
  writeFileSync(path, JSON.stringify(values), { mode });
  chmodSync(path, mode);
};

describe('ConnectionStore', () => {
  it('is empty when there is no file', () => {
    const store = ConnectionStore.fromFile(join(dir(), 'missing.json'));
    expect(store.current()).toBeUndefined();
    expect(store.revoked).toBe(false);
  });

  it('loads an administrator secret file written by the checkout commands', () => {
    const path = join(dir(), 'local-operations.json');
    write(path, {
      VIZOALICA_REMOTE_URL: 'https://w.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: 's3'
    });
    expect(ConnectionStore.fromFile(path).current()).toEqual({
      remoteUrl: 'https://w.example.workers.dev',
      credential: 's3',
      kind: 'admin-secret'
    });
  });

  it('loads an access key and a role hint', () => {
    const path = join(dir(), 'c.json');
    write(path, {
      VIZOALICA_REMOTE_URL: 'https://w.example.workers.dev',
      VIZOALICA_READ_KEY: 'vzk_abc',
      VIZOALICA_ROLE_HINT: 'analyst'
    });
    expect(ConnectionStore.fromFile(path).current()).toMatchObject({
      kind: 'access-key',
      credential: 'vzk_abc',
      roleHint: 'analyst'
    });
  });

  it('rejects a file with both credentials, or neither', () => {
    const both = join(dir(), 'both.json');
    write(both, {
      VIZOALICA_REMOTE_URL: 'https://w.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: 'a',
      VIZOALICA_READ_KEY: 'b'
    });
    expect(() => ConnectionStore.fromFile(both)).toThrow('invalid_connection_file');
    const neither = join(dir(), 'neither.json');
    write(neither, { VIZOALICA_REMOTE_URL: 'https://w.example.workers.dev' });
    expect(() => ConnectionStore.fromFile(neither)).toThrow('invalid_connection_file');
  });

  it('rejects a role hint it does not know and unreadable JSON', () => {
    const path = join(dir(), 'c.json');
    write(path, {
      VIZOALICA_REMOTE_URL: 'https://w.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: 'a',
      VIZOALICA_ROLE_HINT: 'root'
    });
    expect(() => ConnectionStore.fromFile(path)).toThrow('invalid_connection_file');
    writeFileSync(path, '{nope', { mode: 0o600 });
    expect(() => ConnectionStore.fromFile(path)).toThrow('invalid_connection_file');
  });

  it('rejects a file others can read', () => {
    const path = join(dir(), 'c.json');
    write(
      path,
      { VIZOALICA_REMOTE_URL: 'https://w.example.workers.dev', VIZOALICA_ADMIN_SECRET: 'a' },
      0o644
    );
    expect(() => ConnectionStore.fromFile(path)).toThrow('config_permissions_must_be_0600');
  });

  it('accepts the OneCLI placeholder only under the wrapper', () => {
    const path = join(dir(), 'c.json');
    write(path, {
      VIZOALICA_REMOTE_URL: 'https://w.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: 'onecli-managed'
    });
    expect(() => ConnectionStore.fromFile(path, {})).toThrow('onecli_placeholder_requires_wrapper');
    const store = ConnectionStore.fromFile(path, { VIZOALICA_ONECLI_WRAPPED: '1' });
    expect(store.current()?.credential).toBe('onecli-managed');
    expect(store.mode()).toBe('onecli');
  });

  it('reports file mode for a real secret', () => {
    const path = join(dir(), 'c.json');
    write(path, {
      VIZOALICA_REMOTE_URL: 'https://w.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: 'a'
    });
    expect(ConnectionStore.fromFile(path).mode()).toBe('file');
    expect(ConnectionStore.fromFile(join(dir(), 'none.json')).mode()).toBeUndefined();
  });

  it('saves atomically with user-only permissions and switches the current connection', () => {
    const path = join(dir(), 'nested', 'c.json');
    const store = ConnectionStore.fromFile(path);
    const before = store.revision;
    store.save({ remoteUrl: 'https://w.example.workers.dev', credential: 'k', kind: 'access-key' });
    expect(store.revision).toBeGreaterThan(before);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      VIZOALICA_REMOTE_URL: 'https://w.example.workers.dev',
      VIZOALICA_READ_KEY: 'k'
    });
    expect(ConnectionStore.fromFile(path).current()?.credential).toBe('k');
  });

  it('writes the role hint next to the credential', () => {
    const path = join(dir(), 'c.json');
    const store = ConnectionStore.fromFile(path);
    store.save({
      remoteUrl: 'https://w.example.workers.dev',
      credential: 'a',
      kind: 'admin-secret',
      roleHint: 'admin'
    });
    expect(JSON.parse(readFileSync(path, 'utf8')).VIZOALICA_ROLE_HINT).toBe('admin');
    store.setRoleHint('website-owner');
    expect(ConnectionStore.fromFile(path).current()?.roleHint).toBe('website-owner');
  });

  it('keeps only a hint when there is no connection to hint about', () => {
    const store = ConnectionStore.fromFile(join(dir(), 'c.json'));
    store.setRoleHint('analyst');
    expect(store.current()).toBeUndefined();
    expect(store.hint()).toBe('analyst');
  });

  it('never leaves a partial file when saves race', async () => {
    const path = join(dir(), 'c.json');
    const store = ConnectionStore.fromFile(path);
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        Promise.resolve().then(() =>
          store.save({
            remoteUrl: 'https://w.example.workers.dev',
            credential: `secret-${index}`,
            kind: 'admin-secret'
          })
        )
      )
    );
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
    expect(parsed.VIZOALICA_ADMIN_SECRET).toMatch(/^secret-\d+$/);
    expect(ConnectionStore.fromFile(path).current()).toBeDefined();
  });

  it('disconnects by writing the revoked marker the checkout commands already use', () => {
    const path = join(dir(), 'c.json');
    const store = ConnectionStore.fromFile(path);
    store.save({
      remoteUrl: 'https://w.example.workers.dev',
      credential: 'a',
      kind: 'admin-secret'
    });
    store.disconnect();
    expect(store.current()).toBeUndefined();
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      VIZOALICA_REMOTE_URL: 'https://revoked.invalid',
      VIZOALICA_ADMIN_SECRET: ''
    });
    const reloaded = ConnectionStore.fromFile(path);
    expect(reloaded.current()).toBeUndefined();
    expect(reloaded.revoked).toBe(true);
  });

  it('works in memory without a file', () => {
    const store = ConnectionStore.fromConnection({
      remoteUrl: 'https://w.example.workers.dev',
      credential: 'a',
      kind: 'admin-secret'
    });
    expect(store.current()?.credential).toBe('a');
    store.save({
      remoteUrl: 'https://x.example.workers.dev',
      credential: 'b',
      kind: 'admin-secret'
    });
    expect(store.current()?.remoteUrl).toBe('https://x.example.workers.dev');
    store.disconnect();
    expect(store.current()).toBeUndefined();
  });
});

describe('normalizeRemoteUrl', () => {
  it('keeps only the https origin', () => {
    expect(normalizeRemoteUrl('https://w.example.workers.dev/some/path?x=1#y')).toBe(
      'https://w.example.workers.dev'
    );
  });
  it('allows loopback http for development', () => {
    expect(normalizeRemoteUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
    expect(normalizeRemoteUrl('http://localhost:8787/')).toBe('http://localhost:8787');
  });
  it('refuses other http hosts, other schemes, credentials, and garbage', () => {
    for (const value of [
      'http://example.com',
      'ftp://example.com',
      'https://user:pw@example.com',
      'not a url',
      ''
    ])
      expect(() => normalizeRemoteUrl(value)).toThrow('invalid_request');
  });
});

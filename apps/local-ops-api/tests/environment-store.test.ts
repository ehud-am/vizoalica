import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EnvironmentStore, normalizeRemoteUrl } from '../src/environment-store.js';

const dir = () => mkdtempSync(join(tmpdir(), 'vizoalica-envs-'));
const envPath = (base: string, name: string) => join(base, 'environments', `${name}.json`);
const writeEnv = (base: string, name: string, values: Record<string, string>, mode = 0o600) => {
  mkdirSync(join(base, 'environments'), { recursive: true });
  const path = envPath(base, name);
  writeFileSync(path, JSON.stringify(values), { mode });
  chmodSync(path, mode);
};

describe('EnvironmentStore', () => {
  it('is empty when there is no environments directory yet', () => {
    const store = EnvironmentStore.fromDirectory(dir());
    expect(store.list()).toEqual([]);
    expect(store.active()).toBeUndefined();
    expect(store.current()).toBeUndefined();
  });

  it('creates an environment, writes it at mode 0600, and makes it active', () => {
    const base = dir();
    const store = EnvironmentStore.fromDirectory(base);
    store.create('dev', { mode: 'token', token: 'cf-token-1' });
    expect(store.active()).toBe('dev');
    expect(store.list()).toEqual([{ name: 'dev', hasConnection: false, mode: undefined }]);
    const path = join(base, 'environments', 'dev.json');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    expect(written).toMatchObject({
      VIZOALICA_ENV_NAME: 'dev',
      VIZOALICA_CF_MODE: 'token',
      VIZOALICA_CF_API_TOKEN: 'cf-token-1'
    });
    expect(store.cloudflareCredential()).toEqual({ mode: 'token', token: 'cf-token-1' });
  });

  it('creates an environment in OneCLI mode with no token field', () => {
    const store = EnvironmentStore.fromDirectory(dir());
    store.create('stage', { mode: 'onecli' });
    expect(store.cloudflareCredential()).toEqual({ mode: 'onecli' });
    expect(store.cloudflareCredential('stage')).toEqual({ mode: 'onecli' });
  });

  it('refuses a colliding environment name before writing anything', () => {
    const base = dir();
    const store = EnvironmentStore.fromDirectory(base);
    store.create('dev', { mode: 'onecli' });
    expect(() => store.create('dev', { mode: 'onecli' })).toThrow('environment_name_taken');
    expect(store.list()).toHaveLength(1);
  });

  it('refuses an invalid environment name', () => {
    const store = EnvironmentStore.fromDirectory(dir());
    expect(() => store.create('Not Valid', { mode: 'onecli' })).toThrow('invalid_environment_name');
    expect(store.list()).toEqual([]);
  });

  it('lists every saved environment and which one is active', () => {
    const store = EnvironmentStore.fromDirectory(dir());
    store.create('dev', { mode: 'onecli' });
    store.create('stage', { mode: 'onecli' });
    expect(store.active()).toBe('stage');
    expect(
      store
        .list()
        .map((e) => e.name)
        .sort()
    ).toEqual(['dev', 'stage']);
  });

  it('select switches the active environment and its connection', () => {
    const store = EnvironmentStore.fromDirectory(dir());
    store.create('dev', { mode: 'onecli' });
    store.save({
      remoteUrl: 'https://dev.example.workers.dev',
      credential: 'a',
      kind: 'admin-secret'
    });
    store.create('stage', { mode: 'onecli' });
    store.save({
      remoteUrl: 'https://stage.example.workers.dev',
      credential: 'b',
      kind: 'admin-secret'
    });
    expect(store.current()?.remoteUrl).toBe('https://stage.example.workers.dev');
    store.select('dev');
    expect(store.active()).toBe('dev');
    expect(store.current()?.remoteUrl).toBe('https://dev.example.workers.dev');
  });

  it('select on an unknown name is refused', () => {
    const store = EnvironmentStore.fromDirectory(dir());
    expect(() => store.select('ghost')).toThrow('environment_not_found');
  });

  it('a save reflects on the next revision so a client cache can rebuild', () => {
    const store = EnvironmentStore.fromDirectory(dir());
    store.create('dev', { mode: 'onecli' });
    const before = store.revision;
    store.save({
      remoteUrl: 'https://dev.example.workers.dev',
      credential: 'a',
      kind: 'admin-secret'
    });
    expect(store.revision).toBeGreaterThan(before);
  });

  it('switching environments also changes the revision, so a cached client is rebuilt', () => {
    const store = EnvironmentStore.fromDirectory(dir());
    store.create('dev', { mode: 'onecli' });
    store.create('stage', { mode: 'onecli' });
    const before = store.revision;
    store.select('dev');
    expect(store.revision).toBeGreaterThan(before);
  });

  it('remove deletes the environment file and clears the active pointer only if it was active', () => {
    const base = dir();
    const store = EnvironmentStore.fromDirectory(base);
    store.create('dev', { mode: 'onecli' });
    store.create('stage', { mode: 'onecli' });
    expect(store.active()).toBe('stage');
    store.remove('dev');
    expect(store.active()).toBe('stage');
    expect(existsSync(join(base, 'environments', 'dev.json'))).toBe(false);
    store.remove('stage');
    expect(store.active()).toBeUndefined();
    expect(store.current()).toBeUndefined();
  });

  it('remove on an unknown name is refused', () => {
    const store = EnvironmentStore.fromDirectory(dir());
    expect(() => store.remove('ghost')).toThrow('environment_not_found');
  });

  it('never mixes up two environments saved side by side', () => {
    const store = EnvironmentStore.fromDirectory(dir());
    store.create('dev', { mode: 'token', token: 'dev-token' });
    store.save({
      remoteUrl: 'https://dev.example.workers.dev',
      credential: 'dev-secret',
      kind: 'admin-secret'
    });
    store.create('stage', { mode: 'token', token: 'stage-token' });
    store.save({
      remoteUrl: 'https://stage.example.workers.dev',
      credential: 'stage-secret',
      kind: 'admin-secret'
    });
    store.select('dev');
    expect(store.current()?.credential).toBe('dev-secret');
    expect(store.cloudflareCredential()).toEqual({ mode: 'token', token: 'dev-token' });
    store.select('stage');
    expect(store.current()?.credential).toBe('stage-secret');
    expect(store.cloudflareCredential()).toEqual({ mode: 'token', token: 'stage-token' });
  });

  it('reloads every environment and the active pointer from disk', () => {
    const base = dir();
    const first = EnvironmentStore.fromDirectory(base);
    first.create('dev', { mode: 'onecli' });
    first.save({
      remoteUrl: 'https://dev.example.workers.dev',
      credential: 'a',
      kind: 'admin-secret'
    });
    const second = EnvironmentStore.fromDirectory(base);
    expect(second.active()).toBe('dev');
    expect(second.current()?.remoteUrl).toBe('https://dev.example.workers.dev');
  });

  it('disconnect and setRoleHint operate on the active environment and preserve its identity', () => {
    const base = dir();
    const store = EnvironmentStore.fromDirectory(base);
    store.create('dev', { mode: 'token', token: 'dev-token' });
    store.save({
      remoteUrl: 'https://dev.example.workers.dev',
      credential: 'a',
      kind: 'admin-secret'
    });
    store.disconnect();
    expect(store.current()).toBeUndefined();
    expect(store.revoked).toBe(true);
    // The environment's own identity and Cloudflare credential survive disconnecting its backend.
    expect(store.active()).toBe('dev');
    expect(store.cloudflareCredential()).toEqual({ mode: 'token', token: 'dev-token' });
    store.setRoleHint('analyst');
    expect(store.hint()).toBe('analyst');
  });

  it('remembers a role hint chosen before any environment exists, surviving a reload', () => {
    const base = dir();
    const store = EnvironmentStore.fromDirectory(base);
    store.setRoleHint('analyst');
    expect(store.hint()).toBe('analyst');
    expect(store.current()).toBeUndefined();
    const reloaded = EnvironmentStore.fromDirectory(base);
    expect(reloaded.hint()).toBe('analyst');
  });

  it('carries a pending role hint into the first environment once one is created', () => {
    const store = EnvironmentStore.fromDirectory(dir());
    store.setRoleHint('website-owner');
    store.create('dev', { mode: 'onecli' });
    expect(store.hint()).toBe('website-owner');
  });

  it('auto-creates an unnamed environment on save when none exists yet, for a key with no chosen name', () => {
    const store = EnvironmentStore.fromDirectory(dir());
    expect(store.active()).toBeUndefined();
    store.save({
      remoteUrl: 'https://w.example.workers.dev',
      credential: 'vzk_x',
      kind: 'access-key'
    });
    expect(store.active()).toBeDefined();
    expect(store.current()?.credential).toBe('vzk_x');
  });

  it('fromConnection provides a single fixed, always-active environment for env-var-configured runs', () => {
    const store = EnvironmentStore.fromConnection('default', {
      remoteUrl: 'https://w.example.workers.dev',
      credential: 'a',
      kind: 'admin-secret'
    });
    expect(store.active()).toBe('default');
    expect(store.current()?.remoteUrl).toBe('https://w.example.workers.dev');
    expect(store.list()).toEqual([{ name: 'default', hasConnection: true, mode: 'file' }]);
  });

  it('rejects a role hint it does not know and unreadable JSON in an environment file', () => {
    const base = dir();
    writeEnv(base, 'dev', {
      VIZOALICA_ENV_NAME: 'dev',
      VIZOALICA_REMOTE_URL: 'https://w.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: 'a',
      VIZOALICA_ROLE_HINT: 'root'
    });
    const store = EnvironmentStore.fromDirectory(base);
    expect(() => store.select('dev')).not.toThrow();
    expect(() => store.current()).toThrow('invalid_connection_file');
    writeFileSync(envPath(base, 'dev'), '{nope', { mode: 0o600 });
    expect(() => EnvironmentStore.fromDirectory(base).current()).toThrow('invalid_connection_file');
  });

  it('rejects an environment file others can read', () => {
    const base = dir();
    writeEnv(
      base,
      'dev',
      {
        VIZOALICA_ENV_NAME: 'dev',
        VIZOALICA_REMOTE_URL: 'https://w.example.workers.dev',
        VIZOALICA_ADMIN_SECRET: 'a'
      },
      0o644
    );
    const store = EnvironmentStore.fromDirectory(base);
    store.select('dev');
    expect(() => store.current()).toThrow('config_permissions_must_be_0600');
  });

  it('accepts the OneCLI admin-secret placeholder only under the wrapper', () => {
    const base = dir();
    writeEnv(base, 'dev', {
      VIZOALICA_ENV_NAME: 'dev',
      VIZOALICA_REMOTE_URL: 'https://w.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: 'onecli-managed'
    });
    const unwrapped = EnvironmentStore.fromDirectory(base, {});
    unwrapped.select('dev');
    expect(() => unwrapped.current()).toThrow('onecli_placeholder_requires_wrapper');
    const wrapped = EnvironmentStore.fromDirectory(base, { VIZOALICA_ONECLI_WRAPPED: '1' });
    wrapped.select('dev');
    expect(wrapped.current()?.credential).toBe('onecli-managed');
    expect(wrapped.mode()).toBe('onecli');
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

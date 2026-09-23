import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSettings } from '../src/config.js';
import { EnvironmentStore, ONECLI_PLACEHOLDER } from '../src/environment-store.js';
import { createLocalServer } from '../src/server.js';
import { callerFor } from './support.js';

const dir = () => mkdtempSync(join(tmpdir(), 'vizoalica-legacy-'));

function writeLegacyFile(base: string, values: Record<string, string>, mode = 0o600) {
  const path = join(base, 'local-operations.json');
  writeFileSync(path, JSON.stringify(values), { mode });
  chmodSync(path, mode);
  return path;
}

describe('a pre-0.7.0 single connection file, found with no environments/ directory yet', () => {
  it('is offered once, in file mode, without being imported on its own', () => {
    const base = dir();
    writeLegacyFile(base, {
      VIZOALICA_REMOTE_URL: 'https://legacy.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: 'the-admin-secret'
    });
    const store = EnvironmentStore.fromDirectory(base);
    expect(store.hasLegacySetup()).toBe(true);
    expect(store.legacyPreview()).toEqual({
      workerHost: 'legacy.example.workers.dev',
      mode: 'file'
    });
    // Not imported on its own: no environment exists yet, and there is nothing active.
    expect(store.list()).toEqual([]);
    expect(store.active()).toBeUndefined();
  });

  it('is offered in OneCLI mode when wrapped', () => {
    const base = dir();
    writeLegacyFile(base, {
      VIZOALICA_REMOTE_URL: 'https://legacy.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: ONECLI_PLACEHOLDER
    });
    const store = EnvironmentStore.fromDirectory(base, { VIZOALICA_ONECLI_WRAPPED: '1' });
    expect(store.legacyPreview()).toEqual({
      workerHost: 'legacy.example.workers.dev',
      mode: 'onecli'
    });
  });

  it('moves the address, credential, and role hint into environments/<name>.json exactly as they were, and leaves the old file alone', () => {
    const base = dir();
    const legacyPath = writeLegacyFile(base, {
      VIZOALICA_REMOTE_URL: 'https://legacy.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: 'the-admin-secret',
      VIZOALICA_ROLE_HINT: 'admin'
    });
    const legacyContentBefore = readFileSync(legacyPath, 'utf8');
    const store = EnvironmentStore.fromDirectory(base);

    store.importLegacyAs('prod');

    expect(store.active()).toBe('prod');
    expect(store.current()).toEqual({
      remoteUrl: 'https://legacy.example.workers.dev',
      credential: 'the-admin-secret',
      kind: 'admin-secret',
      roleHint: 'admin'
    });
    expect(store.hasLegacySetup()).toBe(false);
    // The old file is never deleted, so a downgrade to a pre-0.7.0 checkout still finds it.
    expect(readFileSync(legacyPath, 'utf8')).toBe(legacyContentBefore);
  });

  it('needs a name; a name already taken by another environment is refused', () => {
    const base = dir();
    writeLegacyFile(base, {
      VIZOALICA_REMOTE_URL: 'https://legacy.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: 'the-admin-secret'
    });
    const store = EnvironmentStore.fromDirectory(base);
    // A name already taken by another environment created in this same session, before the legacy
    // file is imported.
    store.create('prod', { mode: 'token', token: 'cf-tok' });
    expect(() => store.importLegacyAs('prod')).toThrow('environment_name_taken');
  });

  it('refuses an invalid environment name', () => {
    const base = dir();
    writeLegacyFile(base, {
      VIZOALICA_REMOTE_URL: 'https://legacy.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: 'the-admin-secret'
    });
    const store = EnvironmentStore.fromDirectory(base);
    expect(() => store.importLegacyAs('Not Valid')).toThrow('invalid_environment_name');
  });
});

describe('a machine that already has an environments/ directory', () => {
  it('treats a leftover legacy file as already imported: not offered again', () => {
    const base = dir();
    // An environment already exists (and is therefore active, since `create` always selects it),
    // alongside an untouched legacy file left over from before the migration to environments.
    mkdirSync(join(base, 'environments'), { recursive: true });
    const firstStore = EnvironmentStore.fromDirectory(base);
    firstStore.create('dev', { mode: 'token', token: 'cf-tok' });
    writeLegacyFile(base, {
      VIZOALICA_REMOTE_URL: 'https://legacy.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: 'the-admin-secret'
    });

    const store = EnvironmentStore.fromDirectory(base);
    expect(store.hasLegacySetup()).toBe(false);
    expect(store.legacyPreview()).toBeUndefined();
  });
});

describe('a damaged or over-permissive legacy file', () => {
  it('fails fast with the existing repair message, rather than being silently imported', () => {
    const base = dir();
    writeLegacyFile(
      base,
      {
        VIZOALICA_REMOTE_URL: 'https://legacy.example.workers.dev',
        VIZOALICA_ADMIN_SECRET: 'the-admin-secret'
      },
      0o644
    );
    expect(() => EnvironmentStore.fromDirectory(base)).toThrow('config_permissions_must_be_0600');
  });

  it('fails fast on an unparseable legacy file', () => {
    const base = dir();
    writeFileSync(join(base, 'local-operations.json'), 'not json', { mode: 0o600 });
    chmodSync(join(base, 'local-operations.json'), 0o600);
    expect(() => EnvironmentStore.fromDirectory(base)).toThrow('invalid_connection_file');
  });
});

describe('POST /api/setup/import-legacy', () => {
  function start() {
    const base = dir();
    writeLegacyFile(base, {
      VIZOALICA_REMOTE_URL: 'https://legacy.example.workers.dev',
      VIZOALICA_ADMIN_SECRET: 'the-admin-secret'
    });
    const store = EnvironmentStore.fromDirectory(base);
    const server = createLocalServer({
      settings: { ...loadSettings({}), homeDir: base },
      store,
      version: '0.7.0',
      schemaDir: undefined
    });
    return { store, ...callerFor(server) };
  }

  it('refuses a non-string name', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await api.call('/api/setup/import-legacy', {
      method: 'POST',
      cookie,
      body: { name: 5 }
    });
    expect(result.status).toBe(400);
  });

  it('refuses an invalid environment name', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await api.call('/api/setup/import-legacy', {
      method: 'POST',
      cookie,
      body: { name: 'Not Valid' }
    });
    expect(result.status).toBe(400);
  });

  it('imports the legacy setup as the named environment', async () => {
    const api = start();
    const cookie = await api.session();
    const result = await api.call('/api/setup/import-legacy', {
      method: 'POST',
      cookie,
      body: { name: 'prod' }
    });
    expect(result.status).toBe(200);
    expect(api.store.active()).toBe('prod');
  });

  it('answers 409 when there is no legacy setup to import', async () => {
    const base = mkdtempSync(join(tmpdir(), 'vizoalica-legacy-'));
    const store = EnvironmentStore.fromDirectory(base);
    const server = createLocalServer({
      settings: { ...loadSettings({}), homeDir: base },
      store,
      version: '0.7.0',
      schemaDir: undefined
    });
    const api = callerFor(server);
    const cookie = await api.session();
    const result = await api.call('/api/setup/import-legacy', {
      method: 'POST',
      cookie,
      body: { name: 'prod' }
    });
    expect(result.status).toBe(409);
  });
});

import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeConfigFile } from '../../local-ops-api/src/config.js';
import { createService } from '../../local-ops-api/src/service.js';
import { callerFor } from '../../local-ops-api/tests/support.js';
import { stubWorker } from '../../local-ops-api/tests/worker-stub.js';
import { consoleCommand } from '../src/console-command.js';
import { fakeDeps, tempHome } from './support.js';

afterEach(() => vi.unstubAllGlobals());

/** A connection file exactly as `pnpm vizoalica connect` writes it, pre-0.7.0, with no environment yet. */
function checkoutFile(secret: string) {
  const home = tempHome();
  const directory = join(home, '.config', 'vizoalica');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'local-operations.json');
  writeConfigFile(path, {
    VIZOALICA_REMOTE_URL: 'https://worker.example.workers.dev',
    VIZOALICA_ADMIN_SECRET: secret
  });
  return { home, directory, path };
}

describe('a setup made with the checkout commands', () => {
  it('is offered as the first environment to name, with no other first-run questions', async () => {
    const { directory } = checkoutFile('direct-secret');
    stubWorker({ role: 'legacy', projects: [] });
    const { server, store } = createService({ homeDir: directory, env: {} });
    const api = callerFor(server);
    const cookie = await api.session();
    // Found, but not silently imported: its name doubles as a resource-name prefix (research R26), so
    // naming it is the one step 0.7.0 adds on top of the old "no first-run questions" behavior.
    const before = await api.call('/api/setup/state', { cookie });
    expect(before.body).toMatchObject({
      needsFirstRun: true,
      legacySetup: { workerHost: 'worker.example.workers.dev', mode: 'file' }
    });
    const imported = await api.call('/api/setup/import-legacy', {
      method: 'POST',
      cookie,
      body: { name: 'prod' }
    });
    expect(imported.status).toBe(200);
    expect(imported.body).toMatchObject({
      needsFirstRun: false,
      connection: { status: 'connected', mode: 'file', workerHost: 'worker.example.workers.dev' },
      principal: { role: 'admin' }
    });
    expect(store.active()).toBe('prod');
  });

  it('keeps the OneCLI placeholder and never writes a secret to a file', async () => {
    const { directory, path } = checkoutFile('onecli-managed');
    const before = readFileSync(path, 'utf8');
    stubWorker({ role: 'legacy', projects: [] });
    const { server, store } = createService({
      homeDir: directory,
      env: { VIZOALICA_ONECLI_WRAPPED: '1' }
    });
    const api = callerFor(server);
    const cookie = await api.session();
    await api.call('/api/setup/import-legacy', { method: 'POST', cookie, body: { name: 'prod' } });
    const state = await api.call('/api/setup/state', { cookie });
    expect(state.body).toMatchObject({ needsFirstRun: false, connection: { mode: 'onecli' } });
    expect(state.text).not.toContain('onecli-managed');
    const envPath = join(directory, 'environments', 'prod.json');
    expect(readFileSync(envPath, 'utf8')).toContain('onecli-managed');
    expect(readFileSync(envPath, 'utf8')).not.toMatch(/secret-[a-z]+/);
    // The old file is left exactly as it was: importing moves nothing, it only reads.
    expect(readFileSync(path, 'utf8')).toBe(before);
    void store;
  });

  it('is not started outside the OneCLI wrapper', () => {
    const { directory } = checkoutFile('onecli-managed');
    expect(() => createService({ homeDir: directory, env: {} })).toThrow(
      'onecli_placeholder_requires_wrapper'
    );
  });
});

describe('a saved connection that cannot be used', () => {
  const real = { createService: createService as never };

  it('offers to make a file others can read private, and starts nothing', async () => {
    const { home, path } = checkoutFile('direct-secret');
    chmodSync(path, 0o644);
    const d = fakeDeps({ home, ...real });
    expect(await consoleCommand({ open: false }, d)).toBe(1);
    expect(d.errors.join('')).toContain(`chmod 600 ${path}`);
    expect(d.errors.join('')).not.toContain('direct-secret');
    expect(d.output).toEqual([]);
  });

  it('offers to move a damaged file aside, without printing its contents', async () => {
    const { home, path } = checkoutFile('direct-secret');
    writeFileSync(path, '{"VIZOALICA_ADMIN_SECRET": "direct-secret", broken', { mode: 0o600 });
    const d = fakeDeps({ home, ...real });
    expect(await consoleCommand({ open: false }, d)).toBe(1);
    expect(d.errors.join('')).toContain(`mv ${path} ${path}.bak`);
    expect(d.errors.join('')).not.toContain('direct-secret');
  });

  it('treats a revoked file as a fresh start', async () => {
    const { home, path } = checkoutFile('x');
    writeConfigFile(
      path,
      { VIZOALICA_REMOTE_URL: 'https://revoked.invalid', VIZOALICA_ADMIN_SECRET: '' },
      { replace: true }
    );
    const d = fakeDeps({ home, ...real, listen: async () => undefined });
    d.stop();
    expect(await consoleCommand({ open: false }, d)).toBe(0);
    expect(d.errors).toEqual([]);
  });
});

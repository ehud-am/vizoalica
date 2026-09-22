import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createService, listenLoopback } from '../src/service.js';

const dir = () => mkdtempSync(join(tmpdir(), 'vizoalica-service-'));

/** Writes an environment file directly and makes it active, without going through EnvironmentStore. */
function seedEnvironment(homeDir: string, name: string, values: Record<string, string>): void {
  mkdirSync(join(homeDir, 'environments'), { recursive: true, mode: 0o700 });
  writeFileSync(join(homeDir, 'environments', `${name}.json`), JSON.stringify(values), {
    mode: 0o600
  });
  writeFileSync(join(homeDir, 'active-environment.json'), JSON.stringify({ active: name }), {
    mode: 0o600
  });
}

describe('createService', () => {
  it('starts with an environments directory that does not exist yet', () => {
    const { store, settings } = createService({ homeDir: join(dir(), 'nope'), env: {} });
    expect(store.current()).toBeUndefined();
    expect(settings.port).toBe(4318);
    expect(settings.homeDir).toContain('nope');
  });

  it('loads a saved environment', () => {
    const home = dir();
    seedEnvironment(home, 'dev', {
      VIZOALICA_ENV_NAME: 'dev',
      VIZOALICA_REMOTE_URL: 'https://w.test',
      VIZOALICA_ADMIN_SECRET: 'a'
    });
    expect(createService({ homeDir: home, env: {} }).store.current()?.credential).toBe('a');
  });

  it('refuses an environment file others can read', () => {
    const home = dir();
    mkdirSync(join(home, 'environments'), { recursive: true, mode: 0o700 });
    const path = join(home, 'environments', 'dev.json');
    writeFileSync(path, '{}');
    chmodSync(path, 0o644);
    writeFileSync(join(home, 'active-environment.json'), JSON.stringify({ active: 'dev' }), {
      mode: 0o600
    });
    expect(() => createService({ homeDir: home, env: {} }).store.current()).toThrow(
      'config_permissions_must_be_0600'
    );
  });

  it('uses a connection from the environment when no directory is configured', () => {
    const { store, settings } = createService({
      env: { VIZOALICA_REMOTE_URL: 'https://w.test', VIZOALICA_ADMIN_SECRET: 'env-secret' }
    });
    expect(store.current()).toMatchObject({ credential: 'env-secret', kind: 'admin-secret' });
    expect(settings.homeDir).toBeUndefined();
  });

  it('falls back to the default directory under the home directory', () => {
    const home = dir();
    const previous = process.env.HOME;
    process.env.HOME = home;
    try {
      const { settings, store } = createService({ env: {} });
      expect(store.current()).toBeUndefined();
      expect(settings.homeDir).toMatch(/\.config\/vizoalica$/);
    } finally {
      if (previous === undefined) delete process.env.HOME;
      else process.env.HOME = previous;
    }
  });
});

describe('listenLoopback', () => {
  it('reports a busy port plainly', async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const port = (blocker.address() as { port: number }).port;
    const { server } = createService({ homeDir: dir(), env: {} });
    await expect(listenLoopback(server, port)).rejects.toThrow('port_in_use');
    blocker.close();
  });

  it('listens on loopback', async () => {
    const { server } = createService({ homeDir: dir(), env: {} });
    await listenLoopback(server, 0);
    expect((server.address() as { address: string }).address).toBe('127.0.0.1');
    server.close();
  });
});

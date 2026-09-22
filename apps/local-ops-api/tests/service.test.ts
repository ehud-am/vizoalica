import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createService, listenLoopback } from '../src/service.js';

const dir = () => mkdtempSync(join(tmpdir(), 'vizoalica-service-'));

describe('createService', () => {
  it('starts with a connection file that does not exist yet', () => {
    const { store, settings } = createService({ configPath: join(dir(), 'c.json'), env: {} });
    expect(store.current()).toBeUndefined();
    expect(settings.port).toBe(4318);
    expect(settings.configFilePath).toContain('c.json');
  });

  it('loads a saved connection', () => {
    const path = join(dir(), 'c.json');
    writeFileSync(
      path,
      JSON.stringify({ VIZOALICA_REMOTE_URL: 'https://w.test', VIZOALICA_ADMIN_SECRET: 'a' }),
      { mode: 0o600 }
    );
    expect(createService({ configPath: path, env: {} }).store.current()?.credential).toBe('a');
  });

  it('refuses a connection file others can read', () => {
    const path = join(dir(), 'c.json');
    writeFileSync(path, '{}');
    chmodSync(path, 0o644);
    expect(() => createService({ configPath: path, env: {} })).toThrow(
      'config_permissions_must_be_0600'
    );
  });

  it('uses a connection from the environment when no file is named', () => {
    const { store, settings } = createService({
      env: { VIZOALICA_REMOTE_URL: 'https://w.test', VIZOALICA_ADMIN_SECRET: 'env-secret' }
    });
    expect(store.current()).toMatchObject({ credential: 'env-secret', kind: 'admin-secret' });
    expect(settings.configFilePath).toBeUndefined();
  });

  it('falls back to the default file under the home directory', () => {
    const home = dir();
    const previous = process.env.HOME;
    process.env.HOME = home;
    try {
      const { settings, store } = createService({ env: {} });
      expect(store.current()).toBeUndefined();
      expect(settings.configFilePath).toMatch(/\.config\/vizoalica\/local-operations\.json$/);
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
    const { server } = createService({ configPath: join(dir(), 'c.json'), env: {} });
    await expect(listenLoopback(server, port)).rejects.toThrow('port_in_use');
    blocker.close();
  });

  it('listens on loopback', async () => {
    const { server } = createService({ configPath: join(dir(), 'c.json'), env: {} });
    await listenLoopback(server, 0);
    expect((server.address() as { address: string }).address).toBe('127.0.0.1');
    server.close();
  });
});

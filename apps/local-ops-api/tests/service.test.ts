import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createService, listenLoopback } from '../src/service.js';
import { stubWorker } from './worker-stub.js';

afterEach(() => vi.unstubAllGlobals());

const dir = () => mkdtempSync(join(tmpdir(), 'vizoalica-service-'));

describe('createService', () => {
  it('starts with a home directory that does not exist yet, and with no environment', async () => {
    const { registry, settings } = createService({ homeDir: join(dir(), 'nope'), env: {} });
    await registry.refresh();
    expect(registry.current()).toBeUndefined();
    expect(registry.snapshot.file.status).toBe('ok');
    expect(registry.snapshot.environments).toEqual([]);
    expect(settings.port).toBe(4318);
    expect(settings.homeDir).toContain('nope');
  });

  it('loads environments.json, verifying each against its Worker', async () => {
    stubWorker({ role: 'admin', workerVersion: '0.7.0', schemaApplied: 1, accept: ['a'] });
    const home = dir();
    const path = join(home, 'environments.json');
    writeFileSync(
      path,
      JSON.stringify({
        environments: { dev: { url: 'https://w.test', role: 'admin', secret: 'a' } }
      }),
      { mode: 0o600 }
    );
    const { registry } = createService({ homeDir: home, env: {}, version: '0.7.0' });
    await registry.refresh();
    expect(registry.current()).toMatchObject({ name: 'dev', credential: 'a' });
  });

  it('reports, rather than throws on, an environments file others can read', async () => {
    const home = dir();
    const path = join(home, 'environments.json');
    writeFileSync(path, '{}');
    chmodSync(path, 0o644);
    const { registry } = createService({ homeDir: home, env: {} });
    await registry.refresh();
    expect(registry.snapshot.file).toMatchObject({
      status: 'broken',
      reason: expect.stringContaining('chmod 600')
    });
  });

  it('falls back to the default directory under the home directory', () => {
    const home = dir();
    const previous = process.env.HOME;
    process.env.HOME = home;
    try {
      const { settings } = createService({ env: {} });
      expect(settings.homeDir).toMatch(/\.config\/vizoalica$/);
    } finally {
      if (previous === undefined) delete process.env.HOME;
      else process.env.HOME = previous;
    }
  });

  it('stops its OneCLI helpers when the server closes', async () => {
    const { server, vault } = createService({ homeDir: dir(), env: {} });
    const close = vi.spyOn(vault, 'close');
    await listenLoopback(server, 0);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(close).toHaveBeenCalled();
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

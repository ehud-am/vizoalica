import { EventEmitter } from 'node:events';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { consoleArguments, localApiArguments, run } from '../../../../scripts/vizoalica.js';

const workerUrl = 'https://analytics.example.workers.dev';

function privateJson(directory: string, name: string, value: unknown): string {
  const path = join(directory, name);
  writeFileSync(path, JSON.stringify(value));
  chmodSync(path, 0o600);
  return path;
}

/** Records each spawn and lets the child exit cleanly straight away. */
function fakeSpawn() {
  const calls: Array<{ command: string; args: string[] }> = [];
  const spawn = ((command: string, args: string[]) => {
    calls.push({ command, args });
    const child = new EventEmitter() as EventEmitter & { kill: () => boolean };
    child.kill = () => true;
    queueMicrotask(() => child.emit('exit', 0));
    return child;
  }) as never;
  return {
    calls,
    dependencies: {
      spawn,
      spawnSync: (() => ({})) as never,
      fetch,
      isTTY: false,
      portInUse: async () => false
    }
  };
}

describe('pnpm vizoalica console', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vizoalica-console-'));
  const ops = {
    version: 1,
    workerUrl,
    consoleConfigPath: join(directory, 'console-onecli.json'),
    onecli: { project: 'example-project', agent: 'example-agent', gateway: '127.0.0.1:10255' }
  };

  it('starts the API and the web console with a local administrator secret file', async () => {
    const consoleConfig = privateJson(directory, 'console-file.json', {
      VIZOALICA_REMOTE_URL: workerUrl,
      VIZOALICA_ADMIN_SECRET: 'not-a-real-secret'
    });
    const { calls, dependencies } = fakeSpawn();
    await run(['console', '--console-config', consoleConfig], dependencies);
    expect(calls).toEqual([
      { command: 'pnpm', args: ['local-ops-api:dev', 'serve', directory] },
      { command: 'pnpm', args: ['admin-web:dev'] }
    ]);
    expect(localApiArguments({ path: consoleConfig })).toEqual(calls[0]!.args);
  });

  it('wraps only the API in OneCLI when the console config is OneCLI-managed', async () => {
    const opsPath = privateJson(directory, 'ops.json', ops);
    privateJson(directory, 'console-onecli.json', {
      VIZOALICA_REMOTE_URL: workerUrl,
      VIZOALICA_ADMIN_SECRET: 'onecli-managed'
    });
    const { calls, dependencies } = fakeSpawn();
    await run(['console', '--config', opsPath], dependencies);
    expect(calls).toEqual([
      { command: 'onecli', args: consoleArguments(ops) },
      { command: 'pnpm', args: ['admin-web:dev'] }
    ]);
  });

  it('starts at first-run setup when no connection file exists yet', async () => {
    const home = mkdtempSync(join(tmpdir(), 'vizoalica-fresh-home-'));
    const { calls, dependencies } = fakeSpawn();
    const realHome = process.env.HOME;
    process.env.HOME = home; // the default paths are read when the module loads
    vi.resetModules();
    try {
      const fresh = await import('../../../../scripts/vizoalica.js');
      await fresh.run(['console'], dependencies);
    } finally {
      process.env.HOME = realHome;
      vi.resetModules();
    }
    expect(calls).toEqual([
      { command: 'pnpm', args: ['local-ops-api:dev'] },
      { command: 'pnpm', args: ['admin-web:dev'] }
    ]);
  });

  it('keeps run as an alias', async () => {
    const consoleConfig = privateJson(directory, 'console-alias.json', {
      VIZOALICA_REMOTE_URL: workerUrl,
      VIZOALICA_ADMIN_SECRET: 'not-a-real-secret'
    });
    const { calls, dependencies } = fakeSpawn();
    await run(['run', '--console-config', consoleConfig], dependencies);
    expect(calls).toHaveLength(2);
  });

  it('refuses to start a second console when its ports are taken, and does not spawn anything', async () => {
    const consoleConfig = privateJson(directory, 'console-busy.json', {
      VIZOALICA_REMOTE_URL: workerUrl,
      VIZOALICA_ADMIN_SECRET: 'not-a-real-secret'
    });
    const { calls, dependencies } = fakeSpawn();
    await expect(
      run(['console', '--console-config', consoleConfig], {
        ...dependencies,
        portInUse: async (port) => port === 5173
      })
    ).rejects.toThrow(/Port 5173 is already in use[\s\S]*stop the other console/);
    await expect(
      run(['console', '--console-config', consoleConfig], {
        ...dependencies,
        portInUse: async () => true
      })
    ).rejects.toThrow(/Ports 4318 and 5173 are already in use/);
    expect(calls).toHaveLength(0);
  });
});

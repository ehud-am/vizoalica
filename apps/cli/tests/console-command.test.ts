import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  consoleCommand,
  oneCliArguments,
  oneCliNodeOptions,
  serveCommand
} from '../src/console-command.js';
import { fakeDeps, writePrivate } from './support.js';

describe('consoleCommand without a saved connection', () => {
  it('starts the service with the packaged directories and prints the address', async () => {
    let received: Record<string, unknown> | undefined;
    const d = fakeDeps({
      createService: ((options: Record<string, unknown>) => {
        received = options;
        return fakeDeps().createService!(options as never);
      }) as never
    });
    d.stop();
    expect(await consoleCommand({ open: true }, d)).toBe(0);
    expect(d.output.join('')).toContain('http://127.0.0.1:4318');
    expect(d.output.join('')).toContain('Ctrl+C');
    expect(received).toMatchObject({
      consoleDir: '/assets/dist/console',
      sdkDir: '/assets/dist/sdk',
      schemaDir: '/assets/dist/schema',
      version: '9.9.9'
    });
    expect(String(received?.configPath)).toMatch(/\.config\/vizoalica\/local-operations\.json$/);
    expect(d.opened).toEqual(['http://127.0.0.1:4318']);
  });

  it('honors VIZOALICA_PORT and never opens a browser with --no-open', async () => {
    const d = fakeDeps({ env: { VIZOALICA_PORT: '4999' } });
    d.stop();
    await consoleCommand({ open: false }, d);
    expect(d.output.join('')).toContain('http://127.0.0.1:4999');
    expect(d.opened).toEqual([]);
  });

  it('still prints the address when there is nothing to open a browser with', async () => {
    const d = fakeDeps({ openBrowser: () => undefined });
    d.stop();
    await consoleCommand({ open: true }, d);
    expect(d.output.join('')).toContain('http://127.0.0.1:4318');
  });

  it('stops the service when asked', async () => {
    const d = fakeDeps();
    d.stop();
    await consoleCommand({ open: false }, d);
    expect(d.closed.value).toBe(true);
  });

  it('reports a busy port and exits 1', async () => {
    const d = fakeDeps({
      listen: async () => {
        throw new Error('port_in_use');
      }
    });
    expect(await consoleCommand({ open: false }, d)).toBe(1);
    expect(d.errors.join('')).toContain('A console is probably running already');
  });

  it('rethrows anything else', async () => {
    const d = fakeDeps({
      listen: async () => {
        throw new Error('boom');
      }
    });
    await expect(consoleCommand({ open: false }, d)).rejects.toThrow('boom');
  });
});

describe('a saved connection that cannot be used', () => {
  const failing = (code: string) =>
    fakeDeps({
      createService: (() => {
        throw new Error(code);
      }) as never
    });

  it('offers to fix a file others can read, without printing its contents', async () => {
    const d = failing('config_permissions_must_be_0600');
    expect(await consoleCommand({ open: false }, d)).toBe(1);
    expect(d.errors.join('')).toContain('chmod 600');
    expect(d.errors.join('')).toContain('local-operations.json');
  });

  it('offers to move aside a damaged file', async () => {
    const d = failing('invalid_connection_file');
    expect(await consoleCommand({ open: false }, d)).toBe(1);
    expect(d.errors.join('')).toContain('mv ');
    expect(d.errors.join('')).not.toContain('secret');
  });

  it('explains a OneCLI placeholder with no OneCLI settings', async () => {
    const d = failing('onecli_placeholder_requires_wrapper: start it');
    expect(await consoleCommand({ open: false }, d)).toBe(1);
    expect(d.errors.join('')).toContain('OneCLI');
  });

  it('rethrows an error it does not know', async () => {
    await expect(consoleCommand({ open: false }, failing('weird'))).rejects.toThrow('weird');
  });
});

describe('OneCLI mode', () => {
  const ops = {
    version: 1,
    workerUrl: 'https://w.test',
    onecli: { project: 'proj', agent: 'agent', gateway: '127.0.0.1:10255' }
  };

  it('starts the service again through onecli, keeping the caller NODE_OPTIONS', async () => {
    const d = fakeDeps({ env: { NODE_OPTIONS: '--max-old-space-size=512' } });
    writePrivate(d.home, 'local-operations.json', {
      VIZOALICA_REMOTE_URL: 'https://w.test',
      VIZOALICA_ADMIN_SECRET: 'onecli-managed'
    });
    writePrivate(d.home, 'ops.json', ops);
    expect(await consoleCommand({ open: false }, d)).toBe(0);
    const call = d.spawned[0]!;
    expect(call.command).toBe('onecli');
    expect(call.args).toContain('VIZOALICA_ONECLI_WRAPPED=1');
    expect(call.args).toContain(
      'NODE_OPTIONS=--max-old-space-size=512 --disable-warning=UNDICI-EHPA'
    );
    expect(call.args.slice(-2)).toEqual([
      'serve',
      expect.stringMatching(/local-operations\.json$/)
    ]);
    expect(call.args).toContain('/assets/dist/cli.mjs');
    expect(d.output.join('')).toContain('OneCLI');
    // The service itself is not started in this process.
    expect(d.closed.value).toBe(false);
  });

  it('opens the browser and stops the child on an interrupt', async () => {
    let killed = false;
    const d = fakeDeps({
      spawn: (() => {
        const child = Object.assign(new EventEmitter(), {
          kill: () => {
            killed = true;
            return true;
          }
        });
        return child;
      }) as never
    });
    writePrivate(d.home, 'local-operations.json', {
      VIZOALICA_REMOTE_URL: 'https://w.test',
      VIZOALICA_ADMIN_SECRET: 'onecli-managed'
    });
    writePrivate(d.home, 'ops.json', ops);
    const done = consoleCommand({ open: true }, d);
    d.stop();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(killed).toBe(true);
    expect(d.opened).toEqual(['http://127.0.0.1:4318']);
    void done;
  });

  it('reports a missing onecli program', async () => {
    const d = fakeDeps({
      spawn: (() => {
        const child = Object.assign(new EventEmitter(), { kill: () => true });
        queueMicrotask(() => child.emit('error', new Error('ENOENT')));
        return child;
      }) as never
    });
    writePrivate(d.home, 'local-operations.json', {
      VIZOALICA_REMOTE_URL: 'https://w.test',
      VIZOALICA_ADMIN_SECRET: 'onecli-managed'
    });
    writePrivate(d.home, 'ops.json', ops);
    expect(await consoleCommand({ open: false }, d)).toBe(1);
    expect(d.errors.join('')).toContain('OneCLI could not be started');
  });

  it('ignores a placeholder file with no usable ops settings and lets the service explain', async () => {
    const d = failing();
    writePrivate(d.home, 'local-operations.json', {
      VIZOALICA_REMOTE_URL: 'https://w.test',
      VIZOALICA_ADMIN_SECRET: 'onecli-managed'
    });
    writePrivate(d.home, 'ops.json', { version: 1 });
    d.stop();
    await consoleCommand({ open: false }, d);
    expect(d.spawned).toEqual([]);
  });

  it('builds the arguments and merges options', () => {
    expect(oneCliNodeOptions(undefined)).toBe('--disable-warning=UNDICI-EHPA');
    expect(
      oneCliArguments({ project: 'p', agent: 'a', gateway: 'g:1' }, '/cli.mjs', '/c.json', '')
    ).toContain('NODE_OPTIONS=--disable-warning=UNDICI-EHPA');
  });
});

function failing() {
  return fakeDeps();
}

describe('serveCommand', () => {
  it('runs the service alone until asked to stop', async () => {
    const d = fakeDeps();
    d.stop();
    expect(await serveCommand('/x/c.json', d)).toBe(0);
    expect(d.closed.value).toBe(true);
    expect(d.opened).toEqual([]);
  });

  it('uses the default connection file when none is named', async () => {
    let path: unknown;
    const d = fakeDeps({
      createService: ((options: { configPath?: string }) => {
        path = options.configPath;
        return fakeDeps().createService!(options as never);
      }) as never
    });
    d.stop();
    await serveCommand(undefined, d);
    expect(String(path)).toMatch(/local-operations\.json$/);
  });

  it('reports an unusable connection file and a busy port', async () => {
    const bad = fakeDeps({
      createService: (() => {
        throw new Error('config_permissions_must_be_0600');
      }) as never
    });
    expect(await serveCommand('/x/c.json', bad)).toBe(1);
    expect(bad.errors.join('')).toContain('chmod 600');
    const unknown = fakeDeps({
      createService: (() => {
        throw new Error('weird');
      }) as never
    });
    expect(await serveCommand(undefined, unknown)).toBe(1);
    expect(unknown.errors.join('')).toContain('weird');
    const busy = fakeDeps({
      listen: async () => {
        throw new Error('port_in_use');
      }
    });
    expect(await serveCommand('/x/c.json', busy)).toBe(1);
    expect(busy.errors.join('')).toContain('probably running already');
    const other = fakeDeps({
      listen: async () => {
        throw new Error('nope');
      }
    });
    expect(await serveCommand('/x/c.json', other)).toBe(1);
    expect(other.errors.join('')).toContain('Could not start');
  });
});

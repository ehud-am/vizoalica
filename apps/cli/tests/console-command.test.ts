import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { consoleCommand } from '../src/console-command.js';
import { fakeDeps } from './support.js';

type Snapshot = { environments: Array<{ usable: boolean }>; selected: string | undefined };
const withEnvironments = (snapshot: Snapshot) =>
  fakeDeps({
    createService: (() => ({
      server: Object.assign(new EventEmitter(), {
        close: (callback?: () => void) => callback?.(),
        closeAllConnections: () => undefined
      }),
      registry: { refresh: async () => undefined, snapshot },
      settings: {}
    })) as never
  });

describe('consoleCommand', () => {
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
    expect(String(received?.homeDir)).toMatch(/\.config\/vizoalica$/);
    expect(received).not.toHaveProperty('workerDir');
    expect(d.opened).toEqual(['http://127.0.0.1:4318']);
  });

  it('honors VIZOALICA_PORT and never opens a browser with --no-open', async () => {
    const d = fakeDeps({ env: { VIZOALICA_PORT: '4999' } });
    d.stop();
    await consoleCommand({ open: false }, d);
    expect(d.output.join('')).toContain('http://127.0.0.1:4999');
    expect(d.opened).toEqual([]);
  });

  it('says which environment it opened on', async () => {
    const d = withEnvironments({
      environments: [{ usable: true }, { usable: false }],
      selected: 'dev'
    });
    d.stop();
    await consoleCommand({ open: false }, d);
    expect(d.output.join('')).toContain('Environment: dev (1 of 2 usable)');
  });

  it('still starts with no usable environment, and points at vizoalica env', async () => {
    const d = withEnvironments({ environments: [], selected: undefined });
    d.stop();
    expect(await consoleCommand({ open: true }, d)).toBe(0);
    expect(d.output.join('')).toContain('No environment is usable yet');
    expect(d.output.join('')).toContain('vizoalica env list');
    expect(d.opened).toEqual(['http://127.0.0.1:4318']);
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

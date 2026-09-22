import { EventEmitter } from 'node:events';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConsoleDeps } from '../src/console-command.js';

export function tempHome(): string {
  return mkdtempSync(join(tmpdir(), 'vizoalica-cli-home-'));
}

export function writePrivate(home: string, name: string, value: unknown, mode = 0o600): string {
  const directory = join(home, '.config', 'vizoalica');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, name);
  writeFileSync(path, JSON.stringify(value));
  chmodSync(path, mode);
  return path;
}

export type Recorded = ConsoleDeps & {
  output: string[];
  errors: string[];
  opened: string[];
  spawned: Array<{ command: string; args: readonly string[] }>;
  stop: () => void;
  closed: { value: boolean };
};

/** A ConsoleDeps whose service is a stub, so nothing binds a port or starts a process. */
export function fakeDeps(overrides: Partial<ConsoleDeps> = {}): Recorded {
  const output: string[] = [];
  const errors: string[] = [];
  const opened: string[] = [];
  const spawned: Array<{ command: string; args: readonly string[] }> = [];
  const closed = { value: false };
  let release: () => void = () => undefined;
  const stopped = new Promise<void>((resolve) => (release = resolve));
  const server = Object.assign(new EventEmitter(), {
    close: (callback?: () => void) => {
      closed.value = true;
      callback?.();
    },
    closeAllConnections: () => undefined
  });
  const deps: ConsoleDeps = {
    env: {},
    home: tempHome(),
    version: '9.9.9',
    assetDir: '/assets/dist',
    cliPath: '/assets/dist/cli.mjs',
    out: (text) => void output.push(text),
    err: (text) => void errors.push(text),
    spawn: ((command: string, args: readonly string[]) => {
      spawned.push({ command, args });
      const child = Object.assign(new EventEmitter(), { kill: () => true });
      queueMicrotask(() => child.emit('exit', 0));
      return child;
    }) as never,
    openBrowser: (url) => void opened.push(url),
    waitForStop: () => stopped,
    createService: (() => ({ server, store: {}, settings: {} })) as never,
    listen: async () => undefined,
    ...overrides
  };
  return Object.assign(deps, { output, errors, opened, spawned, stop: release, closed });
}

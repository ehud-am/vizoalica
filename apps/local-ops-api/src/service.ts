import type { spawn as spawnFn } from 'node:child_process';
import { spawn } from 'node:child_process';
import type { Server } from 'node:http';
import { defaultHomeDir, loadSettings, resolvePreferencesPath, type Settings } from './config.js';
import { Registry, type RegistryOptions } from './environments/registry.js';
import { Vault } from './environments/vault.js';
import { createLocalServer } from './server.js';
import { expectedSchemaFrom } from './setup/state.js';

export type ServiceOptions = {
  /** Holds `environments.json` and `preferences.json`. Defaults to `~/.config/vizoalica`. */
  homeDir?: string | undefined;
  consoleDir?: string | undefined;
  sdkDir?: string | undefined;
  schemaDir?: string | undefined;
  version?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  /** Replaces the session lifetime without the bounds the environment variable is held to (tests). */
  sessionTtlMs?: number | undefined;
  /** Tests replace how OneCLI helpers are started, how time passes, and the network. */
  spawn?: typeof spawnFn | undefined;
  registry?: Pick<RegistryOptions, 'load' | 'fetch' | 'verify' | 'ttlMs' | 'now'> | undefined;
};

/** Builds the local service. It starts with no usable environment; the console then says what to fix. */
export function createService(options: ServiceOptions = {}): {
  server: Server;
  registry: Registry;
  vault: Vault;
  settings: Settings;
} {
  const base = loadSettings(options.env ?? process.env);
  const homeDir = options.homeDir ?? defaultHomeDir();
  const settings: Settings = {
    ...base,
    homeDir,
    ...(options.sessionTtlMs !== undefined ? { sessionTtlMs: options.sessionTtlMs } : {})
  };
  const version = options.version ?? 'dev';
  const vault = new Vault(options.spawn ?? spawn);
  const registry = new Registry({
    homeDir,
    preferencesPath: resolvePreferencesPath(settings),
    version,
    expectedSchema: expectedSchemaFrom(options.schemaDir),
    vault,
    ...options.registry
  });
  const server = createLocalServer({
    settings,
    registry,
    version,
    consoleDir: options.consoleDir,
    sdkDir: options.sdkDir,
    schemaDir: options.schemaDir
  });
  server.on('close', () => vault.close());
  return { server, registry, vault, settings };
}

/** Listens on loopback only; rejects with `port_in_use` when something else holds the port. */
export function listenLoopback(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) =>
      reject(error.code === 'EADDRINUSE' ? new Error('port_in_use') : error)
    );
    server.listen(port, '127.0.0.1', () => resolve());
  });
}

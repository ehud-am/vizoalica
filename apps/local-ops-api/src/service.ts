import type { Server } from 'node:http';
import { defaultHomeDir, loadConfig, loadSettings, type Settings } from './config.js';
import { EnvironmentStore } from './environment-store.js';
import { createLocalServer } from './server.js';

export type ServiceOptions = {
  /** The environments home directory (holds `environments/` and `active-environment.json`). Without
   * one, and without VIZOALICA_REMOTE_URL/VIZOALICA_ADMIN_SECRET set, the default home directory is used. */
  homeDir?: string | undefined;
  consoleDir?: string | undefined;
  sdkDir?: string | undefined;
  schemaDir?: string | undefined;
  /** Where the packaged Worker bundle and its Wrangler config template live (`dist/worker`). */
  workerDir?: string | undefined;
  version?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
};

/**
 * Builds the local service from the environment and an environments home directory that may not exist
 * yet. Throws the store's plain error codes for an unreadable or over-permissive environment file.
 */
export function createService(options: ServiceOptions = {}): {
  server: Server;
  store: EnvironmentStore;
  settings: Settings;
} {
  const env = options.env ?? process.env;
  const base = loadSettings(env);
  let store: EnvironmentStore;
  let homeDir: string | undefined;
  if (env.VIZOALICA_REMOTE_URL && env.VIZOALICA_ADMIN_SECRET) {
    const config = loadConfig(env);
    store = EnvironmentStore.fromConnection('default', {
      remoteUrl: config.remoteUrl,
      credential: config.adminSecret,
      kind: 'admin-secret'
    });
  } else {
    homeDir = options.homeDir ?? defaultHomeDir();
    store = EnvironmentStore.fromDirectory(homeDir, env);
  }
  const settings: Settings = { ...base, ...(homeDir ? { homeDir } : {}) };
  const server = createLocalServer({
    settings,
    store,
    ...(options.version ? { version: options.version } : {}),
    consoleDir: options.consoleDir,
    sdkDir: options.sdkDir,
    schemaDir: options.schemaDir,
    workerDir: options.workerDir
  });
  return { server, store, settings };
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

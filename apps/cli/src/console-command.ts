import type { spawn as spawnFn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createService, listenLoopback } from '../../local-ops-api/src/service.js';

export const CONSOLE_ADDRESS = (port: number) => `http://127.0.0.1:${port}`;
const SILENCE_ENV_PROXY_WARNING = '--disable-warning=UNDICI-EHPA';
const PLACEHOLDER = 'onecli-managed';

export type ConsoleDeps = {
  env: NodeJS.ProcessEnv;
  home: string;
  version: string;
  /** Where the packaged console, SDK files, and database changes were unpacked (the dist folder). */
  assetDir: string;
  /** The path of the running command file, used to start the service again under OneCLI. */
  cliPath: string;
  out: (text: string) => void;
  err: (text: string) => void;
  spawn: typeof spawnFn;
  openBrowser: (url: string) => void;
  /** Resolves when the user asks the console to stop (an interrupt or terminate signal). */
  waitForStop: () => Promise<void>;
  /** Tests replace these; the defaults are the real service. */
  createService?: typeof createService;
  listen?: typeof listenLoopback;
};

type OpsSettings = { project: string; agent: string; gateway: string };

export function oneCliNodeOptions(existing: string | undefined): string {
  return [existing, SILENCE_ENV_PROXY_WARNING].filter(Boolean).join(' ');
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * The active environment's own connection file, or — before it has ever been named and imported as one
 * — the pre-0.7.0 single connection file `vizoalica console` still finds sitting under this home
 * directory. Checking the raw legacy file too (not only an already-named environment) matters
 * specifically for OneCLI mode: naming it as an environment is a console action, and the console itself
 * can only reach an OneCLI-managed backend once the whole process is already wrapped, so the wrap
 * decision has to be made from the file as found, before any import has happened.
 */
function activeEnvironmentConnection(homeDir: string): Record<string, unknown> | undefined {
  const pointer = readJson(join(homeDir, 'active-environment.json'));
  const active = pointer?.active;
  if (typeof active === 'string') {
    const connection = readJson(join(homeDir, 'environments', `${active}.json`));
    if (connection) return connection;
  }
  return readJson(join(homeDir, 'local-operations.json'));
}

/**
 * OneCLI mode for the active environment's administrator secret: its connection file holds only the
 * placeholder and `ops.json` names the gateway. Whichever environment is active when the console starts
 * decides whether the whole process is wrapped; switching to a different OneCLI-managed environment
 * later needs the console restarted to rewrap under that environment's own OneCLI settings (a known
 * limit for 0.7.0 — file-mode environments, and OneCLI-mode Cloudflare deploy credentials per
 * environment, are unaffected and can be switched freely without a restart).
 */
function oneCliSettings(homeDir: string): OpsSettings | undefined {
  const connection = activeEnvironmentConnection(homeDir);
  if (connection?.VIZOALICA_ADMIN_SECRET !== PLACEHOLDER) return undefined;
  const ops = readJson(join(homeDir, 'ops.json'));
  const onecli = ops?.onecli as Record<string, unknown> | undefined;
  return typeof onecli?.project === 'string' &&
    typeof onecli.agent === 'string' &&
    typeof onecli.gateway === 'string'
    ? { project: onecli.project, agent: onecli.agent, gateway: onecli.gateway }
    : undefined;
}

export function oneCliArguments(
  settings: OpsSettings,
  cliPath: string,
  homeDir: string,
  nodeOptions: string | undefined
) {
  return [
    'run',
    '--project',
    settings.project,
    '--agent',
    settings.agent,
    '--gateway',
    settings.gateway,
    '--',
    'env',
    'VIZOALICA_ONECLI_WRAPPED=1',
    `NODE_OPTIONS=${oneCliNodeOptions(nodeOptions)}`,
    process.execPath,
    cliPath,
    'serve',
    homeDir
  ];
}

/** The specific file that made the store throw: the active environment's, or the legacy single file
 * (the store validates the active environment first, before ever looking at a legacy file). */
function likelyBadFile(homeDir: string): string {
  const pointer = readJson(join(homeDir, 'active-environment.json'));
  if (typeof pointer?.active === 'string') {
    const path = join(homeDir, 'environments', `${pointer.active}.json`);
    if (existsSync(path)) return path;
  }
  return join(homeDir, 'local-operations.json');
}

/** A plain message for the ways a saved environment can be unusable, or undefined for anything else. */
function connectionProblem(error: unknown, homeDir: string): string | undefined {
  const code = error instanceof Error ? error.message : '';
  const path = likelyBadFile(homeDir);
  if (code === 'config_permissions_must_be_0600')
    return `The saved connection file can be read by other users, so it was not used:\n  ${path}\nMake it private and run this again:\n  chmod 600 ${path}`;
  if (code === 'invalid_connection_file')
    return `The saved connection file could not be read:\n  ${path}\nMove it aside and run this again to set up from scratch:\n  mv ${path} ${path}.bak`;
  if (code.startsWith('onecli_placeholder_requires_wrapper'))
    return 'This computer keeps the administrator secret in OneCLI, but the OneCLI settings were not found.\nRun the setup again from a source checkout (pnpm vizoalica setup), or remove the saved connection to start over.';
  return undefined;
}

function busyMessage(port: number): string {
  return `A console is probably running already. Open ${CONSOLE_ADDRESS(port)}, or stop it (Ctrl+C in its terminal) and run this again.`;
}

export type ConsoleOptions = { open: boolean };

/** `vizoalica console`: start the service and the console as one process. */
export async function consoleCommand(options: ConsoleOptions, deps: ConsoleDeps): Promise<number> {
  const homeDir = join(deps.home, '.config', 'vizoalica');
  const port = Number(deps.env.VIZOALICA_PORT ?? 4318);
  const address = CONSOLE_ADDRESS(port);
  const stopHint = 'Keep this terminal open; press Ctrl+C once to stop.';

  const oneCli = oneCliSettings(homeDir);
  if (oneCli) {
    deps.out(
      `Starting the console through OneCLI (${oneCli.gateway}).\nConsole: ${address}\n${stopHint}\n`
    );
    const child = deps.spawn(
      'onecli',
      oneCliArguments(oneCli, deps.cliPath, homeDir, deps.env.NODE_OPTIONS),
      {
        stdio: 'inherit'
      }
    );
    if (options.open) deps.openBrowser(address);
    const stop = () => child.kill('SIGTERM');
    void deps.waitForStop().then(stop);
    return new Promise<number>((resolve) => {
      child.once('error', () => {
        deps.err('OneCLI could not be started. Is it installed and on your PATH?');
        resolve(1);
      });
      child.once('exit', (code) => resolve(code ?? 0));
    });
  }

  let service: ReturnType<typeof createService>;
  try {
    service = (deps.createService ?? createService)({
      homeDir,
      consoleDir: join(deps.assetDir, 'console'),
      sdkDir: join(deps.assetDir, 'sdk'),
      schemaDir: join(deps.assetDir, 'schema'),
      version: deps.version,
      env: deps.env
    });
  } catch (error) {
    const message = connectionProblem(error, homeDir);
    if (!message) throw error;
    deps.err(`${message}\n`);
    return 1;
  }
  if (!existsSync(join(deps.assetDir, 'console')) && !deps.createService)
    deps.err(
      'Note: the console files were not found next to this command, so pages will not load.\n'
    );
  try {
    await (deps.listen ?? listenLoopback)(service.server, port);
  } catch (error) {
    if (error instanceof Error && error.message === 'port_in_use') {
      deps.err(`${busyMessage(port)}\n`);
      return 1;
    }
    throw error;
  }
  deps.out(`Vizoalica console: ${address}\n${stopHint}\n`);
  if (options.open) deps.openBrowser(address);
  await deps.waitForStop();
  await new Promise<void>((resolve) => {
    service.server.close(() => resolve());
    // A browser keeping a connection alive must not hold the command open.
    service.server.closeAllConnections();
  });
  return 0;
}

/** `vizoalica serve <home-dir>`: the service alone, used when OneCLI starts it. */
export async function serveCommand(
  homeDir: string | undefined,
  deps: ConsoleDeps
): Promise<number> {
  const port = Number(deps.env.VIZOALICA_PORT ?? 4318);
  let service: ReturnType<typeof createService>;
  try {
    service = (deps.createService ?? createService)({
      homeDir: homeDir ?? join(deps.home, '.config', 'vizoalica'),
      consoleDir: join(deps.assetDir, 'console'),
      sdkDir: join(deps.assetDir, 'sdk'),
      schemaDir: join(deps.assetDir, 'schema'),
      version: deps.version,
      env: deps.env
    });
  } catch (error) {
    const message = connectionProblem(error, homeDir ?? '(default environments directory)');
    deps.err(`${message ?? (error instanceof Error ? error.message : 'Could not start.')}\n`);
    return 1;
  }
  try {
    await (deps.listen ?? listenLoopback)(service.server, port);
  } catch (error) {
    deps.err(
      `${error instanceof Error && error.message === 'port_in_use' ? busyMessage(port) : 'Could not start.'}\n`
    );
    return 1;
  }
  await deps.waitForStop();
  service.server.close();
  service.server.closeAllConnections();
  return 0;
}

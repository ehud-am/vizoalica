#!/usr/bin/env node
import { createConnection } from 'node:net';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { formatReport, purgeDeleted } from './purge-deleted.js';
import { DEFAULT_NAMES } from './cli/backend.js';
import { setUpBackend } from './cli/backend.js';
import { connectConsole } from './cli/connect.js';
import { type Ctx, OpsError } from './cli/context.js';
import { addDemoData, removeDemoData } from './cli/demo.js';
import { rotateSecrets } from './cli/rotate.js';
import { parseSecretKind } from './cli/secrets.js';
import {
  buildRunner,
  clearScreen,
  noTerminalPrompter,
  openBrowser,
  terminalPrompter,
  wranglerRunner
} from './cli/terminal.js';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export type OpsConfig = {
  version: 1;
  workerUrl: string;
  consoleConfigPath: string;
  onecli: { project: string; agent: string; gateway: string };
  pages?: {
    siteDir: string;
    project: string;
    branch: string;
    assetsDir: string;
    origin?: string;
    analyticsProjectId?: string;
    sourceId?: string;
  };
};

type Options = Record<string, string | boolean>;
type Dependencies = {
  spawn: typeof spawn;
  spawnSync: typeof spawnSync;
  fetch: typeof fetch;
  isTTY: boolean;
  /** Builds the context for the guided commands; replaced in tests. */
  guided?: () => Ctx;
  /** Whether something already listens on a local port; replaced in tests. */
  portInUse?: (port: number) => Promise<boolean>;
};

const DEFAULT_CONFIG = join(homedir(), '.config', 'vizoalica', 'ops.json');
const DEFAULT_CLIENT_CONFIG = join(homedir(), '.config', 'vizoalica', 'local-operations.json');
const CONSOLE_URL = 'http://127.0.0.1:5173';
const FORBIDDEN = /(secret|token|password|authorization|api.?key)/i;

export function parseOptions(argv: readonly string[]): { command: string; options: Options } {
  const [command = 'help', ...rest] = argv;
  const options: Options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item?.startsWith('--')) throw new Error(`Unexpected argument: ${item ?? ''}`);
    const key = item.slice(2);
    if (!key || FORBIDDEN.test(key))
      throw new Error('Secret values are never accepted by pnpm vizoalica.');
    const next = rest[index + 1];
    if (next && !next.startsWith('--')) {
      options[key] = next;
      index += 1;
    } else options[key] = true;
  }
  return { command, options };
}

function text(options: Options, name: string): string | undefined {
  const value = options[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function normalizeWorkerUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Worker URL must start with https://.');
  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error('Worker URL must be an origin with no path, query, or fragment.');
  return url.origin;
}

export function parseGateway(value: string): { host: string; port: number } {
  const match = /^([^:/\s]+):(\d+)$/.exec(value);
  if (!match) throw new Error('Gateway must use host:port, for example 127.0.0.1:10255.');
  const port = Number(match[2]);
  if (port < 1 || port > 65535) throw new Error('Gateway port is invalid.');
  if (match[1] === 'gateway')
    throw new Error('gateway is a Docker-only hostname; use the host address, usually 127.0.0.1.');
  return { host: match[1]!, port };
}

function assertSafePath(path: string): string {
  const resolved = resolve(path);
  if (!isAbsolute(resolved) || resolved === '/' || resolved === homedir())
    throw new Error('Refusing an unsafe configuration path.');
  return resolved;
}

function resolvePagesAssets(siteDir: string, assetsDir: string): string {
  const site = assertSafePath(siteDir);
  if (isAbsolute(assetsDir))
    throw new Error('Pages asset folder must be relative to the website folder.');
  const assets = resolve(site, assetsDir);
  if (assets !== site && !assets.startsWith(`${site}${sep}`))
    throw new Error('Pages asset folder must stay inside the website folder.');
  return assets;
}

function writePrivateJson(path: string, value: unknown): void {
  const target = assertSafePath(path);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  chmodSync(dirname(target), 0o700);
  const temporary = join(dirname(target), `.${crypto.randomUUID()}.tmp`);
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  chmodSync(temporary, 0o600);
  renameSync(temporary, target);
}

function loadOpsConfig(path = DEFAULT_CONFIG): OpsConfig {
  const target = assertSafePath(path);
  const mode = statSync(target).mode & 0o777;
  if ((mode & 0o077) !== 0) throw new Error(`Configuration must be private (chmod 600 ${target}).`);
  const value = JSON.parse(readFileSync(target, 'utf8')) as OpsConfig;
  if (value.version !== 1 || !value.onecli?.project || !value.onecli.agent)
    throw new Error('Ops configuration is incomplete; run pnpm vizoalica setup.');
  normalizeWorkerUrl(value.workerUrl);
  parseGateway(value.onecli.gateway);
  return value;
}

export function validateConsoleConfig(path: string, workerUrl: string): boolean {
  try {
    const mode = statSync(path).mode & 0o777;
    if ((mode & 0o077) !== 0) return false;
    const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    return (
      value.VIZOALICA_REMOTE_URL === workerUrl && value.VIZOALICA_ADMIN_SECRET === 'onecli-managed'
    );
  } catch {
    return false;
  }
}

type ClientConfig = {
  path: string;
  workerUrl: string;
  adminSecret: string;
  permissions: string;
  mode: 'OneCLI' | 'private local file';
};

function loadClientConfig(path: string): ClientConfig {
  const target = assertSafePath(path);
  const permissions = statSync(target).mode & 0o777;
  if ((permissions & 0o077) !== 0)
    throw new Error(`Configuration must be private (chmod 600 ${target}).`);
  const value = JSON.parse(readFileSync(target, 'utf8')) as Record<string, unknown>;
  if (
    typeof value.VIZOALICA_REMOTE_URL !== 'string' ||
    typeof value.VIZOALICA_ADMIN_SECRET !== 'string' ||
    !value.VIZOALICA_ADMIN_SECRET.trim()
  )
    throw new Error(`Client configuration is incomplete: ${target}`);
  return {
    path: target,
    workerUrl: normalizeWorkerUrl(value.VIZOALICA_REMOTE_URL),
    adminSecret: value.VIZOALICA_ADMIN_SECRET,
    permissions: permissions.toString(8).padStart(4, '0'),
    mode: value.VIZOALICA_ADMIN_SECRET === 'onecli-managed' ? 'OneCLI' : 'private local file'
  };
}

function resolveClientConfig(options: Options): { client: ClientConfig; ops?: OpsConfig } {
  const explicitClientPath = text(options, 'console-config');
  const opsPath = text(options, 'config') ?? DEFAULT_CONFIG;
  let ops: OpsConfig | undefined;
  if (text(options, 'config')) ops = loadOpsConfig(opsPath);
  let clientPath = explicitClientPath ?? ops?.consoleConfigPath ?? DEFAULT_CLIENT_CONFIG;
  if (!existsSync(clientPath) && existsSync(opsPath)) {
    ops ??= loadOpsConfig(opsPath);
    clientPath = explicitClientPath ?? ops.consoleConfigPath;
  }
  const client = loadClientConfig(clientPath);
  if (client.mode === 'OneCLI') {
    if (!ops && existsSync(opsPath)) ops = loadOpsConfig(opsPath);
    if (!ops)
      throw new Error(
        'OneCLI settings are missing; run pnpm vizoalica setup or pass --config <path>.'
      );
    if (ops.workerUrl !== client.workerUrl)
      throw new Error('The OneCLI and client configurations name different Workers.');
  }
  return { client, ...(ops ? { ops } : {}) };
}

async function ask(
  prompt: ReturnType<typeof createInterface>,
  label: string,
  fallback?: string
): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : '';
  const value = (await prompt.question(`${label}${suffix}: `)).trim() || fallback;
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

async function askOptional(
  prompt: ReturnType<typeof createInterface>,
  label: string,
  fallback = ''
): Promise<string | undefined> {
  const suffix = fallback ? ` [${fallback}]` : ' [skip]';
  return (await prompt.question(`${label}${suffix}: `)).trim() || fallback || undefined;
}

async function askYesNo(
  prompt: ReturnType<typeof createInterface>,
  label: string,
  fallback = false
): Promise<boolean> {
  const answer = (await prompt.question(`${label} [${fallback ? 'Y/n' : 'y/N'}]: `))
    .trim()
    .toLowerCase();
  if (!answer) return fallback;
  return answer === 'y' || answer === 'yes';
}

function setupHelp(): string {
  return [
    'pnpm vizoalica setup needs:',
    '  --worker-url  Cloudflare dashboard → Workers & Pages → ingestion Worker → workers.dev URL',
    '  --project     OneCLI dashboard → project slug',
    '  --agent       OneCLI dashboard → dedicated console agent identifier',
    'Optional Pages settings:',
    '  --site-dir --pages-project --branch --assets-dir --site-origin --analytics-project --source-id',
    'No secret is accepted. Put the raw administrator secret only in OneCLI.'
  ].join('\n');
}

async function setup(options: Options, dependencies: Dependencies): Promise<void> {
  const interactive = dependencies.isTTY;
  const prompt = interactive ? createInterface({ input: stdin, output: stdout }) : undefined;
  try {
    const obtain = async (name: string, label: string, fallback?: string) =>
      text(options, name) ?? (prompt ? ask(prompt, label, fallback) : fallback);
    const worker = await obtain('worker-url', 'Worker HTTPS origin');
    const project = await obtain('project', 'OneCLI project slug');
    const agent = await obtain('agent', 'OneCLI console agent identifier');
    if (!worker || !project || !agent)
      throw new Error(`${setupHelp()}\nMissing required settings.`);
    const gateway = (await obtain('gateway', 'Host-reachable OneCLI gateway', '127.0.0.1:10255'))!;
    const configPath = assertSafePath(text(options, 'config') ?? DEFAULT_CONFIG);
    const consoleConfigPath = assertSafePath(
      text(options, 'console-config') ?? DEFAULT_CLIENT_CONFIG
    );

    let siteDir = text(options, 'site-dir');
    let pagesProject = text(options, 'pages-project');
    let branch = text(options, 'branch');
    let assetsDir = text(options, 'assets-dir');
    let siteOrigin = text(options, 'site-origin');
    let analyticsProject = text(options, 'analytics-project');
    let sourceId = text(options, 'source-id');

    const configurePages =
      Boolean(siteDir || pagesProject) ||
      Boolean(prompt && (await askYesNo(prompt, 'Configure a Cloudflare Pages website now?')));
    if (configurePages && prompt) {
      siteDir ??= await ask(prompt, 'Website folder (contains the assets and functions/)');
      pagesProject ??= await ask(
        prompt,
        'Cloudflare Pages project name (Workers & Pages → your site)'
      );
      branch ??= await ask(prompt, 'Production branch', 'main');
      assetsDir ??= await ask(
        prompt,
        'Asset folder relative to the website folder (use . when index.html is at its root)',
        'public'
      );
      siteOrigin ??= await askOptional(prompt, 'Production https:// origin for verification');
      analyticsProject ??= await askOptional(
        prompt,
        'Analytics Project ID (console → Integration snippet)'
      );
      sourceId ??= await askOptional(
        prompt,
        'Internal Source ID (console → Integration snippet; not the public source key)'
      );
    }
    if ((siteDir && !pagesProject) || (!siteDir && pagesProject))
      throw new Error('--site-dir and --pages-project must be supplied together.');

    const parsedGateway = parseGateway(gateway);
    if (siteDir && pagesProject) resolvePagesAssets(siteDir, assetsDir ?? 'public');

    const value: OpsConfig = {
      version: 1,
      workerUrl: normalizeWorkerUrl(worker),
      consoleConfigPath,
      onecli: { project, agent, gateway: `${parsedGateway.host}:${parsedGateway.port}` },
      ...(siteDir && pagesProject
        ? {
            pages: {
              siteDir: assertSafePath(siteDir),
              project: pagesProject,
              branch: branch ?? 'main',
              assetsDir: assetsDir ?? 'public',
              ...(siteOrigin ? { origin: siteOrigin } : {}),
              ...(analyticsProject ? { analyticsProjectId: analyticsProject } : {}),
              ...(sourceId ? { sourceId } : {})
            }
          }
        : {})
    };

    if (
      existsSync(consoleConfigPath) &&
      !validateConsoleConfig(consoleConfigPath, value.workerUrl) &&
      options.replace !== true
    ) {
      throw new Error(
        `Refusing to replace an existing client configuration. Review ${consoleConfigPath}, then rerun with --replace if intentional.`
      );
    }

    writePrivateJson(configPath, value);
    writePrivateJson(consoleConfigPath, {
      VIZOALICA_REMOTE_URL: value.workerUrl,
      VIZOALICA_ADMIN_SECRET: 'onecli-managed'
    });
    stdout.write(
      [
        '',
        '✓ Saved non-secret operations settings.',
        '✓ Saved the OneCLI placeholder client configuration.',
        '',
        'OneCLI dashboard card (do this once):',
        `  Host: ${new URL(value.workerUrl).host}`,
        '  Header: Authorization',
        '  Format: Bearer {value}',
        '  Value: raw VIZOALICA_ADMIN_SECRET, without the word Bearer',
        `  Attach it only to agent: ${value.onecli.agent}`,
        '',
        'Next: pnpm vizoalica doctor, pnpm vizoalica verify, then pnpm vizoalica console'
      ].join('\n') + '\n'
    );
  } finally {
    prompt?.close();
  }
}

async function gatewayReachable(value: string): Promise<boolean> {
  const { host, port } = parseGateway(value);
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host, port });
    const finish = (result: boolean) => {
      socket.destroy();
      resolvePromise(result);
    };
    socket.setTimeout(1500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function portOccupied(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (result: boolean) => {
      socket.destroy();
      resolvePromise(result);
    };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function doctor(options: Options, dependencies: Dependencies): Promise<void> {
  const config = loadOpsConfig(text(options, 'config'));
  const onecli = dependencies.spawnSync('onecli', ['version'], { encoding: 'utf8' });
  const gateway = await gatewayReachable(config.onecli.gateway);
  const health = await dependencies
    .fetch(`${config.workerUrl}/healthz`, { signal: AbortSignal.timeout(5000) })
    .then((response) => response.ok)
    .catch(() => false);
  const checks = [
    ['Node 22+', Number(process.versions.node.split('.')[0]) >= 22],
    ['OneCLI installed', onecli.status === 0],
    [`Gateway reachable (${config.onecli.gateway})`, gateway],
    [
      'Private OneCLI placeholder configuration is valid',
      validateConsoleConfig(config.consoleConfigPath, config.workerUrl)
    ],
    ['Worker health endpoint', health]
  ] as const;
  for (const [label, ok] of checks) stdout.write(`${ok ? '✓' : '✗'} ${label}\n`);
  if (checks.some(([, ok]) => !ok)) {
    stdout.write(
      '\nFix failed checks, then rerun pnpm vizoalica doctor. No secret values were inspected.\n'
    );
    process.exitCode = 1;
  } else stdout.write('\nReady. Run: pnpm vizoalica console\n');
}

/**
 * Under `onecli run`, proxy settings are injected into the environment and Node's built-in fetch
 * then prints "UNDICI-EHPA: EnvHttpProxyAgent is experimental" on every start. It is expected here,
 * so exactly that one warning is silenced in processes launched through OneCLI. Nothing else is.
 */
export const SILENCE_ENV_PROXY_WARNING = '--disable-warning=UNDICI-EHPA';

/** The caller's own NODE_OPTIONS, kept, plus the flag above. */
export function oneCliNodeOptions(existing = process.env.NODE_OPTIONS): string {
  return [existing, SILENCE_ENV_PROXY_WARNING].filter(Boolean).join(' ');
}

export function verifyArguments(config: OpsConfig): string[] {
  return [
    'run',
    '--project',
    config.onecli.project,
    '--agent',
    config.onecli.agent,
    '--gateway',
    config.onecli.gateway,
    '--',
    'node',
    SILENCE_ENV_PROXY_WARNING,
    '--import',
    'tsx',
    'scripts/verify-operator-access.ts',
    config.workerUrl
  ];
}

async function verifyAccess(options: Options, dependencies: Dependencies): Promise<void> {
  const { client, ops } = resolveClientConfig(options);
  if (client.mode === 'OneCLI') {
    const result = dependencies.spawnSync('onecli', verifyArguments(ops!), { stdio: 'inherit' });
    if (result.status !== 0)
      throw new Error(
        'Authenticated access failed. Check the Worker identity, credential card, and agent grant.'
      );
    stdout.write(
      `Verified through OneCLI agent ${ops!.onecli.agent}; no credential was printed.\n`
    );
    return;
  }
  const response = await dependencies.fetch(`${client.workerUrl}/v1/admin/projects`, {
    headers: { authorization: `Bearer ${client.adminSecret}` },
    signal: AbortSignal.timeout(10_000)
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (response.status !== 200 || !Array.isArray(body))
    throw new Error(`Authenticated project check failed with HTTP ${response.status}.`);
  stdout.write(
    'Verified with the private local file (HTTP 200, JSON array); no credential was printed.\n'
  );
}

export function purgeArguments(config: OpsConfig, apply: boolean): string[] {
  return [
    ...verifyArguments(config).slice(0, -2),
    'scripts/purge-deleted.ts',
    config.workerUrl,
    ...(apply ? ['--apply'] : [])
  ];
}

async function purgeDeletedData(options: Options, dependencies: Dependencies): Promise<void> {
  const { client, ops } = resolveClientConfig(options);
  const apply = options.apply === true;
  if (client.mode === 'OneCLI') {
    const result = dependencies.spawnSync('onecli', purgeArguments(ops!, apply), {
      stdio: 'inherit'
    });
    if (result.status !== 0) throw new Error('Purge failed; nothing further was attempted.');
    return;
  }
  const reports = await purgeDeleted(
    client.workerUrl,
    `Bearer ${client.adminSecret}`,
    apply,
    dependencies.fetch
  );
  stdout.write(formatReport(reports));
}

/**
 * Builds the context for the guided commands. Commands that ask questions or generate secrets need a
 * terminal, because failing at the first question could lose secrets that were never shown; a command
 * that asks nothing (like `demo --remove`) passes needsTerminal: false and can run in a script.
 */
function guidedContext(
  dependencies: Dependencies,
  { needsTerminal = true }: { needsTerminal?: boolean } = {}
): Ctx {
  if (dependencies.guided) return dependencies.guided();
  if (needsTerminal && !dependencies.isTTY)
    throw new OpsError('This command asks questions, so run it in an interactive terminal.');
  return {
    run: wranglerRunner(process.cwd()),
    prompt: dependencies.isTTY ? terminalPrompter() : noTerminalPrompter,
    fetch: dependencies.fetch,
    out: (text) => void stdout.write(`${text}\n`),
    cwd: process.cwd(),
    build: buildRunner(process.cwd()),
    sleep: (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
    clear: clearScreen
  };
}

function backendOptions(options: Options) {
  return {
    worker: text(options, 'worker-name') ?? DEFAULT_NAMES.worker,
    database: text(options, 'database') ?? DEFAULT_NAMES.database,
    bucket: text(options, 'bucket') ?? DEFAULT_NAMES.bucket,
    ...(options['first-run'] === true
      ? { firstRun: true }
      : options.update === true
        ? { firstRun: false }
        : {})
  };
}

const localConfigPath = (options: Options): string =>
  assertSafePath(text(options, 'console-config') ?? DEFAULT_CLIENT_CONFIG);

/** Reads the administrator secret from the private local file, for commands that call the Worker directly. */
function localAdmin(options: Options): { workerUrl: string; adminSecret: string } {
  const client = loadClientConfig(localConfigPath(options));
  if (client.mode === 'OneCLI')
    throw new OpsError(
      'This computer keeps the administrator secret in OneCLI, so this command cannot use it directly.\nUse the console instead, or run the command on a computer with the direct credential.'
    );
  return { workerUrl: client.workerUrl, adminSecret: client.adminSecret };
}

async function backendCommand(options: Options, dependencies: Dependencies): Promise<void> {
  const ctx = guidedContext(dependencies);
  const result = await setUpBackend(ctx, backendOptions(options));
  ctx.out(`\nWorker: ${result.workerUrl}`);
  ctx.out(
    result.firstRun
      ? 'Next: pnpm vizoalica connect   (set up this computer as an operator console)'
      : 'Updated.'
  );
}

async function connectCommand(options: Options, dependencies: Dependencies): Promise<void> {
  const ctx = guidedContext(dependencies);
  const workerUrl = text(options, 'worker-url');
  await connectConsole(ctx, {
    configPath: localConfigPath(options),
    ...(workerUrl ? { workerUrl } : {})
  });
  ctx.out('Next: pnpm vizoalica console');
}

async function demoCommand(options: Options, dependencies: Dependencies): Promise<void> {
  const ctx = guidedContext(dependencies, { needsTerminal: options.remove !== true });
  const admin = localAdmin(options);
  if (options.remove === true) {
    await removeDemoData(ctx, admin);
    return;
  }
  const tokenSecret = await ctx.prompt.hidden(
    'Paste the token secret (VIZOALICA_TOKEN_SECRET) — nothing is shown as you type: '
  );
  await addDemoData(ctx, { ...admin, tokenSecret });
  ctx.out(
    'Next: pnpm vizoalica console   (remove the sample later with: pnpm vizoalica demo --remove)'
  );
}

async function rotateCommand(
  kind: string | undefined,
  options: Options,
  dependencies: Dependencies
): Promise<void> {
  const parsed = parseSecretKind(kind);
  if (!parsed) throw new OpsError('Usage: pnpm vizoalica rotate <admin|token|digest|all>');
  await rotateSecrets(guidedContext(dependencies), {
    kind: parsed,
    localConfigPath: localConfigPath(options)
  });
}

function installCommand(): never {
  throw new OpsError(
    'vizoalica install was retired. Add an environment with `vizoalica env add <name>`, then run `vizoalica console`.',
    2
  );
}

async function status(options: Options, dependencies: Dependencies): Promise<void> {
  const { client, ops } = resolveClientConfig(options);
  const [apiPort, webPort, publicHealth] = await Promise.all([
    portOccupied(4318),
    portOccupied(5173),
    dependencies
      .fetch(`${client.workerUrl}/healthz`, { signal: AbortSignal.timeout(5000) })
      .then((response) => response.ok)
      .catch(() => false)
  ]);
  let authenticated = false;
  if (client.mode === 'OneCLI') {
    authenticated =
      dependencies.spawnSync('onecli', verifyArguments(ops!), { stdio: 'ignore' }).status === 0;
  } else {
    authenticated = await dependencies
      .fetch(`${client.workerUrl}/v1/admin/projects`, {
        headers: { authorization: `Bearer ${client.adminSecret}` },
        signal: AbortSignal.timeout(10_000)
      })
      .then(async (response) => response.status === 200 && Array.isArray(await response.json()))
      .catch(() => false);
  }
  stdout.write(
    [
      `Credential mode: ${client.mode}`,
      `Worker hostname: ${new URL(client.workerUrl).hostname}`,
      `Config file: ${client.path} (${client.permissions})`,
      'Expected startup: pnpm vizoalica console (environments: pnpm vizoalica env)',
      `Port 4318 occupied: ${apiPort ? 'yes' : 'no'}`,
      `Port 5173 occupied: ${webPort ? 'yes' : 'no'}`,
      `Public health: ${publicHealth ? 'passed' : 'failed'}`,
      `Authenticated access: ${authenticated ? 'passed' : 'failed'}`
    ].join('\n') + '\n'
  );
}

async function runConsole(options: Options, dependencies: Dependencies): Promise<void> {
  // A second console cannot bind the same ports and would die with a raw EADDRINUSE trace.
  const inUse = dependencies.portInUse ?? portOccupied;
  const busy = (
    await Promise.all([4318, 5173].map(async (port) => ((await inUse(port)) ? port : 0)))
  ).filter(Boolean);
  if (busy.length > 0)
    throw new OpsError(
      `${busy.length > 1 ? 'Ports' : 'Port'} ${busy.join(' and ')} ${busy.length > 1 ? 'are' : 'is'} already in use, so a console is probably running already.\nOpen ${CONSOLE_URL}, or stop the other console first (Ctrl+C in its terminal) and run this again.`
    );
  stdout.write(
    'Starting the private API and the web console. Environments come from ~/.config/vizoalica/environments.json (manage them with: pnpm vizoalica env).\n' +
      `Console: ${CONSOLE_URL}\n` +
      'Keep this terminal open; press Ctrl+C once to stop both processes.\n'
  );
  if (options.open === true) setTimeout(() => openBrowser(CONSOLE_URL), 3000);
  const children: ChildProcess[] = [
    dependencies.spawn('pnpm', ['local-ops-api:dev'], { stdio: 'inherit' }),
    dependencies.spawn('pnpm', ['admin-web:dev'], { stdio: 'inherit' })
  ];
  const stop = () => children.forEach((child) => child.kill('SIGTERM'));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await Promise.race(
    children.map(
      (child) =>
        new Promise<void>((resolvePromise, reject) => {
          child.once('error', reject);
          child.once('exit', (code) =>
            code === 0 || code === null
              ? resolvePromise()
              : reject(new Error(`Process exited with ${code}.`))
          );
        })
    )
  ).finally(stop);
}

export function pagesDeployArguments(config: OpsConfig): string[] {
  if (!config.pages)
    throw new Error('Pages settings are missing; rerun pnpm vizoalica setup with them.');
  return [
    'exec',
    'wrangler',
    'pages',
    'deploy',
    config.pages.assetsDir,
    '--cwd',
    config.pages.siteDir,
    '--project-name',
    config.pages.project,
    '--branch',
    config.pages.branch
  ];
}

async function deployPages(options: Options, dependencies: Dependencies): Promise<void> {
  const config = loadOpsConfig(text(options, 'config'));
  if (!config.pages)
    throw new Error('Pages settings are missing; rerun pnpm vizoalica setup with them.');
  const assets = resolvePagesAssets(config.pages.siteDir, config.pages.assetsDir);
  if (!existsSync(assets)) throw new Error(`Pages asset directory does not exist: ${assets}`);
  if (!existsSync(join(config.pages.siteDir, 'functions')))
    throw new Error(
      `Pages functions directory does not exist: ${join(config.pages.siteDir, 'functions')}`
    );
  stdout.write(
    [
      'Cloudflare Pages deployment plan:',
      `  Website: ${assets}`,
      `  Functions: ${join(config.pages.siteDir, 'functions')}`,
      `  Project: ${config.pages.project}`,
      `  Branch: ${config.pages.branch}`,
      '  Authentication: native Wrangler (OneCLI is not used for this upload)'
    ].join('\n') + '\n'
  );
  if (text(options, 'confirm') !== config.pages.project)
    throw new Error(`No changes made. Rerun with --confirm ${config.pages.project}.`);

  stdout.write(
    `Deploying ${assets} plus sibling functions/ to Pages project ${config.pages.project} (${config.pages.branch}).\n`
  );
  const auth = dependencies.spawnSync('pnpm', ['exec', 'wrangler', 'whoami'], {
    stdio: 'inherit'
  });
  if (auth.status !== 0) throw new Error('Wrangler authentication failed.');
  const deployed = dependencies.spawnSync('pnpm', pagesDeployArguments(config), {
    stdio: 'inherit'
  });
  if (deployed.status !== 0) throw new Error('Pages deployment failed.');

  const { origin, analyticsProjectId, sourceId } = config.pages;
  if (origin && analyticsProjectId && sourceId) {
    const verified = dependencies.spawnSync(
      'pnpm',
      ['website:verify', '--', origin, analyticsProjectId, sourceId],
      { stdio: 'inherit' }
    );
    if (verified.status !== 0)
      throw new Error('Pages deployed, but Vizoalica verification failed.');
  } else {
    stdout.write(
      'Deployment finished. Add site-origin, analytics-project, and source-id to enable automatic verification.\n'
    );
  }
}

export function help(): string {
  const rows = (entries: Array<[string, string]>): string[] => {
    const width = Math.max(...entries.map(([command]) => command.length));
    return entries.map(
      ([command, description]) => `  pnpm vizoalica ${command.padEnd(width)}  ${description}`
    );
  };
  return [
    'Vizoalica operations',
    '',
    'Get going',
    ...rows([
      ['env', 'List, add, update, remove, and check environments (dev, stage, prod)'],
      ['deploy', 'Create a backend for an environment in your Cloudflare account (--apply)'],
      ['console', 'Start the private API and the web console (alias: run)'],
      ['backend', 'Install or update the Cloudflare backend (asks first install or update)'],
      ['connect', 'Set up this computer as an operator console for an existing backend'],
      ['demo', 'Add sample data (--remove deletes it)']
    ]),
    '',
    'Look after it',
    ...rows([
      ['rotate <admin|token|digest|all>', 'Replace a secret and show the new value once'],
      ['purge-deleted', 'Dry-run; add --apply to permanently remove deleted websites/projects'],
      ['status', 'Report the credential mode, ports, and access checks'],
      ['verify', 'Verify authenticated project access'],
      ['deploy-pages', 'Deploy a Direct Upload site with native Wrangler, then verify it']
    ]),
    '',
    'OneCLI (optional, keeps the administrator secret out of a local file)',
    ...rows([
      ['setup', 'Save the non-secret OneCLI settings'],
      ['doctor', 'Check OneCLI, the host gateway, client config, and Worker health']
    ]),
    '',
    'Secrets are never accepted as arguments. Use --config <path> for another non-secret config,',
    '--console-config <path> for another private console file, and "pnpm vizoalica show" for parameter sources.'
  ].join('\n');
}

function show(): string {
  return [
    'Three lanes; never mix their credentials:',
    '',
    '1. Worker + D1 + R2 → pnpm deploy:* (native Wrangler by default; approval-gated OneCLI profile optional)',
    '2. Website on Pages → pnpm vizoalica deploy-pages (native Wrangler; never inside onecli run)',
    '3. Local console → pnpm vizoalica console (OneCLI injects only the Worker administrator header)',
    '',
    setupHelp(),
    '',
    'Pages values:',
    '  site-dir          local website root containing public/ and functions/',
    '  pages-project     Cloudflare dashboard → Workers & Pages → project name',
    '  branch            Pages project production branch (usually main)',
    '  site-origin       stable production https://…pages.dev origin',
    '  analytics-project local console → Integration snippet → Project ID',
    '  source-id         local console → Integration snippet → Source ID (not public source key)'
  ].join('\n');
}

const dependencies: Dependencies = {
  spawn,
  spawnSync,
  fetch,
  isTTY: Boolean(stdin.isTTY && stdout.isTTY)
};

/**
 * `env` and `deploy` take their own words and options, so they get the raw arguments; they are the packaged
 * command's code, run from the checkout (`deploy` needs `pnpm package:build` first, for the Worker files).
 */
async function packagedCommand(command: 'env' | 'deploy', argv: readonly string[]): Promise<void> {
  const { envCommand } = await import('../apps/cli/src/env-command.js');
  const { deployCommand } = await import('../apps/cli/src/deploy-command.js');
  const { Cancelled, terminalAsk } = await import('../apps/cli/src/prompt.js');
  const { makeTrace } = await import('../apps/local-ops-api/src/trace.js');
  const { Vault } = await import('../apps/local-ops-api/src/environments/vault.js');
  const vault = new Vault(spawn);
  const version = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version;
  const args = argv.filter((item) => item !== '--verbose');
  const out = (message: string) => void stdout.write(message);
  const trace = args.length < argv.length ? makeTrace(out) : undefined;
  trace?.(`vizoalica ${version} (checkout), Node.js ${process.versions.node}, ${process.platform}`);
  trace?.(`Command: ${command} ${args.join(' ')}`);
  const deps = {
    home: homedir(),
    version,
    assetDir: resolve('apps', 'cli', 'package', 'dist'),
    env: process.env,
    out,
    err: (message: string) => void process.stderr.write(message),
    interactive: Boolean(stdin.isTTY && stdout.isTTY),
    ask: terminalAsk(),
    readStdin: async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString('utf8');
    },
    vault,
    ...(trace ? { trace } : {})
  };
  const deploy = (deployArgs: readonly string[]) => deployCommand(deployArgs, deps);
  try {
    process.exitCode =
      command === 'env' ? await envCommand(args, { ...deps, deploy }) : await deploy(args);
  } catch (error) {
    if (!(error instanceof Cancelled)) throw error;
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 130;
  } finally {
    vault.close();
  }
}

export async function run(argv: readonly string[], injected = dependencies): Promise<void> {
  if (argv[0] === 'env' || argv[0] === 'deploy') return packagedCommand(argv[0], argv.slice(1));
  if (argv[0] === 'rotate') {
    // `rotate` takes one positional word (admin, token, digest, or all) before any flags.
    const kind = argv[1]?.startsWith('--') ? undefined : argv[1];
    const { options } = parseOptions(['rotate', ...argv.slice(kind === undefined ? 1 : 2)]);
    await rotateCommand(kind, options, injected);
    return;
  }
  const { command, options } = parseOptions(argv);
  if (command === 'help' || options.help === true) stdout.write(`${help()}\n`);
  else if (command === 'show') stdout.write(`${show()}\n`);
  else if (command === 'setup') await setup(options, injected);
  else if (command === 'doctor') await doctor(options, injected);
  else if (command === 'verify') await verifyAccess(options, injected);
  else if (command === 'purge-deleted') await purgeDeletedData(options, injected);
  else if (command === 'status') await status(options, injected);
  else if (command === 'install') installCommand();
  else if (command === 'backend') await backendCommand(options, injected);
  else if (command === 'connect') await connectCommand(options, injected);
  else if (command === 'demo') await demoCommand(options, injected);
  else if (command === 'console' || command === 'run') await runConsole(options, injected);
  else if (command === 'deploy-pages') await deployPages(options, injected);
  else throw new Error(`Unknown command: ${command}\n\n${help()}`);
}

/** Runs the command line and turns any failure into a plain message and a non-zero exit code. */
export async function main(argv: readonly string[]): Promise<void> {
  try {
    await run(argv);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Operation failed.'}\n`);
    process.exitCode = error instanceof OpsError ? error.exitCode : 1;
  }
}

if (process.argv[1]?.endsWith('/scripts/vizoalica.ts')) await main(process.argv.slice(2));

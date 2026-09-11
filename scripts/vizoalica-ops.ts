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
};

const DEFAULT_CONFIG = join(homedir(), '.config', 'vizoalica', 'ops.json');
const DEFAULT_CLIENT_CONFIG = join(homedir(), '.config', 'vizoalica', 'local-operations.json');
const FORBIDDEN = /(secret|token|password|authorization|api.?key)/i;

export function parseOptions(argv: readonly string[]): { command: string; options: Options } {
  const [command = 'help', ...rest] = argv;
  const options: Options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (!item?.startsWith('--')) throw new Error(`Unexpected argument: ${item ?? ''}`);
    const key = item.slice(2);
    if (!key || FORBIDDEN.test(key))
      throw new Error('Secret values are never accepted by pnpm ops.');
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

export function loadOpsConfig(path = DEFAULT_CONFIG): OpsConfig {
  const target = assertSafePath(path);
  const mode = statSync(target).mode & 0o777;
  if ((mode & 0o077) !== 0) throw new Error(`Configuration must be private (chmod 600 ${target}).`);
  const value = JSON.parse(readFileSync(target, 'utf8')) as OpsConfig;
  if (value.version !== 1 || !value.onecli?.project || !value.onecli.agent)
    throw new Error('Ops configuration is incomplete; run pnpm ops setup.');
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
    'pnpm ops setup needs:',
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
        'Next: pnpm ops doctor, then pnpm ops run'
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
      '\nFix failed checks, then rerun pnpm ops doctor. No secret values were inspected.\n'
    );
    process.exitCode = 1;
  } else stdout.write('\nReady. Run: pnpm ops run\n');
}

export function consoleArguments(config: OpsConfig): string[] {
  return [
    'run',
    '--project',
    config.onecli.project,
    '--agent',
    config.onecli.agent,
    '--gateway',
    config.onecli.gateway,
    '--',
    'pnpm',
    'local-ops-api:dev',
    'serve',
    config.consoleConfigPath
  ];
}

async function runConsole(options: Options, dependencies: Dependencies): Promise<void> {
  const config = loadOpsConfig(text(options, 'config'));
  stdout.write(
    `Starting the private API through OneCLI (${config.onecli.gateway}) and the web console.\n` +
      'Keep this terminal open; press Ctrl+C once to stop both processes.\n'
  );
  const children: ChildProcess[] = [
    dependencies.spawn('onecli', consoleArguments(config), { stdio: 'inherit' }),
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
  if (!config.pages) throw new Error('Pages settings are missing; rerun pnpm ops setup with them.');
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
  if (!config.pages) throw new Error('Pages settings are missing; rerun pnpm ops setup with them.');
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
  return [
    'Vizoalica operations — one command for the common path',
    '',
    '  pnpm ops setup          Save non-secret Worker, OneCLI, and optional Pages settings',
    '  pnpm ops doctor         Check OneCLI, the host gateway, client config, and Worker health',
    '  pnpm ops run            Start the OneCLI-wrapped API and web console together',
    '  pnpm ops deploy-pages   Deploy a Direct Upload site with native Wrangler, then verify it',
    '  pnpm ops show           Show parameter locations and the safe operating model',
    '',
    'Run pnpm ops show before setup. Use --config <path> to select another non-secret config.',
    'Worker/D1/R2 deployment keeps the approval-gated pnpm deploy:plan/check/apply workflow.'
  ].join('\n');
}

function show(): string {
  return [
    'Three lanes; never mix their credentials:',
    '',
    '1. Worker + D1 + R2 → pnpm deploy:* (native Wrangler by default; approval-gated OneCLI profile optional)',
    '2. Website on Pages → pnpm ops deploy-pages (native Wrangler; never inside onecli run)',
    '3. Local console → pnpm ops run (OneCLI injects only the Worker administrator header)',
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

export async function run(argv: readonly string[], injected = dependencies): Promise<void> {
  const { command, options } = parseOptions(argv);
  if (command === 'help' || options.help === true) stdout.write(`${help()}\n`);
  else if (command === 'show') stdout.write(`${show()}\n`);
  else if (command === 'setup') await setup(options, injected);
  else if (command === 'doctor') await doctor(options, injected);
  else if (command === 'run') await runConsole(options, injected);
  else if (command === 'deploy-pages') await deployPages(options, injected);
  else throw new Error(`Unknown command: ${command}\n\n${help()}`);
}

const isEntryPoint = process.argv[1]?.endsWith('/scripts/vizoalica-ops.ts');
if (isEntryPoint) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Operation failed.'}\n`);
    process.exitCode = 1;
  });
}

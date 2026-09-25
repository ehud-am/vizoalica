import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  SECRETS,
  SECRET_KINDS,
  generateSecrets,
  parseAccounts,
  parseBuckets,
  parseDatabases,
  parseWorkerUrl,
  renderProductionConfig,
  type Run,
  type SecretKind
} from '@vizoalica/ops-core';
import { noTrace, type Trace } from '../../../local-ops-api/src/trace.js';
import { explain } from './explain.js';
import type { DeployPlan } from './plan.js';

export type ApplyDeps = {
  run: Run;
  /** The packaged Worker bundle and Wrangler template, and the packaged migrations directory. */
  workerBundle: string;
  wranglerTemplate: string;
  schemaDir: string;
  /** The package version, written into the Worker so it reports where it came from. */
  version: string;
  /** Where the rendered `wrangler.toml` is kept (0600), so later maintenance can reuse it. */
  configDir: string;
  log: (line: string) => void;
  fetch?: (input: URL | string, init?: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
  healthAttempts?: number;
  /** `--verbose`: every Wrangler call and its output. Credentials are never arguments, so none appear. */
  trace?: Trace;
};

export type ApplyResult = {
  workerUrl: string;
  /** Every secret the Worker holds after this run that this run generated. */
  secrets: Record<string, string>;
  configPath: string;
};

/** A failure that already says which step failed and what to do about it. */
export class DeployError extends Error {
  constructor(
    readonly step: string,
    message: string,
    readonly hint?: string
  ) {
    super(message);
  }
}

const lastLines = (text: string): string =>
  text
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-6)
    .join('\n');

const STEPS = [
  'Checking Cloudflare access',
  'Checking for existing resources',
  'Creating the database',
  'Creating the storage bucket',
  'Writing the deployment configuration',
  'Creating the tables',
  'Deploying the Worker',
  'Generating and storing the secrets',
  'Checking the Worker is healthy'
] as const;

/** The accounts a credential can see. An empty list means Cloudflare did not accept it. */
export async function checkAccess(run: Run): Promise<Array<{ id: string; name: string }>> {
  const whoami = await run(['whoami']);
  const accounts = parseAccounts(whoami.stdout).map(({ id, name }) => ({ id, name }));
  if (accounts.length === 0) {
    const output = whoami.stdout + whoami.stderr;
    throw new DeployError(
      STEPS[0],
      `Cloudflare did not recognize the credential.\n${lastLines(output)}`,
      explain(output, 'check access') ?? explain('invalid api token', 'check access')
    );
  }
  return accounts;
}

/**
 * Creates one environment's backend from the packaged files, in order. It only ever creates: an existing
 * database or bucket stops it (or, with `resume`, is reused, since a previous run of this command may have made
 * it), and nothing is deleted.
 */
export async function applyDeploy(
  deps: ApplyDeps,
  plan: DeployPlan,
  options: { resume: boolean }
): Promise<ApplyResult> {
  const { names } = plan;
  const env: Record<string, string> = plan.accountId
    ? { CLOUDFLARE_ACCOUNT_ID: plan.accountId }
    : {};
  const trace = deps.trace ?? noTrace;
  const wr = async (args: readonly string[], extra: Parameters<Run>[1] = {}) => {
    const started = Date.now();
    trace(
      `wrangler ${args.join(' ')}${extra.stdin ? ` (sends ${extra.stdin.length} characters on stdin, not shown)` : ''}`
    );
    const result = await deps.run(args, { ...extra, env: { ...env, ...extra.env } });
    trace(`  exit ${result.code} after ${Date.now() - started}ms`);
    // Wrangler's output shows names and addresses; the secrets it is given go in on stdin and are not echoed.
    const shown = lastLines(result.stdout + result.stderr);
    if (shown) trace(shown.replace(/^/gm, '  | '));
    return result;
  };
  trace(`Rendered configuration goes to ${join(deps.configDir, names.worker, 'wrangler.toml')}`);
  const rendered = join(deps.configDir, names.worker, 'wrangler.toml');
  const configArgs = ['--config', rendered];
  let index = 0;
  const step = (): string => {
    const label = STEPS[index]!;
    index += 1;
    deps.log(`[${index}/${STEPS.length}] ${label}…`);
    trace(`Step ${index} of ${STEPS.length}: ${label}`);
    return label;
  };
  const fail = (label: string, what: string, result: { stdout: string; stderr: string }): never => {
    const output = result.stdout + result.stderr;
    throw new DeployError(label, `${what}\n${lastLines(output)}`, explain(output, label));
  };

  step(); // access was checked by the caller (checkAccess); this line keeps the numbering honest
  const label2 = step();
  const listed = await wr(['d1', 'list', '--json']);
  if (listed.code !== 0) fail(label2, 'Listing the databases failed.', listed);
  const buckets = await wr(['r2', 'bucket', 'list']);
  if (buckets.code !== 0) fail(label2, 'Listing the storage buckets failed.', buckets);
  let database = parseDatabases(listed.stdout).find((item) => item.name === names.database);
  const bucketExists = parseBuckets(buckets.stdout).includes(names.bucket);
  if (!options.resume && (database || bucketExists))
    throw new DeployError(
      label2,
      `"${database ? names.database : names.bucket}" already exists in this Cloudflare account.`,
      `Nothing was changed. Choose another environment name, or use --resume if an earlier run of this command left it behind.`
    );

  const label3 = step();
  if (!database) {
    const created = await wr(['d1', 'create', names.database], { stdin: '' });
    if (created.code !== 0) fail(label3, 'Creating the database failed.', created);
    database = parseDatabases((await wr(['d1', 'list', '--json'])).stdout).find(
      (item) => item.name === names.database
    );
  }
  if (!database)
    throw new DeployError(label3, 'The database was created but its id could not be read.');

  const label4 = step();
  if (!bucketExists) {
    const created = await wr(['r2', 'bucket', 'create', names.bucket], { stdin: '' });
    if (created.code !== 0) fail(label4, 'Creating the storage bucket failed.', created);
  }

  step();
  const filled = renderProductionConfig(readFileSync(deps.wranglerTemplate, 'utf8'), {
    worker: names.worker,
    database: names.database,
    databaseId: database.uuid,
    bucket: names.bucket,
    migrationsDir: deps.schemaDir,
    workerVersion: deps.version
  });
  mkdirSync(dirname(rendered), { recursive: true, mode: 0o700 });
  writeFileSync(rendered, filled, { mode: 0o600 });

  const label6 = step();
  const migrated = await wr(
    ['d1', 'migrations', 'apply', names.database, '--remote', ...configArgs],
    {
      stdin: ''
    }
  );
  if (migrated.code !== 0) fail(label6, 'Creating the tables failed.', migrated);

  const label7 = step();
  const deployed = await wr(['deploy', ...configArgs, deps.workerBundle]);
  if (deployed.code !== 0) fail(label7, 'Deploying the Worker failed.', deployed);
  const workerUrl = parseWorkerUrl(deployed.stdout + deployed.stderr);
  if (!workerUrl)
    throw new DeployError(
      label7,
      'The Worker deployed, but its address could not be read from the output.',
      'Find it in the Cloudflare dashboard → Workers & Pages, then add it with `vizoalica env add`.'
    );

  const label8 = step();
  const listedSecrets = await wr(['secret', 'list', '--format', 'json', ...configArgs]);
  const present = new Set<string>();
  try {
    for (const item of JSON.parse(
      listedSecrets.stdout.slice(listedSecrets.stdout.indexOf('['))
    ) as Array<{
      name: string;
    }>)
      present.add(item.name);
  } catch {
    // Nothing listed: every secret is generated below.
  }
  trace(`Secrets the Worker already has: ${[...present].join(', ') || 'none'}`);
  const missing = SECRET_KINDS.filter((kind: SecretKind) => !present.has(SECRETS[kind].name));
  const secrets = generateSecrets(missing);
  if (missing.length > 0) {
    const stored = await wr(['secret', 'bulk', ...configArgs], { stdin: JSON.stringify(secrets) });
    if (stored.code !== 0) fail(label8, 'Storing the secrets failed.', stored);
  }

  step();
  const doFetch = deps.fetch ?? fetch;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const attempts = deps.healthAttempts ?? 10;
  let healthy = false;
  for (let attempt = 0; attempt < attempts && !healthy; attempt += 1) {
    try {
      const response = await doFetch(`${workerUrl}/healthz`, {
        signal: AbortSignal.timeout(10_000)
      });
      const body = (await response.json().catch(() => undefined)) as { ok?: unknown } | undefined;
      healthy = response.status === 200 && body?.ok === true;
      trace(
        `Health check ${attempt + 1} of ${attempts}: ${healthy ? 'healthy' : `answered ${response.status}, not healthy yet`}`
      );
    } catch (error) {
      // A brand-new workers.dev name can take a moment to resolve.
      trace(
        `Health check ${attempt + 1} of ${attempts}: no answer (${error instanceof Error ? error.message : 'unknown'})`
      );
    }
    if (!healthy && attempt < attempts - 1) await sleep(3000);
  }
  if (!healthy)
    throw new DeployError(
      STEPS[8],
      `The Worker at ${workerUrl} did not answer its health check.`,
      'Wait a minute and open it in a browser. If it returns an error, open the Worker in the Cloudflare dashboard → Workers & Pages → Logs. Everything is created; add it with `vizoalica env add` once it answers.'
    );
  return { workerUrl, secrets, configPath: rendered };
}

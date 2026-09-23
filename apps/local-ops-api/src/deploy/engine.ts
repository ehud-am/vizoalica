import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  SECRETS,
  SECRET_KINDS,
  type SecretKind,
  assertEnvironmentResourceName,
  defaultNames,
  generateSecrets,
  parseAccounts,
  parseBuckets,
  parseDatabases,
  parseWorkerUrl,
  renderProductionConfig,
  type Run
} from '@vizoalica/ops-core';
import type { EnvironmentStore } from '../environment-store.js';
import { StepTracker } from './steps.js';
import { SecretVault } from './vault.js';
import { RunStore, type Plan, type PlanResource, type RunRecord } from './runs.js';

export type EngineDeps = {
  /** Where a rendered wrangler.toml is written: `<configBaseDir>/<worker>/wrangler.toml`. */
  configBaseDir: string;
  /** The packaged Worker bundle (`dist/worker/index.mjs`). */
  workerBundle: string;
  /** The packaged Wrangler config template (`dist/worker/wrangler.template.toml`). */
  wranglerTemplate: string;
  /** The packaged migrations directory (`dist/schema`), applied with `d1 migrations apply`. */
  schemaDir: string;
  store: RunStore;
  vault: SecretVault;
  environmentStore: EnvironmentStore;
  /** The pinned Wrangler runner for the plan's environment; a test replaces this with a fake one. */
  run: Run;
  now?: () => Date;
};

const runs = new Map<string, RunRecord>();

function id(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export type PreflightAccount = { id: string; name: string };
export type Preflight = {
  signedIn: boolean;
  accounts: PreflightAccount[];
  existing: { database: boolean; bucket: boolean };
};

/** Never creates anything: whether the credential works, the accounts it can see, and what already exists. */
export async function preflight(
  deps: Pick<EngineDeps, 'run'>,
  names: { worker: string; database: string; bucket: string }
): Promise<Preflight> {
  const whoami = await deps.run(['whoami']);
  const accounts = parseAccounts(whoami.stdout).map((account) => ({
    id: account.id,
    name: account.name
  }));
  if (accounts.length === 0)
    return { signedIn: false, accounts: [], existing: { database: false, bucket: false } };
  const databases = parseDatabases((await deps.run(['d1', 'list', '--json'])).stdout);
  const buckets = parseBuckets((await deps.run(['r2', 'bucket', 'list'])).stdout);
  return {
    signedIn: true,
    accounts,
    existing: {
      database: databases.some((item) => item.name === names.database),
      bucket: buckets.includes(names.bucket)
    }
  };
}

export function buildPlan(
  deps: Pick<EngineDeps, 'store' | 'now'>,
  input: {
    environment: string;
    accountId?: string;
    accountName?: string;
    names?: { worker: string; database: string; bucket: string };
  }
): Plan {
  const names = input.names ?? defaultNames(input.environment);
  for (const [kind, name] of [
    ['Worker', names.worker],
    ['Database', names.database],
    ['Bucket', names.bucket]
  ] as const)
    assertEnvironmentResourceName(kind, name, input.environment);
  const resources: PlanResource[] = [
    {
      kind: 'd1',
      name: names.database,
      purpose: 'Stores bounded aggregates and configuration; never raw events.'
    },
    {
      kind: 'r2',
      name: names.bucket,
      purpose: 'Stores raw event batches, privacy-filtered before they arrive.'
    },
    {
      kind: 'worker',
      name: names.worker,
      purpose: 'Validates events, enforces the privacy guard, and serves the admin API.'
    }
  ];
  const plan: Plan = {
    id: id(),
    mode: 'first-install',
    environment: input.environment,
    names,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...(input.accountName ? { accountName: input.accountName } : {}),
    resources,
    createdAt: (deps.now ?? (() => new Date()))().toISOString()
  };
  deps.store.savePlan(plan);
  return plan;
}

const FIRST_INSTALL_STEPS = [
  { id: 'prepare-tool', label: 'Preparing the deployment tool' },
  { id: 'check-signin', label: 'Checking Cloudflare access' },
  { id: 'detect', label: 'Checking for existing resources' },
  { id: 'create-database', label: 'Creating the database' },
  { id: 'create-bucket', label: 'Creating the storage bucket' },
  { id: 'write-config', label: 'Writing the deployment configuration' },
  { id: 'create-tables', label: 'Creating the tables' },
  { id: 'deploy-worker', label: 'Deploying the Worker' },
  { id: 'store-secrets', label: 'Generating secrets' },
  { id: 'verify-health', label: 'Checking the Worker is healthy' },
  { id: 'connect', label: 'Connecting the console' }
] as const;

const lastLines = (text: string): string =>
  text
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-6)
    .join('\n');

function configPath(deps: Pick<EngineDeps, 'configBaseDir'>, worker: string): string {
  return join(deps.configBaseDir, worker, 'wrangler.toml');
}

async function runFirstInstall(
  deps: EngineDeps,
  plan: Plan,
  run: RunRecord,
  tracker: StepTracker,
  resuming: boolean
): Promise<void> {
  const { names } = plan;
  const env: Record<string, string> = plan.accountId
    ? { CLOUDFLARE_ACCOUNT_ID: plan.accountId }
    : {};
  const wr = (args: readonly string[], extra: Parameters<Run>[1] = {}) =>
    deps.run(args, { ...extra, env: { ...env, ...extra.env } });
  const rendered = configPath(deps, names.worker);
  const configArgs = ['--config', rendered];

  tracker.start('prepare-tool');
  const version = await wr(['--version']);
  if (version.code !== 0)
    throw new Error(
      `The deployment tool could not be prepared:\n${lastLines(version.stdout + version.stderr)}`
    );
  tracker.finish('prepare-tool');

  tracker.start('check-signin');
  const accounts = parseAccounts((await wr(['whoami'])).stdout);
  if (accounts.length === 0)
    throw new Error(
      "Cloudflare did not recognize this environment's credential. Check it and try again."
    );
  tracker.finish('check-signin');

  tracker.start('detect');
  const databases = parseDatabases((await wr(['d1', 'list', '--json'])).stdout);
  const buckets = parseBuckets((await wr(['r2', 'bucket', 'list'])).stdout);
  let existingDatabase = databases.find((item) => item.name === names.database);
  const bucketExists = buckets.includes(names.bucket);
  if (!resuming && (existingDatabase || bucketExists))
    throw new Error(
      `"${existingDatabase ? names.database : names.bucket}" already exists in this Cloudflare account.\nPick new names, or connect to the existing backend instead of deploying a new one.`
    );
  tracker.finish('detect');

  tracker.start('create-database');
  if (!existingDatabase) {
    const created = await wr(['d1', 'create', names.database], { stdin: '' });
    if (created.code !== 0)
      throw new Error(
        `Creating the database failed:\n${lastLines(created.stdout + created.stderr)}`
      );
    existingDatabase = parseDatabases((await wr(['d1', 'list', '--json'])).stdout).find(
      (item) => item.name === names.database
    );
  }
  if (!existingDatabase) throw new Error('The database was created but its id could not be read.');
  const databaseId = existingDatabase.uuid;
  tracker.finish('create-database');

  tracker.start('create-bucket');
  if (!bucketExists) {
    const created = await wr(['r2', 'bucket', 'create', names.bucket], { stdin: '' });
    if (created.code !== 0) {
      const message = created.stdout + created.stderr;
      throw new Error(
        /enable|not.*enabled|10042/i.test(message)
          ? 'R2 is not enabled on this Cloudflare account. Open the Cloudflare dashboard → R2, activate it, then run this again.'
          : `Creating the storage bucket failed:\n${lastLines(message)}`
      );
    }
  }
  tracker.finish('create-bucket');

  tracker.start('write-config');
  const template = readFileSync(deps.wranglerTemplate, 'utf8');
  const filled = renderProductionConfig(template, {
    worker: names.worker,
    database: names.database,
    databaseId,
    bucket: names.bucket,
    migrationsDir: deps.schemaDir
  });
  mkdirSync(dirname(rendered), { recursive: true, mode: 0o700 });
  writeFileSync(rendered, filled, { mode: 0o600 });
  tracker.finish('write-config');

  tracker.start('create-tables');
  const migrated = await wr(
    ['d1', 'migrations', 'apply', names.database, '--remote', ...configArgs],
    { stdin: '' }
  );
  if (migrated.code !== 0)
    throw new Error(`Creating the tables failed:\n${lastLines(migrated.stdout + migrated.stderr)}`);
  tracker.finish('create-tables');

  tracker.start('deploy-worker');
  const deployed = await wr(['deploy', ...configArgs, deps.workerBundle], {
    interactive: true,
    echo: false
  });
  if (deployed.code !== 0)
    throw new Error(
      `Deploying the Worker failed:\n${lastLines(deployed.stdout + deployed.stderr)}`
    );
  const workerUrl = parseWorkerUrl(deployed.stdout + deployed.stderr);
  if (!workerUrl) throw new Error('The Worker deployed, but its address could not be read.');
  tracker.finish('deploy-worker');

  tracker.start('store-secrets');
  const listed = await wr(['secret', 'list', '--format', 'json', ...configArgs]);
  const present = new Set(
    (() => {
      try {
        return (
          JSON.parse(listed.stdout.slice(listed.stdout.indexOf('['))) as Array<{ name: string }>
        ).map((item) => item.name);
      } catch {
        return [] as string[];
      }
    })()
  );
  const missing = SECRET_KINDS.filter((kind: SecretKind) => !present.has(SECRETS[kind].name));
  const generated = generateSecrets(missing);
  if (missing.length > 0) {
    const stored = await wr(['secret', 'bulk', ...configArgs], {
      stdin: JSON.stringify(generated)
    });
    if (stored.code !== 0)
      throw new Error(`Storing the secrets failed:\n${lastLines(stored.stdout + stored.stderr)}`);
  }
  tracker.finish('store-secrets');

  tracker.start('verify-health');
  let healthy = false;
  for (let attempt = 0; attempt < 10 && !healthy; attempt += 1) {
    try {
      const response = await fetch(`${workerUrl}/healthz`, { signal: AbortSignal.timeout(10_000) });
      const body = (await response.json().catch(() => undefined)) as { ok?: unknown } | undefined;
      healthy = response.status === 200 && body?.ok === true;
    } catch {
      // Not resolvable yet; a brand-new workers.dev name can take a moment.
    }
    if (!healthy && attempt < 9) await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  tracker.finish('verify-health');

  tracker.start('connect');
  const adminSecret = generated[SECRETS.admin.name];
  if (adminSecret)
    deps.environmentStore.save({
      remoteUrl: workerUrl,
      credential: adminSecret,
      kind: 'admin-secret'
    });
  deps.vault.store(run.id, generated);
  tracker.finish('connect');

  run.result = { workerUrl, healthy, secretNames: Object.keys(generated) };
}

function record(planId: string, plan: Plan): RunRecord {
  return {
    id: id(),
    planId,
    mode: plan.mode,
    environment: plan.environment,
    names: plan.names,
    status: 'running',
    steps: FIRST_INSTALL_STEPS.map((step) => ({
      id: step.id,
      label: step.label,
      status: 'pending' as const
    })),
    createdAt: new Date().toISOString()
  };
}

async function execute(
  deps: EngineDeps,
  plan: Plan,
  run: RunRecord,
  resuming: boolean
): Promise<void> {
  const tracker = new StepTracker(FIRST_INSTALL_STEPS);
  tracker.steps.forEach((step, index) => {
    if (run.steps[index]?.status === 'done') tracker.finish(step.id);
  });
  try {
    await runFirstInstall(deps, plan, run, tracker, resuming);
    run.status = 'done';
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    const running = tracker.steps.find((step) => step.status === 'running');
    if (running) tracker.fail(running.id, failure);
    run.status = 'failed';
    run.error = failure.message;
  } finally {
    run.steps = tracker.steps;
    run.finishedAt = new Date().toISOString();
    runs.set(run.id, run);
    deps.store.saveRun(run);
  }
}

/** Starts a first-install run in the background and returns immediately with its id. */
export function startRun(deps: EngineDeps, planId: string): RunRecord {
  const plan = deps.store.loadPlan(planId);
  if (!plan) throw new Error('plan_not_found');
  const run = record(planId, plan);
  runs.set(run.id, run);
  deps.store.saveRun(run);
  void execute(deps, plan, run, false);
  return run;
}

export function getRun(deps: Pick<EngineDeps, 'store'>, runId: string): RunRecord | undefined {
  return runs.get(runId) ?? deps.store.loadRun(runId);
}

/** A failed run resumes from where it left off: steps already done are not repeated. */
export function resumeRun(deps: EngineDeps, runId: string): RunRecord {
  const prior = getRun(deps, runId);
  if (!prior) throw new Error('run_not_found');
  if (prior.status !== 'failed') throw new Error('run_not_resumable');
  const plan = deps.store.loadPlan(prior.planId);
  if (!plan) throw new Error('plan_not_found');
  const run: RunRecord = { ...prior, status: 'running' };
  delete run.error;
  delete run.finishedAt;
  runs.set(run.id, run);
  deps.store.saveRun(run);
  void execute(deps, plan, run, true);
  return run;
}

export type CleanupResult = { removed: string[] };

/** Best-effort teardown of a plan's named resources, only when explicitly confirmed. */
export async function cleanupRun(
  deps: Pick<EngineDeps, 'run' | 'store'>,
  runId: string
): Promise<CleanupResult> {
  const run = getRun(deps, runId);
  if (!run) throw new Error('run_not_found');
  const plan = deps.store.loadPlan(run.planId);
  if (!plan) throw new Error('plan_not_found');
  const removed: string[] = [];
  const databases = parseDatabases((await deps.run(['d1', 'list', '--json'])).stdout);
  if (databases.some((item) => item.name === plan.names.database)) {
    await deps.run(['d1', 'delete', plan.names.database, '-y'], { stdin: '' });
    removed.push(`d1:${plan.names.database}`);
  }
  const buckets = parseBuckets((await deps.run(['r2', 'bucket', 'list'])).stdout);
  if (buckets.includes(plan.names.bucket)) {
    await deps.run(['r2', 'bucket', 'delete', plan.names.bucket], { stdin: '' });
    removed.push(`r2:${plan.names.bucket}`);
  }
  return { removed };
}

export { RunStore, SecretVault };
export type { Plan, RunRecord };

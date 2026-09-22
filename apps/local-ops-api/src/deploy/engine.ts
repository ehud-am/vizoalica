import {
  OpsError,
  setUpBackend,
  DEFAULT_NAMES,
  SECRETS,
  assertResourceName,
  parseAccounts,
  parseDatabases,
  parseBuckets
} from '@vizoalica/ops-core';
import type { Run } from '@vizoalica/ops-core';
import type { EnvironmentStore } from '../environment-store.js';
import { consoleCtx } from './console-ctx.js';
import { SecretVault } from './vault.js';
import { RunStore, type Plan, type PlanResource, type RunRecord } from './runs.js';

export type EngineDeps = {
  cwd: string;
  store: RunStore;
  vault: SecretVault;
  connectionStore: EnvironmentStore;
  /** The pinned Wrangler runner; a test replaces this with a fake one. */
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

/** Never creates anything: whether Wrangler is signed in, the accounts available, and what already exists. */
export async function preflight(
  deps: Pick<EngineDeps, 'run'>,
  names: { worker: string; database: string; bucket: string } = DEFAULT_NAMES
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
    accountId?: string;
    accountName?: string;
    names?: { worker: string; database: string; bucket: string };
  }
): Plan {
  const names = input.names ?? DEFAULT_NAMES;
  for (const [kind, name] of [
    ['Worker', names.worker],
    ['Database', names.database],
    ['Bucket', names.bucket]
  ] as const)
    assertResourceName(kind, name);
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
    names,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...(input.accountName ? { accountName: input.accountName } : {}),
    resources,
    createdAt: (deps.now ?? (() => new Date()))().toISOString()
  };
  deps.store.savePlan(plan);
  return plan;
}

function record(planId: string, plan: Plan): RunRecord {
  return {
    id: id(),
    planId,
    mode: plan.mode,
    names: plan.names,
    status: 'running',
    steps: [],
    createdAt: new Date().toISOString()
  };
}

async function execute(deps: EngineDeps, plan: Plan, run: RunRecord): Promise<void> {
  const { ctx, log } = consoleCtx({
    cwd: deps.cwd,
    run: deps.run,
    // A failed first install removes only the empty resources it just created, so a retry starts clean.
    cleanupOnFailure: true,
    ...(plan.accountId ? { answers: { accountIndex: '1' } } : {})
  });
  try {
    const result = await setUpBackend(ctx, {
      firstRun: true,
      worker: plan.names.worker,
      database: plan.names.database,
      bucket: plan.names.bucket
    });
    deps.connectionStore.save({
      remoteUrl: result.workerUrl,
      credential: result.secrets[SECRETS.admin.name]!,
      kind: 'admin-secret',
      roleHint: 'admin'
    });
    deps.vault.store(run.id, result.secrets);
    run.result = {
      workerUrl: result.workerUrl,
      healthy: true,
      secretNames: Object.keys(result.secrets)
    };
    run.status = 'done';
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    log.fail(failure);
    run.status = 'failed';
    run.error = failure instanceof OpsError ? failure.message : failure.message;
  } finally {
    log.finish();
    run.steps = log.steps;
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
  void execute(deps, plan, run);
  return run;
}

export function getRun(deps: Pick<EngineDeps, 'store'>, runId: string): RunRecord | undefined {
  return runs.get(runId) ?? deps.store.loadRun(runId);
}

/** A run that failed is simply retried from its plan: the failed attempt already cleaned up after itself. */
export function resumeRun(deps: EngineDeps, runId: string): RunRecord {
  const prior = getRun(deps, runId);
  if (!prior) throw new Error('run_not_found');
  if (prior.status !== 'failed') throw new Error('run_not_resumable');
  return startRun(deps, prior.planId);
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

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import { dirname, join } from 'node:path';
import { defaultNames, parseAccounts, renderProductionConfig } from '@vizoalica/ops-core';
import { schemaStatus, workerStatus } from '../compat.js';
import { WorkerClient } from '../remote-client/worker-client.js';
import { diagnose } from './diagnose.js';
import { StepTracker } from './steps.js';
import { configPath, getRun, trackRun, type EngineDeps } from './engine.js';
import type { Plan, RunRecord } from './runs.js';

function id(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

/**
 * The names this environment was deployed with. Every environment's names default to
 * `defaultNames(environment)` at deploy time (research R26), and its rendered config never moves
 * afterward, so reading the config's own `name`/`database_name`/`bucket_name` lines confirms the exact
 * names even if a plan ever used custom ones instead of the defaults.
 */
export function deployedNames(
  deps: Pick<EngineDeps, 'configBaseDir'>,
  environment: string
): { worker: string; database: string; bucket: string } | undefined {
  const guess = defaultNames(environment);
  const rendered = configPath(deps, guess.worker);
  if (!existsSync(rendered)) return undefined;
  const content = readFileSync(rendered, 'utf8');
  const value = (key: string) => new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm').exec(content)?.[1];
  const worker = value('name');
  const database = value('database_name');
  const bucket = value('bucket_name');
  return worker && database && bucket ? { worker, database, bucket } : guess;
}

export type PendingMigration = { name: string; description: string; nonAdditive: boolean };

const NON_ADDITIVE_MARKER = '-- vizoalica:non-additive';

/**
 * Every packaged migration numbered above the applied version, in order, with its plain first-comment
 * description and whether it needs the `-- vizoalica:non-additive` marker (display only; the Worker's
 * own migrations-check.ts is the source of truth for whether a shipped migration is actually additive).
 */
export function pendingMigrations(schemaDir: string, applied: number | null): PendingMigration[] {
  const appliedNumber = applied ?? 0; // an unknown version is treated as behind (research R21/data-model)
  return readdirSync(schemaDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
    .filter((name) => Number(name.slice(0, 4)) > appliedNumber)
    .map((name) => {
      const sql = readFileSync(join(schemaDir, name), 'utf8');
      const description = /^--\s*(.+)$/m.exec(sql)?.[1] ?? name;
      return { name, description, nonAdditive: sql.includes(NON_ADDITIVE_MARKER) };
    });
}

export type UpdatePreview = {
  environment: string;
  worker: { current: string | null; expected: string; status: string; message: string };
  schema: { applied: number | null; expected: number | null; status: string; message: string };
  pending: PendingMigration[];
  upToDate: boolean;
};

/** Never changes anything: what an update would do, for the plan screen. */
export async function previewUpdate(
  deps: Pick<EngineDeps, 'environmentStore' | 'schemaDir' | 'consoleVersion'>
): Promise<UpdatePreview> {
  const connection = deps.environmentStore.current();
  const environment = deps.environmentStore.active();
  if (!connection || !environment) throw new Error('backend_not_connected');
  const client = new WorkerClient(connection.remoteUrl, connection.credential);
  const info = await client.backendInfo();
  const worker = workerStatus(deps.consoleVersion, info.workerVersion);
  const schema = schemaStatus(expectedSchema(deps.schemaDir), info.schema.applied);
  const pending = pendingMigrations(deps.schemaDir, info.schema.applied);
  return {
    environment,
    worker: {
      current: info.workerVersion,
      expected: deps.consoleVersion,
      status: worker.status,
      message: worker.message
    },
    schema: {
      applied: info.schema.applied,
      expected: expectedSchema(deps.schemaDir),
      status: schema.status,
      message: schema.message
    },
    pending,
    upToDate: worker.status === 'current' && schema.status === 'current'
  };
}

function expectedSchema(schemaDir: string): number | null {
  const numbers = readdirSync(schemaDir)
    .map((name) => /^(\d{4})_.+\.sql$/.exec(name)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number);
  return numbers.length ? Math.max(...numbers) : null;
}

const UPDATE_STEPS = [
  { id: 'prepare-tool', label: 'Preparing the deployment tool' },
  { id: 'check-signin', label: 'Checking Cloudflare access' },
  { id: 'read-versions', label: 'Reading the current versions' },
  { id: 'backup', label: 'Backing up the database' },
  { id: 'migrate', label: 'Applying database changes' },
  { id: 'deploy-worker', label: 'Deploying the Worker' },
  { id: 'verify', label: 'Verifying the result' },
  { id: 'record', label: 'Recording the update' }
] as const;

export function updateRunRecord(plan: Plan, id: string): RunRecord {
  return {
    id,
    planId: plan.id,
    mode: 'update-backend',
    environment: plan.environment,
    names: plan.names,
    status: 'running',
    steps: UPDATE_STEPS.map((step) => ({
      id: step.id,
      label: step.label,
      status: 'pending' as const
    })),
    createdAt: new Date().toISOString()
  };
}

const lastLines = (text: string): string =>
  text
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-6)
    .join('\n');

export type UpdateOptions = { skipBackup?: { confirm: true } };

/** Backs up, migrates, and redeploys the Worker for the active environment; nothing runs before approval. */
export async function runUpdate(
  deps: EngineDeps,
  run: RunRecord,
  options: UpdateOptions
): Promise<void> {
  const tracker = new StepTracker(UPDATE_STEPS);
  const environment = deps.environmentStore.active();
  const connection = deps.environmentStore.current();
  if (!environment || !connection) throw new Error('backend_not_connected');
  const worker = run.names.worker;
  const rendered = configPath(deps, worker);
  if (!existsSync(rendered))
    throw new Error(
      'no_rendered_config: this environment has no configuration this console rendered yet (it was only connected to, not deployed from here)'
    );
  try {
    tracker.start('prepare-tool');
    const version = await deps.run(['--version']);
    if (version.code !== 0)
      throw new Error(
        `The deployment tool could not be prepared:\n${lastLines(version.stdout + version.stderr)}`
      );
    tracker.finish('prepare-tool');

    tracker.start('check-signin');
    const accounts = parseAccounts((await deps.run(['whoami'])).stdout);
    if (accounts.length === 0)
      throw new Error(
        "Cloudflare did not recognize this environment's credential. Check it and try again."
      );
    tracker.finish('check-signin');

    tracker.start('read-versions');
    const preview = await previewUpdate(deps);
    if (preview.worker.status === 'console-older' || preview.schema.status === 'console-older')
      throw new Error(
        'This backend is newer than this console. Update the console (npm update -g vizoalica); this never downgrades a backend.'
      );
    if (preview.schema.status === 'unsupported')
      throw new Error(
        'This database is older than the oldest schema this console can update in place. Set up a new backend instead.'
      );
    const nonAdditivePending = preview.pending.some((migration) => migration.nonAdditive);
    if (nonAdditivePending && options.skipBackup)
      throw new Error(
        'A pending change is not purely additive, so declining the backup is refused for this update.'
      );
    run.versions = {
      before: { worker: preview.worker.current, schema: preview.schema.applied },
      after: { worker: preview.worker.expected, schema: preview.schema.expected },
      migrationsApplied: [],
      ...(options.skipBackup ? { backupDeclined: true } : {})
    };
    tracker.finish('read-versions');

    tracker.start('backup');
    if (options.skipBackup?.confirm) {
      tracker.skip('backup');
    } else if (preview.schema.status === 'current' && preview.worker.status === 'current') {
      // Nothing pending: no change is about to happen, so there is nothing to back up before it.
      tracker.skip('backup');
    } else {
      // Beside the deploy folder (the environments home), so a test's temporary home never touches the real one.
      const backupDir = join(dirname(deps.configBaseDir), 'backups');
      mkdirSync(backupDir, { recursive: true, mode: 0o700 });
      const backupPath = join(backupDir, `${run.names.database}-${Date.now()}.sql`);
      const exported = await deps.run([
        'd1',
        'export',
        run.names.database,
        '--remote',
        '--output',
        backupPath,
        '--config',
        rendered
      ]);
      if (exported.code !== 0 || !existsSync(backupPath))
        throw new Error(
          `The backup could not be taken, so nothing was changed:\n${lastLines(exported.stdout + exported.stderr)}`
        );
      chmodSync(backupPath, 0o600);
      run.versions!.backupPath = backupPath;
      tracker.finish('backup');
    }

    tracker.start('migrate');
    if (preview.schema.status === 'current') {
      tracker.skip('migrate');
    } else {
      const migrated = await deps.run(
        ['d1', 'migrations', 'apply', run.names.database, '--remote', '--config', rendered],
        { stdin: '' }
      );
      if (migrated.code !== 0)
        throw new Error(
          `Applying database changes failed:\n${lastLines(migrated.stdout + migrated.stderr)}`
        );
      run.versions!.migrationsApplied = preview.pending.map((migration) => migration.name);
      tracker.finish('migrate');
    }

    tracker.start('deploy-worker');
    if (preview.worker.status === 'current') {
      tracker.skip('deploy-worker');
    } else {
      const template = readFileSync(deps.wranglerTemplate, 'utf8');
      const filled = renderProductionConfig(template, {
        worker: run.names.worker,
        database: run.names.database,
        databaseId: readDatabaseId(rendered),
        bucket: run.names.bucket,
        migrationsDir: deps.schemaDir,
        workerVersion: deps.consoleVersion
      });
      writeFileSync(rendered, filled, { mode: 0o600 });
      const deployed = await deps.run(['deploy', '--config', rendered, deps.workerBundle], {
        interactive: true
      });
      if (deployed.code !== 0)
        throw new Error(
          `Deploying the Worker failed:\n${lastLines(deployed.stdout + deployed.stderr)}`
        );
      tracker.finish('deploy-worker');
    }

    tracker.start('verify');
    const client = new WorkerClient(connection.remoteUrl, connection.credential);
    const after = await client.backendInfo();
    await client.whoami();
    run.versions!.after = { worker: after.workerVersion, schema: after.schema.applied };
    tracker.finish('verify');

    tracker.start('record');
    tracker.finish('record');
    run.status = 'done';
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    const running = tracker.steps.find((step) => step.status === 'running');
    const issue = diagnose(failure.message, {
      mode: deps.environmentStore.cloudflareCredential(run.environment)?.mode,
      ...(running ? { step: running.id } : {})
    });
    if (running) tracker.fail(running.id, failure, issue);
    run.status = 'failed';
    run.error = failure.message;
    if (issue) run.issue = issue;
  } finally {
    run.steps = tracker.steps;
    run.finishedAt = new Date().toISOString();
    deps.store.saveRun(run);
  }
}

function readDatabaseId(renderedConfigPath: string): string {
  const content = readFileSync(renderedConfigPath, 'utf8');
  const match = /^database_id\s*=\s*"([^"]*)"/m.exec(content);
  if (!match) throw new Error('The rendered configuration has no database id to reuse.');
  return match[1]!;
}

/** Never changes anything: the plan an admin approves before an update runs. */
export async function buildUpdatePlan(deps: EngineDeps): Promise<Plan> {
  const environment = deps.environmentStore.active();
  if (!environment) throw new Error('no_active_environment');
  const names = deployedNames(deps, environment);
  if (!names)
    throw new Error(
      'no_rendered_config: this environment has no configuration this console rendered yet'
    );
  const preview = await previewUpdate(deps);
  const plan: Plan = {
    id: id(),
    mode: 'update-backend',
    environment,
    names,
    resources: [],
    update: {
      worker: preview.worker,
      schema: preview.schema,
      pending: preview.pending
    },
    createdAt: new Date().toISOString()
  };
  deps.store.savePlan(plan);
  return plan;
}

/** Starts an update run in the background and returns immediately with its id. */
export function startUpdateRun(
  deps: EngineDeps,
  planId: string,
  options: UpdateOptions = {}
): RunRecord {
  const plan = deps.store.loadPlan(planId);
  if (!plan) throw new Error('plan_not_found');
  if (plan.mode !== 'update-backend') throw new Error('plan_not_found');
  const run = updateRunRecord(plan, id());
  trackRun(run);
  deps.store.saveRun(run);
  void runUpdate(deps, run, options);
  return run;
}

/** A failed update resumes from where it left off: steps already done are not repeated. */
export function resumeUpdateRun(deps: EngineDeps, runId: string): RunRecord {
  const prior = getRun(deps, runId);
  if (!prior) throw new Error('run_not_found');
  if (prior.status !== 'failed') throw new Error('run_not_resumable');
  const run: RunRecord = { ...prior, status: 'running' };
  delete run.error;
  delete run.issue;
  delete run.finishedAt;
  trackRun(run);
  deps.store.saveRun(run);
  void runUpdate(deps, run, {});
  return run;
}

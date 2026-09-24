import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Run, RunResult } from '@vizoalica/ops-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPlan,
  getRun,
  preflight,
  resumeRun,
  startRun,
  type EngineDeps
} from '../src/deploy/engine.js';
import { RunStore } from '../src/deploy/runs.js';
import { SecretVault } from '../src/deploy/vault.js';
import { EnvironmentStore } from '../src/environment-store.js';

const ACCOUNT = { id: 'a'.repeat(32), name: 'Acme' };
const NAMES = { worker: 'stage-w', database: 'stage-d', bucket: 'stage-b' };

/** What Cloudflare printed when this computer's address was not on the token's IP list (captured for real). */
const IP_BLOCKED = `⛅️ wrangler 4.134.0
Getting User settings...
✘ [ERROR] A request to the Cloudflare API (/accounts) failed.
  Cannot use the access token from location: 203.0.113.9 [code: 9109]`;

type Fault = { when: (args: readonly string[]) => boolean; output: string };

/** A fake Wrangler whose one current fault can be cleared mid-test, like an administrator fixing the cause. */
function faultyWrangler() {
  const databases: Array<{ name: string; uuid: string }> = [];
  const buckets: string[] = [];
  const calls: string[][] = [];
  const state: { fault?: Fault } = {};
  const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '' });
  const run: Run = async (args) => {
    calls.push([...args]);
    if (state.fault?.when(args)) return { code: 1, stdout: '', stderr: state.fault.output };
    const [command] = args;
    if (args.includes('--version')) return ok('4.134.0');
    if (command === 'whoami') return ok(`│ ${ACCOUNT.name} │ ${ACCOUNT.id} │`);
    if (command === 'd1' && args[1] === 'list') return ok(JSON.stringify(databases));
    if (command === 'd1' && args[1] === 'create') {
      databases.push({ name: args[2]!, uuid: `${args[2]}-uuid` });
      return ok();
    }
    if (command === 'r2' && args[2] === 'list')
      return ok(buckets.map((name) => `name:      ${name}`).join('\n'));
    if (command === 'r2' && args[2] === 'create') {
      buckets.push(args[3]!);
      return ok();
    }
    if (command === 'deploy') return ok('Deployed https://stage-w.example.workers.dev');
    if (command === 'secret' && args[1] === 'list') return ok('[]');
    return ok('Applied');
  };
  return { run, calls, state };
}

function deps(fake: ReturnType<typeof faultyWrangler>): EngineDeps {
  const base = mkdtempSync(join(tmpdir(), 'vizoalica-recovery-'));
  const workerDir = join(base, 'packaged', 'worker');
  const schemaDir = join(base, 'packaged', 'schema');
  mkdirSync(workerDir, { recursive: true });
  mkdirSync(schemaDir, { recursive: true });
  writeFileSync(join(workerDir, 'index.mjs'), 'export default {};');
  writeFileSync(
    join(workerDir, 'wrangler.template.toml'),
    [
      'name = "__WORKER_NAME__"',
      '[[d1_databases]]',
      'database_name = "__DATABASE_NAME__"',
      'database_id = "__DATABASE_ID__"',
      'migrations_dir = "__SCHEMA_DIR__"',
      '[[r2_buckets]]',
      'bucket_name = "__BUCKET_NAME__"',
      '[vars]',
      'VIZOALICA_WORKER_VERSION = ""'
    ].join('\n')
  );
  const environmentStore = EnvironmentStore.fromDirectory(join(base, 'home'));
  environmentStore.create('stage', { mode: 'token', token: 'cf-tok' });
  return {
    configBaseDir: join(base, 'home', 'deploy'),
    workerBundle: join(workerDir, 'index.mjs'),
    wranglerTemplate: join(workerDir, 'wrangler.template.toml'),
    schemaDir,
    consoleVersion: '0.7.0',
    store: new RunStore(join(base, 'home', 'deployments')),
    vault: new SecretVault(),
    environmentStore,
    run: fake.run
  };
}

const first =
  (...words: string[]) =>
  (args: readonly string[]) =>
    words.every((word, index) => args[index] === word);

async function finished(engineDeps: EngineDeps, runId: string) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const run = getRun(engineDeps, runId);
    if (run && run.status !== 'running') return run;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('run did not finish in time');
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ ok: true }))
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Each cause an administrator can hit: where it fails, what the console says, and that resuming after the fix finishes the job. */
const CAUSES: Array<{
  name: string;
  fault: Fault;
  step: string;
  code: string;
  mentions: string;
  /** How many times the database is created once the run has finished: never twice. */
  databaseCreates: number;
}> = [
  {
    name: "the token's IP filter blocks this computer",
    fault: { when: first('whoami'), output: IP_BLOCKED },
    step: 'check-signin',
    code: 'ip_not_allowed',
    mentions: '203.0.113.9',
    databaseCreates: 1
  },
  {
    name: 'the token is invalid',
    fault: { when: first('whoami'), output: 'Invalid API Token [code: 9106]' },
    step: 'check-signin',
    code: 'token_invalid',
    mentions: 'token',
    databaseCreates: 1
  },
  {
    name: 'the deployment tool cannot be downloaded',
    fault: { when: (args) => args.includes('--version'), output: 'npm error code E404' },
    step: 'prepare-tool',
    code: 'tool_unavailable',
    mentions: 'npm',
    databaseCreates: 1
  },
  {
    name: 'the token cannot list databases',
    fault: {
      when: first('d1', 'list'),
      output: 'Authentication error [code: 10000]'
    },
    step: 'detect',
    code: 'permission_missing',
    mentions: 'D1',
    databaseCreates: 1
  },
  {
    name: 'the token cannot create the bucket (R2 permission)',
    fault: {
      when: first('r2', 'bucket', 'create'),
      output: 'Authentication error [code: 10000]'
    },
    step: 'create-bucket',
    code: 'permission_missing',
    mentions: 'Workers R2 Storage',
    databaseCreates: 1
  },
  {
    name: 'R2 is not enabled on the account',
    fault: { when: first('r2', 'bucket', 'create'), output: 'Please enable R2 [code: 10042]' },
    step: 'create-bucket',
    code: 'r2_not_enabled',
    mentions: 'R2',
    databaseCreates: 1
  },
  {
    name: 'the token cannot deploy Workers',
    fault: { when: first('deploy'), output: 'Authentication error [code: 10000]' },
    step: 'deploy-worker',
    code: 'permission_missing',
    mentions: 'Workers Scripts',
    databaseCreates: 1
  },
  {
    name: 'Cloudflare cannot be reached mid-deploy',
    fault: { when: first('deploy'), output: 'TypeError: fetch failed' },
    step: 'deploy-worker',
    code: 'network_unreachable',
    mentions: 'online',
    databaseCreates: 1
  },
  {
    name: 'OneCLI is not installed',
    fault: { when: first('whoami'), output: 'spawn onecli ENOENT' },
    step: 'check-signin',
    code: 'onecli_not_installed',
    mentions: 'onecli',
    databaseCreates: 1
  },
  {
    name: 'the OneCLI gateway is down',
    fault: {
      when: first('whoami'),
      output: 'Error: connect ECONNREFUSED 127.0.0.1:10255'
    },
    step: 'check-signin',
    code: 'onecli_gateway_unreachable',
    mentions: 'gateway',
    databaseCreates: 1
  }
];

describe('a first install that hits a fixable problem', () => {
  it.each(CAUSES)(
    'explains it, then finishes from the failed step once fixed: $name',
    async (cause) => {
      const fake = faultyWrangler();
      const engineDeps = deps(fake);
      fake.state.fault = cause.fault;
      const plan = buildPlan(engineDeps, { environment: 'stage' });
      const failed = await finished(engineDeps, startRun(engineDeps, plan.id).id);

      expect(failed.status).toBe('failed');
      const step = failed.steps.find((item) => item.status === 'failed');
      expect(step?.id).toBe(cause.step);
      expect(step?.issue?.code).toBe(cause.code);
      expect(failed.issue).toEqual(step?.issue);
      expect(failed.issue?.steps.length).toBeGreaterThanOrEqual(2);
      expect(failed.issue?.steps.at(-1)).toMatch(/Check again|Resume/);
      expect(JSON.stringify(failed.issue)).toContain(cause.mentions);

      // The administrator fixes the cause, then resumes: the same run carries on to the end.
      delete fake.state.fault;
      const resumed = resumeRun(engineDeps, failed.id);
      expect(resumed.issue).toBeUndefined();
      const done = await finished(engineDeps, failed.id);
      expect(done.status).toBe('done');
      expect(done.steps.every((item) => item.status === 'done')).toBe(true);
      expect(done.issue).toBeUndefined();
      expect(fake.calls.filter((call) => first('d1', 'create')(call))).toHaveLength(
        cause.databaseCreates
      );
      expect(fake.calls.filter((call) => first('r2', 'bucket', 'create')(call)).length).toBe(
        cause.step === 'create-bucket' ? 2 : 1
      );
    }
  );

  it('explains an unhealthy Worker and finishes once it answers', async () => {
    vi.useFakeTimers();
    const fake = faultyWrangler();
    const engineDeps = deps(fake);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('not resolvable yet');
      })
    );
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const run = startRun(engineDeps, plan.id);
    await vi.advanceTimersByTimeAsync(60_000);
    const failed = getRun(engineDeps, run.id)!;
    expect(failed.status).toBe('failed');
    expect(failed.steps.find((step) => step.id === 'verify-health')?.issue?.code).toBe(
      'worker_unhealthy'
    );
    expect(failed.issue?.steps.join(' ')).toContain('/healthz');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ ok: true }))
    );
    resumeRun(engineDeps, run.id);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getRun(engineDeps, run.id)?.status).toBe('done');
    expect(fake.calls.filter((call) => first('d1', 'create')(call))).toHaveLength(1);
  });

  it('keeps an unrecognized failure as its raw text, with no invented diagnosis', async () => {
    const fake = faultyWrangler();
    const engineDeps = deps(fake);
    fake.state.fault = { when: first('deploy'), output: 'something entirely new went wrong' };
    const plan = buildPlan(engineDeps, { environment: 'stage' });
    const failed = await finished(engineDeps, startRun(engineDeps, plan.id).id);
    expect(failed.status).toBe('failed');
    expect(failed.issue).toBeUndefined();
    expect(failed.error).toContain('something entirely new went wrong');
  });
});

describe('the check before a deploy starts', () => {
  const environmentStore = { cloudflareCredential: () => ({ mode: 'token' as const, token: 't' }) };

  it('is clean when everything works', async () => {
    const fake = faultyWrangler();
    const result = await preflight({ run: fake.run, environmentStore }, NAMES, 'stage');
    expect(result.signedIn).toBe(true);
    expect(result.issue).toBeUndefined();
  });

  it.each([
    ['the IP filter blocks this computer', first('whoami'), IP_BLOCKED, 'ip_not_allowed', false],
    ['the token is invalid', first('whoami'), 'Invalid API Token', 'token_invalid', false],
    [
      'the token cannot list databases',
      first('d1', 'list'),
      'Authentication error [code: 10000]',
      'permission_missing',
      true
    ],
    [
      'the token cannot list buckets',
      first('r2', 'bucket', 'list'),
      'Authentication error [code: 10000]',
      'permission_missing',
      true
    ]
  ])(
    'reports it, and is clean again once fixed: %s',
    async (_name, when, output, code, signedIn) => {
      const fake = faultyWrangler();
      fake.state.fault = { when, output };
      const blocked = await preflight({ run: fake.run, environmentStore }, NAMES, 'stage');
      expect(blocked.issue?.code).toBe(code);
      expect(blocked.signedIn).toBe(signedIn);
      expect(blocked.issue?.steps.at(-1)).toMatch(/Check again|Resume/);

      delete fake.state.fault;
      const fixed = await preflight({ run: fake.run, environmentStore }, NAMES, 'stage');
      expect(fixed.issue).toBeUndefined();
      expect(fixed.signedIn).toBe(true);
    }
  );

  it('says the credential was not recognized when Cloudflare returns nothing usable', async () => {
    const result = await preflight(
      { run: async () => ({ code: 0, stdout: '', stderr: '' }), environmentStore },
      NAMES,
      'stage'
    );
    expect(result.issue?.code).toBe('not_signed_in');
    expect(result.issue?.fix).toBe('credential');
  });
});

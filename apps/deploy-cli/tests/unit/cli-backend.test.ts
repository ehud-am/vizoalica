import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NAMES,
  assertResourceName,
  parseAccounts,
  parseBuckets,
  parseDatabases,
  parseWorkerUrl,
  readConfigNames,
  renderProductionConfig,
  setUpBackend
} from '../../../../scripts/cli/backend.js';
import {
  ACCOUNT_ID,
  D1_LIST,
  DB_UUID,
  DEPLOY_OUT,
  R2_LIST,
  WHOAMI,
  WORKER_URL,
  fakeCtx,
  fakePrompt,
  fakeRun,
  tempCheckout,
  workerFetch
} from '../cli-support.js';

const options = { ...DEFAULT_NAMES };
const secretNames = [
  'VIZOALICA_ADMIN_SECRET',
  'VIZOALICA_ANALYTICS_DIGEST_SECRET',
  'VIZOALICA_TOKEN_SECRET'
];

/** A Cloudflare account with nothing installed. */
const empty = () => ({
  whoami: { stdout: WHOAMI },
  'd1 list': [{ stdout: '[]' }, { stdout: D1_LIST }],
  'r2 bucket list': { stdout: 'Listing buckets...' },
  'd1 create': {},
  'r2 bucket create': {},
  'd1 migrations apply': {},
  deploy: { stdout: DEPLOY_OUT },
  'secret list': { stdout: '[]' },
  'secret bulk': {}
});
/** A Cloudflare account with a finished install. */
const installed = (secrets = secretNames) => ({
  whoami: { stdout: WHOAMI },
  'd1 list': { stdout: D1_LIST },
  'r2 bucket list': { stdout: R2_LIST },
  deploy: { stdout: DEPLOY_OUT },
  'secret list': { stdout: JSON.stringify(secrets.map((name) => ({ name }))) },
  'secret bulk': {}
});

describe('helpers', () => {
  it('reads accounts, databases, buckets and the Worker address from Wrangler output', () => {
    expect(parseAccounts(WHOAMI)).toEqual([{ name: 'Test Account', id: ACCOUNT_ID }]);
    expect(parseAccounts('You are not authenticated.')).toEqual([]);
    expect(parseDatabases(`noise\n${D1_LIST}`)).toEqual([
      { name: 'vizoalica-config', uuid: DB_UUID }
    ]);
    expect(parseDatabases('not json')).toEqual([]);
    expect(parseBuckets(R2_LIST)).toEqual(['vizoalica-events']);
    expect(parseWorkerUrl(DEPLOY_OUT)).toBe(WORKER_URL);
    expect(parseWorkerUrl('no url here')).toBeUndefined();
  });

  it('validates resource names', () => {
    expect(() => assertResourceName('Worker', 'vizoalica-ingest')).not.toThrow();
    for (const bad of ['UPPER', 'a', '-lead', 'trail-', 'sp ace'])
      expect(() => assertResourceName('Worker', bad)).toThrow(/lowercase/);
  });

  it('fills the example config instead of asking anyone to edit it', () => {
    const example = readFileSync('deploy/cloudflare/wrangler.example.toml', 'utf8');
    const rendered = renderProductionConfig(example, {
      worker: 'w-1',
      database: 'db-1',
      databaseId: DB_UUID,
      bucket: 'b-1'
    });
    expect(readConfigNames(rendered)).toEqual({ worker: 'w-1', database: 'db-1', bucket: 'b-1' });
    expect(rendered).toContain(`database_id = "${DB_UUID}"`);
    expect(rendered).not.toContain('REPLACE_');
    expect(rendered).toContain('crons = ["17 3 * * *"]');
    expect(() =>
      renderProductionConfig('name = "x"', {
        worker: 'w',
        database: 'd',
        databaseId: 'i',
        bucket: 'b'
      })
    ).toThrow(/database_name/);
    expect(readConfigNames('nothing')).toBeUndefined();
  });
});

describe('first install', () => {
  it('creates everything, generates the secrets, shows them once and never passes them as arguments', async () => {
    const cwd = tempCheckout();
    const wrangler = fakeRun(empty());
    const prompts = fakePrompt();
    const { ctx, output, cleared } = fakeCtx({
      cwd,
      run: wrangler.run,
      prompt: prompts.prompt,
      fetch: workerFetch()
    });

    const result = await setUpBackend(ctx, options);

    expect(result).toMatchObject({ workerUrl: WORKER_URL, firstRun: true });
    expect(Object.keys(result.secrets).sort()).toEqual(secretNames);
    // Detected an empty account, so "first install" was the offered default.
    expect(prompts.log.find((line) => line.includes('first install'))).toContain('confirm(true)');
    // Config was written from the example with the real database id, readable only by the owner.
    const config = readFileSync(join(cwd, 'deploy/cloudflare/wrangler.production.toml'), 'utf8');
    expect(config).toContain(`database_id = "${DB_UUID}"`);
    // Order matters: tables, then Worker, then secrets.
    const at = (prefix: string) =>
      wrangler.calls.findIndex((call) => call.args.join(' ').startsWith(prefix));
    expect(at('d1 migrations apply')).toBeGreaterThan(-1);
    expect(at('d1 migrations apply')).toBeLessThan(at('deploy'));
    expect(at('deploy')).toBeLessThan(at('secret bulk'));
    // The three secrets travel over stdin in one call and appear in no argument list.
    const bulk = wrangler.calls.find(
      (call) => call.args[0] === 'secret' && call.args[1] === 'bulk'
    )!;
    expect(Object.keys(JSON.parse(bulk.options.stdin!)).sort()).toEqual(secretNames);
    for (const call of wrangler.calls)
      for (const value of Object.values(result.secrets))
        expect(call.args.join(' ')).not.toContain(value);
    // Shown once, confirmed, then wiped.
    expect(output()).toContain(result.secrets.VIZOALICA_ADMIN_SECRET);
    expect(prompts.typed).toEqual(['saved']);
    expect(cleared()).toBe(1);
    expect(output()).toContain('Healthy');
  });

  it('refuses to adopt an existing database, and tells the operator what to do', async () => {
    const cwd = tempCheckout();
    const { ctx } = fakeCtx({
      cwd,
      run: fakeRun({ ...installed() }).run,
      prompt: fakePrompt({ confirm: () => true }).prompt
    });
    await expect(setUpBackend(ctx, options)).rejects.toThrow(
      /already exists.*not a first install/s
    );
  });

  it('moves an old production config aside instead of overwriting it', async () => {
    const cwd = tempCheckout();
    writeFileSync(join(cwd, 'deploy/cloudflare/wrangler.production.toml'), '# old\n');
    const { ctx } = fakeCtx({ cwd, run: fakeRun(empty()).run, fetch: workerFetch() });
    await setUpBackend(ctx, options);
    const backups = readdirSync(join(cwd, 'deploy/cloudflare')).filter((name) =>
      name.includes('.bak-')
    );
    expect(backups).toHaveLength(1);
    expect(readFileSync(join(cwd, 'deploy/cloudflare', backups[0]!), 'utf8')).toBe('# old\n');
  });

  it('removes only the empty resources it created when a later step fails', async () => {
    const cwd = tempCheckout();
    const wrangler = fakeRun({
      ...empty(),
      'r2 bucket create': {
        code: 1,
        stderr: 'Please enable R2 through the Cloudflare Dashboard. [code: 10042]'
      },
      'd1 delete': {}
    });
    const { ctx } = fakeCtx({
      cwd,
      run: wrangler.run,
      prompt: fakePrompt({ confirm: () => true }).prompt
    });
    await expect(setUpBackend(ctx, { ...options, firstRun: true })).rejects.toThrow(
      /R2 is not enabled/
    );
    expect(wrangler.has('d1 delete vizoalica-config -y')).toBe(true);
    expect(wrangler.has('r2 bucket delete')).toBe(false); // the bucket was never created
    expect(wrangler.has('deploy')).toBe(false);
    expect(existsSync(join(cwd, 'deploy/cloudflare/wrangler.production.toml'))).toBe(false);
  });

  it('leaves resources alone when the operator declines cleanup', async () => {
    const wrangler = fakeRun({
      ...empty(),
      'r2 bucket create': { code: 1, stderr: 'boom' },
      'd1 delete': {}
    });
    const { ctx } = fakeCtx({
      cwd: tempCheckout(),
      run: wrangler.run,
      prompt: fakePrompt({ confirm: (q) => !q.includes('Remove') }).prompt
    });
    await expect(setUpBackend(ctx, { ...options, firstRun: true })).rejects.toThrow(
      /Creating the bucket failed/
    );
    expect(wrangler.has('d1 delete')).toBe(false);
  });

  it.each([
    ['d1 create', /Creating the database failed/],
    ['d1 migrations apply', /Creating the tables failed/],
    ['deploy', /The deploy failed/],
    ['secret bulk', /Storing the secrets failed/]
  ])('reports a clear error when %s fails', async (command, message) => {
    const wrangler = fakeRun({
      ...empty(),
      [command]: { code: 1, stderr: 'kaboom' },
      'd1 delete': {},
      'r2 bucket delete': {}
    });
    const { ctx } = fakeCtx({
      cwd: tempCheckout(),
      run: wrangler.run,
      prompt: fakePrompt({ confirm: () => false }).prompt
    });
    await expect(setUpBackend(ctx, { ...options, firstRun: true })).rejects.toThrow(message);
  });

  it('fails clearly when the database id cannot be read back', async () => {
    const wrangler = fakeRun({ ...empty(), 'd1 list': { stdout: '[]' }, 'd1 delete': {} });
    const { ctx } = fakeCtx({
      cwd: tempCheckout(),
      run: wrangler.run,
      prompt: fakePrompt({ confirm: () => false }).prompt
    });
    await expect(setUpBackend(ctx, { ...options, firstRun: true })).rejects.toThrow(
      /ID could not be read/
    );
  });

  it('asks for the Worker address when the deploy output does not show one', async () => {
    const wrangler = fakeRun({ ...empty(), deploy: { stdout: 'Deployed.' } });
    const { ctx } = fakeCtx({
      cwd: tempCheckout(),
      run: wrangler.run,
      fetch: workerFetch(),
      prompt: fakePrompt({ text: (q) => (q.includes('Worker address') ? WORKER_URL : '') }).prompt
    });
    expect((await setUpBackend(ctx, options)).workerUrl).toBe(WORKER_URL);
  });

  it('warns rather than fails when the new address is not answering yet', async () => {
    const { ctx, output } = fakeCtx({
      cwd: tempCheckout(),
      run: fakeRun(empty()).run,
      fetch: workerFetch({ healthy: false })
    });
    await setUpBackend(ctx, options);
    expect(output()).toMatch(/did not answer yet/);
  });
});

describe('before installing anything', () => {
  it('stops with the build output when the build fails', async () => {
    const { ctx } = fakeCtx({
      cwd: tempCheckout(),
      run: fakeRun({}).run,
      build: async () => ({ ok: false, output: 'TS2322: nope' })
    });
    await expect(setUpBackend(ctx, options)).rejects.toThrow(/build failed[\s\S]*TS2322/);
  });

  it('signs in through the browser when there is no Cloudflare login, then continues', async () => {
    const wrangler = fakeRun({
      ...empty(),
      whoami: [{ stdout: 'You are not authenticated.' }, { stdout: WHOAMI }],
      login: {}
    });
    const { ctx } = fakeCtx({ cwd: tempCheckout(), run: wrangler.run, fetch: workerFetch() });
    await setUpBackend(ctx, options);
    expect(wrangler.calls.find((call) => call.args[0] === 'login')!.options.interactive).toBe(true);
  });

  it('stops when the sign-in does not complete', async () => {
    const wrangler = fakeRun({
      whoami: { stdout: 'You are not authenticated.' },
      login: { code: 1 }
    });
    const { ctx } = fakeCtx({ cwd: tempCheckout(), run: wrangler.run });
    await expect(setUpBackend(ctx, options)).rejects.toThrow(/sign-in did not complete/);
  });

  it('lets the operator choose among several accounts and pins every later call to it', async () => {
    const second = 'b'.repeat(32);
    const two = `${WHOAMI}\n│ Other Account │ ${second} │`;
    const wrangler = fakeRun({ ...empty(), whoami: { stdout: two } });
    const { ctx } = fakeCtx({
      cwd: tempCheckout(),
      run: wrangler.run,
      fetch: workerFetch(),
      prompt: fakePrompt({ text: (q) => (q.includes('Which account') ? '2' : '') }).prompt
    });
    await setUpBackend(ctx, options);
    const after = wrangler.calls.filter((call) => call.args[0] !== 'whoami');
    expect(after.length).toBeGreaterThan(3);
    for (const call of after) expect(call.options.env?.CLOUDFLARE_ACCOUNT_ID).toBe(second);
  });

  it('rejects bad names before touching Cloudflare', async () => {
    const wrangler = fakeRun({});
    const { ctx } = fakeCtx({ cwd: tempCheckout(), run: wrangler.run });
    await expect(setUpBackend(ctx, { ...options, worker: 'Bad Name' })).rejects.toThrow(
      /lowercase/
    );
    expect(wrangler.calls).toHaveLength(0);
  });
});

describe('update', () => {
  it('deploys over an existing install, keeps the secrets, and rebuilds a missing config from live resources', async () => {
    const cwd = tempCheckout();
    const wrangler = fakeRun(installed());
    const prompts = fakePrompt();
    const { ctx } = fakeCtx({
      cwd,
      run: wrangler.run,
      prompt: prompts.prompt,
      fetch: workerFetch()
    });

    const result = await setUpBackend(ctx, options);

    expect(result).toMatchObject({ firstRun: false, workerUrl: WORKER_URL, secrets: {} });
    expect(prompts.log.find((line) => line.includes('first install'))).toContain('confirm(false)'); // detected as an update
    expect(readFileSync(join(cwd, 'deploy/cloudflare/wrangler.production.toml'), 'utf8')).toContain(
      DB_UUID
    );
    expect(wrangler.has('secret bulk')).toBe(false);
    expect(wrangler.has('d1 create')).toBe(false);
    expect(wrangler.has('d1 migrations')).toBe(false);
    expect(prompts.typed).toEqual([]);
  });

  it('generates only the secrets that are missing (resuming an interrupted install)', async () => {
    const wrangler = fakeRun(installed(['VIZOALICA_ADMIN_SECRET']));
    const { ctx } = fakeCtx({ cwd: tempCheckout(), run: wrangler.run, fetch: workerFetch() });
    const result = await setUpBackend(ctx, { ...options, firstRun: false });
    expect(Object.keys(result.secrets).sort()).toEqual([
      'VIZOALICA_ANALYTICS_DIGEST_SECRET',
      'VIZOALICA_TOKEN_SECRET'
    ]);
    const bulk = wrangler.calls.find((call) => call.args[1] === 'bulk')!;
    expect(Object.keys(JSON.parse(bulk.options.stdin!))).not.toContain('VIZOALICA_ADMIN_SECRET');
  });

  it('refuses when there is nothing to update', async () => {
    const wrangler = fakeRun({ ...empty(), 'd1 list': { stdout: '[]' } });
    const { ctx } = fakeCtx({ cwd: tempCheckout(), run: wrangler.run });
    await expect(setUpBackend(ctx, { ...options, firstRun: false })).rejects.toThrow(
      /nothing to update/i
    );
  });

  it('refuses when the local config points at a different install', async () => {
    const cwd = tempCheckout();
    const example = readFileSync(join(cwd, 'deploy/cloudflare/wrangler.example.toml'), 'utf8');
    writeFileSync(
      join(cwd, 'deploy/cloudflare/wrangler.production.toml'),
      example.replace('vizoalica-ingest', 'other-worker')
    );
    const { ctx } = fakeCtx({ cwd, run: fakeRun(installed()).run });
    await expect(setUpBackend(ctx, { ...options, firstRun: false })).rejects.toThrow(
      /other-worker/
    );
  });

  it('accepts a matching local config as is', async () => {
    const cwd = tempCheckout();
    const example = readFileSync(join(cwd, 'deploy/cloudflare/wrangler.example.toml'), 'utf8');
    const config = renderProductionConfig(example, {
      ...DEFAULT_NAMES,
      databaseId: DB_UUID,
      database: DEFAULT_NAMES.database,
      bucket: DEFAULT_NAMES.bucket
    });
    writeFileSync(join(cwd, 'deploy/cloudflare/wrangler.production.toml'), config);
    const { ctx } = fakeCtx({ cwd, run: fakeRun(installed()).run, fetch: workerFetch() });
    expect((await setUpBackend(ctx, { ...options, firstRun: false })).firstRun).toBe(false);
    expect(readFileSync(join(cwd, 'deploy/cloudflare/wrangler.production.toml'), 'utf8')).toBe(
      config
    );
  });
});

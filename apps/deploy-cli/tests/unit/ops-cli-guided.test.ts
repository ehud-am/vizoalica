import { EventEmitter } from 'node:events';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../../../../scripts/vizoalica-ops.js';
import { generateSecret } from '../../../../scripts/ops/secrets.js';
import {
  D1_LIST,
  DEPLOY_OUT,
  R2_LIST,
  WHOAMI,
  WORKER_URL,
  fakeCtx,
  fakePrompt,
  fakeRun,
  tempCheckout
} from '../ops-support.js';

const consoleConfig = (secret: string) => {
  const path = join(mkdtempSync(join(tmpdir(), 'vizoalica-cli-')), 'cfg', 'local-operations.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ VIZOALICA_REMOTE_URL: WORKER_URL, VIZOALICA_ADMIN_SECRET: secret })
  );
  chmodSync(path, 0o600);
  return path;
};
const spawns: Array<{ command: string; args: string[] }> = [];
const deps = (guided?: () => ReturnType<typeof fakeCtx>['ctx'], isTTY = true) => ({
  spawn: ((command: string, args: string[]) => {
    spawns.push({ command, args });
    const child = new EventEmitter() as EventEmitter & { kill: () => boolean };
    child.kill = () => true;
    queueMicrotask(() => child.emit('exit', 0));
    return child;
  }) as never,
  spawnSync: (() => ({})) as never,
  fetch,
  isTTY,
  ...(guided ? { guided } : {})
});

describe('guided commands need an interactive terminal', () => {
  it.each(['install', 'backend', 'connect', 'demo', 'rotate admin'])(
    '%s refuses to run without one',
    async (line) => {
      const path = consoleConfig(generateSecret());
      await expect(
        run([...line.split(' '), '--console-config', path], deps(undefined, false))
      ).rejects.toThrow(/interactive terminal/);
    }
  );
});

describe('pnpm ops rotate', () => {
  it.each([[[]], [['bogus']], [['--console-config', '/x']]])(
    'shows usage for %j',
    async (extra) => {
      await expect(run(['rotate', ...extra], deps())).rejects.toThrow(/Usage: pnpm ops rotate/);
    }
  );

  it('takes the secret kind as a plain word before any flags', async () => {
    const cwd = tempCheckout();
    writeFileSync(join(cwd, 'deploy/cloudflare/wrangler.production.toml'), 'name = "x"\n');
    const wrangler = fakeRun({ 'secret bulk': {} });
    const { ctx } = fakeCtx({
      cwd,
      run: wrangler.run,
      prompt: fakePrompt({ confirm: () => true }).prompt
    });
    await run(
      ['rotate', 'digest', '--console-config', consoleConfig(generateSecret())],
      deps(() => ctx)
    );
    expect(Object.keys(JSON.parse(wrangler.calls[0]!.options.stdin!))).toEqual([
      'VIZOALICA_ANALYTICS_DIGEST_SECRET'
    ]);
  });
});

describe('pnpm ops backend', () => {
  const empty = () => ({
    whoami: { stdout: WHOAMI },
    'd1 list': [{ stdout: '[]' }, { stdout: D1_LIST.replace('vizoalica-config', 'my-db') }],
    'r2 bucket list': { stdout: 'Listing buckets...' },
    'd1 create': {},
    'r2 bucket create': {},
    'd1 migrations apply': {},
    deploy: { stdout: DEPLOY_OUT },
    'secret list': { stdout: '[]' },
    'secret bulk': {}
  });

  it('maps --first-run and the name flags, then points at the next step', async () => {
    const wrangler = fakeRun(empty());
    const { ctx, output } = fakeCtx({
      cwd: tempCheckout(),
      run: wrangler.run,
      fetch: (async () => Response.json({ ok: true })) as typeof fetch
    });
    await run(
      [
        'backend',
        '--first-run',
        '--worker-name',
        'my-worker',
        '--database',
        'my-db',
        '--bucket',
        'my-bucket'
      ],
      deps(() => ctx)
    );
    expect(wrangler.has('d1 create my-db')).toBe(true);
    expect(wrangler.has('r2 bucket create my-bucket')).toBe(true);
    expect(output()).toContain('Next: pnpm ops connect');
  });

  it('--update on an account with nothing installed explains itself', async () => {
    const wrangler = fakeRun({ ...empty(), 'd1 list': { stdout: '[]' } });
    const { ctx } = fakeCtx({ cwd: tempCheckout(), run: wrangler.run });
    await expect(
      run(
        ['backend', '--update'],
        deps(() => ctx)
      )
    ).rejects.toThrow(/nothing to update/i);
  });

  it('says "Updated." after an update', async () => {
    const wrangler = fakeRun({
      whoami: { stdout: WHOAMI },
      'd1 list': { stdout: D1_LIST },
      'r2 bucket list': { stdout: R2_LIST },
      deploy: { stdout: DEPLOY_OUT },
      'secret list': {
        stdout: JSON.stringify(
          [
            'VIZOALICA_ADMIN_SECRET',
            'VIZOALICA_TOKEN_SECRET',
            'VIZOALICA_ANALYTICS_DIGEST_SECRET'
          ].map((name) => ({ name }))
        )
      }
    });
    const { ctx, output } = fakeCtx({
      cwd: tempCheckout(),
      run: wrangler.run,
      fetch: (async () => Response.json({ ok: true })) as typeof fetch
    });
    await run(
      ['backend', '--update'],
      deps(() => ctx)
    );
    expect(output()).toContain('Updated.');
  });
});

describe('pnpm ops connect and demo', () => {
  const okWorker = (secret: string) =>
    (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get('authorization');
      if (url.endsWith('/v1/admin/projects') && (!init?.method || init.method === 'GET'))
        return auth === `Bearer ${secret}` ? Response.json([]) : new Response('', { status: 401 });
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

  it('connect writes the console file and says what to run next', async () => {
    const secret = generateSecret();
    const path = join(
      mkdtempSync(join(tmpdir(), 'vizoalica-cli-')),
      'cfg',
      'local-operations.json'
    );
    const { ctx, output } = fakeCtx({
      cwd: '.',
      fetch: okWorker(secret),
      prompt: fakePrompt({ hidden: () => secret }).prompt
    });
    await run(
      ['connect', '--worker-url', WORKER_URL, '--console-config', path],
      deps(() => ctx)
    );
    expect(output()).toContain('Next: pnpm ops console');
  });

  it('demo --remove uses the saved secret and never asks for the token secret', async () => {
    const secret = generateSecret();
    const path = consoleConfig(secret);
    const prompts = fakePrompt();
    const { ctx, output } = fakeCtx({ cwd: '.', prompt: prompts.prompt, fetch: okWorker(secret) });
    await run(
      ['demo', '--remove', '--console-config', path],
      deps(() => ctx)
    );
    expect(output()).toMatch(/no sample data/);
    expect(prompts.log).toEqual([]);
  });

  it('demo cannot use a OneCLI-managed secret and says why', async () => {
    const path = consoleConfig('onecli-managed');
    const { ctx } = fakeCtx({ cwd: '.' });
    await expect(
      run(
        ['demo', '--console-config', path],
        deps(() => ctx)
      )
    ).rejects.toThrow(/OneCLI/);
  });
});

describe('pnpm ops install', () => {
  it('offers to start the console, and starts it (opening the browser) when accepted', async () => {
    const secret = generateSecret();
    const path = consoleConfig(secret);
    const wrangler = fakeRun({
      whoami: { stdout: WHOAMI },
      'd1 list': { stdout: D1_LIST },
      'r2 bucket list': { stdout: R2_LIST },
      deploy: { stdout: DEPLOY_OUT },
      'secret list': {
        stdout: JSON.stringify(
          [
            'VIZOALICA_ADMIN_SECRET',
            'VIZOALICA_TOKEN_SECRET',
            'VIZOALICA_ANALYTICS_DIGEST_SECRET'
          ].map((name) => ({ name }))
        )
      }
    });
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) =>
      String(input).endsWith('/healthz')
        ? Response.json({ ok: true })
        : new Headers(init?.headers).get('authorization') === `Bearer ${secret}`
          ? Response.json([])
          : new Response('', { status: 401 })) as typeof fetch;
    spawns.length = 0;
    const { ctx } = fakeCtx({ cwd: tempCheckout(), run: wrangler.run, fetch: fetcher });
    await run(
      ['install', '--console-config', path],
      deps(() => ctx)
    );
    expect(spawns.map((entry) => `${entry.command} ${entry.args.join(' ')}`)).toEqual(
      expect.arrayContaining(['pnpm admin-web:dev'])
    );
  });

  it('just prints how to start later when the operator declines', async () => {
    const secret = generateSecret();
    const path = consoleConfig(secret);
    const wrangler = fakeRun({
      whoami: { stdout: WHOAMI },
      'd1 list': { stdout: D1_LIST },
      'r2 bucket list': { stdout: R2_LIST },
      deploy: { stdout: DEPLOY_OUT },
      'secret list': {
        stdout: JSON.stringify(
          [
            'VIZOALICA_ADMIN_SECRET',
            'VIZOALICA_TOKEN_SECRET',
            'VIZOALICA_ANALYTICS_DIGEST_SECRET'
          ].map((name) => ({ name }))
        )
      }
    });
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) =>
      String(input).endsWith('/healthz')
        ? Response.json({ ok: true })
        : new Headers(init?.headers).get('authorization') === `Bearer ${secret}`
          ? Response.json([])
          : new Response('', { status: 401 })) as typeof fetch;
    spawns.length = 0;
    const { ctx, output } = fakeCtx({
      cwd: tempCheckout(),
      run: wrangler.run,
      fetch: fetcher,
      prompt: fakePrompt({
        confirm: (q, fallback) => (q.includes('Start the console') ? false : fallback)
      }).prompt
    });
    await run(
      ['install', '--console-config', path],
      deps(() => ctx)
    );
    expect(spawns).toHaveLength(0);
    expect(output()).toContain('pnpm ops console');
  });
});

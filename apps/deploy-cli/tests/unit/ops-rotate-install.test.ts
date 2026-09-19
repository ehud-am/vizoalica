import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NAMES } from '../../../../scripts/ops/backend.js';
import { install } from '../../../../scripts/ops/install.js';
import { rotateSecrets } from '../../../../scripts/ops/rotate.js';
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

const localPath = () =>
  join(mkdtempSync(join(tmpdir(), 'vizoalica-rotate-')), 'cfg', 'local-operations.json');
const withProductionConfig = (cwd: string) =>
  writeFileSync(
    join(cwd, 'deploy/cloudflare/wrangler.production.toml'),
    'name = "vizoalica-ingest"\n'
  );
function seedLocal(path: string, secret: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ VIZOALICA_REMOTE_URL: WORKER_URL, VIZOALICA_ADMIN_SECRET: secret }),
    { mode: 0o600 }
  );
}
const stored = (calls: Array<{ options: { stdin?: string } }>) =>
  JSON.parse(calls.find((call) => call.options.stdin)!.options.stdin!);

/** A Worker whose administrator secret can change, like a real rotation. */
function rotatingWorker(initial: string) {
  const state = { admin: initial };
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const authorization = new Headers(init?.headers).get('authorization');
    return String(input).endsWith('/v1/admin/projects') && authorization === `Bearer ${state.admin}`
      ? Response.json([])
      : new Response('', { status: 401 });
  }) as typeof fetch;
  return { state, fetcher };
}

describe('rotating secrets', () => {
  it('explains the impact, asks first, and changes nothing when declined', async () => {
    const cwd = tempCheckout();
    withProductionConfig(cwd);
    const wrangler = fakeRun({});
    const { ctx, output } = fakeCtx({
      cwd,
      run: wrangler.run,
      prompt: fakePrompt({ confirm: () => false }).prompt
    });
    await expect(
      rotateSecrets(ctx, { kind: 'admin', localConfigPath: localPath() })
    ).rejects.toThrow(/Cancelled/);
    expect(output()).toMatch(/operator console stops working/);
    expect(wrangler.calls).toHaveLength(0);
  });

  it('needs the checkout that installed the backend', async () => {
    const { ctx } = fakeCtx({ cwd: tempCheckout(), run: fakeRun({}).run });
    await expect(
      rotateSecrets(ctx, { kind: 'admin', localConfigPath: localPath() })
    ).rejects.toThrow(/pnpm ops backend/);
  });

  it('rotates the admin secret on the Worker and on this computer, verifying before it writes', async () => {
    const cwd = tempCheckout();
    withProductionConfig(cwd);
    const oldSecret = generateSecret();
    const path = localPath();
    seedLocal(path, oldSecret);
    const worker = rotatingWorker(oldSecret);
    const wrangler = fakeRun({
      'secret bulk': (call) => {
        worker.state.admin = JSON.parse(call.options.stdin!).VIZOALICA_ADMIN_SECRET;
        return {};
      }
    });
    const prompts = fakePrompt({ confirm: () => true });
    const { ctx, cleared } = fakeCtx({
      cwd,
      run: wrangler.run,
      prompt: prompts.prompt,
      fetch: worker.fetcher
    });

    await rotateSecrets(ctx, { kind: 'admin', localConfigPath: path });

    // Only the admin secret changed, passed on stdin, and it is not in any argument.
    expect(Object.keys(stored(wrangler.calls))).toEqual(['VIZOALICA_ADMIN_SECRET']);
    const fresh = worker.state.admin;
    expect(fresh).not.toBe(oldSecret);
    for (const call of wrangler.calls) expect(call.args.join(' ')).not.toContain(fresh);
    expect(JSON.parse(readFileSync(path, 'utf8')).VIZOALICA_ADMIN_SECRET).toBe(fresh);
    expect(prompts.typed).toEqual(['saved']);
    expect(cleared()).toBe(1);
  });

  it('waits out propagation before updating this computer', async () => {
    const cwd = tempCheckout();
    withProductionConfig(cwd);
    const oldSecret = generateSecret();
    const path = localPath();
    seedLocal(path, oldSecret);
    const worker = rotatingWorker(oldSecret);
    let checks = 0;
    const laggy = (async (input: string | URL | Request, init?: RequestInit) =>
      ++checks < 3
        ? new Response('', { status: 401 })
        : worker.fetcher(input, init)) as typeof fetch;
    const wrangler = fakeRun({
      'secret bulk': (call) => {
        worker.state.admin = JSON.parse(call.options.stdin!).VIZOALICA_ADMIN_SECRET;
        return {};
      }
    });
    const { ctx, slept } = fakeCtx({
      cwd,
      run: wrangler.run,
      prompt: fakePrompt({ confirm: () => true }).prompt,
      fetch: laggy
    });
    await rotateSecrets(ctx, { kind: 'admin', localConfigPath: path });
    expect(slept()).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(readFileSync(path, 'utf8')).VIZOALICA_ADMIN_SECRET).toBe(worker.state.admin);
  });

  it('points a OneCLI computer at its credential card and a console-less one at "connect"', async () => {
    for (const [local, expected] of [
      [
        JSON.stringify({
          VIZOALICA_REMOTE_URL: WORKER_URL,
          VIZOALICA_ADMIN_SECRET: 'onecli-managed'
        }),
        /OneCLI/
      ],
      [undefined, /pnpm ops connect/]
    ] as const) {
      const cwd = tempCheckout();
      withProductionConfig(cwd);
      const path = localPath();
      if (local) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, local, { mode: 0o600 });
      }
      const { ctx, output } = fakeCtx({
        cwd,
        run: fakeRun({ 'secret bulk': {} }).run,
        prompt: fakePrompt({ confirm: () => true }).prompt
      });
      await rotateSecrets(ctx, { kind: 'admin', localConfigPath: path });
      expect(output()).toMatch(expected);
    }
  });

  it('tells the operator exactly what to update for the token secret, and what a digest rotation costs', async () => {
    for (const [kind, expected] of [
      ['token', /wrangler pages secret put VIZOALICA_TOKEN_SECRET/],
      ['digest', /Unique-visitor counts restart/]
    ] as const) {
      const cwd = tempCheckout();
      withProductionConfig(cwd);
      const wrangler = fakeRun({ 'secret bulk': {} });
      const { ctx, output } = fakeCtx({
        cwd,
        run: wrangler.run,
        prompt: fakePrompt({ confirm: () => true }).prompt
      });
      await rotateSecrets(ctx, { kind, localConfigPath: localPath() });
      expect(output()).toMatch(expected);
      expect(Object.keys(stored(wrangler.calls))).toHaveLength(1);
    }
  });

  it('rotates all three at once', async () => {
    const cwd = tempCheckout();
    withProductionConfig(cwd);
    const wrangler = fakeRun({ 'secret bulk': {} });
    const { ctx } = fakeCtx({
      cwd,
      run: wrangler.run,
      prompt: fakePrompt({ confirm: () => true }).prompt
    });
    await rotateSecrets(ctx, { kind: 'all', localConfigPath: localPath() });
    expect(Object.keys(stored(wrangler.calls))).toHaveLength(3);
  });

  it('changes nothing locally when the Worker call fails', async () => {
    const cwd = tempCheckout();
    withProductionConfig(cwd);
    const path = localPath();
    const original = generateSecret();
    seedLocal(path, original);
    const { ctx, cleared } = fakeCtx({
      cwd,
      run: fakeRun({ 'secret bulk': { code: 1, stderr: 'nope' } }).run,
      prompt: fakePrompt({ confirm: () => true }).prompt
    });
    await expect(rotateSecrets(ctx, { kind: 'admin', localConfigPath: path })).rejects.toThrow(
      /nothing was rotated/
    );
    expect(JSON.parse(readFileSync(path, 'utf8')).VIZOALICA_ADMIN_SECRET).toBe(original);
    expect(cleared()).toBe(0);
  });
});

describe('the one-command install', () => {
  const account = () => ({
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

  /** A Worker that accepts whatever admin secret the install just stored, plus the demo endpoints. */
  function liveWorker(run: ReturnType<typeof fakeRun>) {
    const secrets = () => stored(run.calls);
    return (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      if (url.pathname === '/healthz') return Response.json({ ok: true });
      if (url.pathname === '/v1/events:batch') return Response.json({}, { status: 202 });
      const ok =
        new Headers(init?.headers).get('authorization') ===
        `Bearer ${secrets().VIZOALICA_ADMIN_SECRET}`;
      if (!ok) return new Response('', { status: 401 });
      if (url.pathname === '/v1/admin/projects' && method === 'GET') return Response.json([]);
      if (url.pathname === '/v1/admin/projects')
        return Response.json({ id: 'p1' }, { status: 201 });
      if (url.pathname.endsWith('/sources'))
        return Response.json({ id: 's1', publicSourceKey: 'k' }, { status: 201 });
      if (url.pathname.endsWith('/analytics'))
        return Response.json({ totals: { pageViews: 96, uniqueUsers: 30 } });
      return new Response('{}', { status: 404 });
    }) as typeof fetch;
  }

  it('goes from an empty Cloudflare account to a connected console with sample data', async () => {
    const cwd = tempCheckout();
    const wrangler = fakeRun(account());
    const path = localPath();
    const { ctx, output } = fakeCtx({ cwd, run: wrangler.run, fetch: liveWorker(wrangler) });
    const result = await install(ctx, { ...DEFAULT_NAMES, localConfigPath: path });
    expect(result).toEqual({ workerUrl: WORKER_URL, connected: true, demo: true });
    // The generated admin secret went straight into the private file: the operator was never asked for a key.
    expect(JSON.parse(readFileSync(path, 'utf8')).VIZOALICA_ADMIN_SECRET).toBe(
      stored(wrangler.calls).VIZOALICA_ADMIN_SECRET
    );
    expect(output()).toContain('96 page views from 30 visitors');
    expect(output()).toContain('Setup complete');
    expect(output()).toContain(`Worker: ${WORKER_URL}`);
    expect(output()).toContain('with sample data');
  });

  it('skips the console and sample data when the operator declines', async () => {
    const wrangler = fakeRun(account());
    const { ctx } = fakeCtx({
      cwd: tempCheckout(),
      run: wrangler.run,
      fetch: liveWorker(wrangler),
      prompt: fakePrompt({
        confirm: (q, fallback) =>
          q.includes('operator console') || q.includes('sample data') ? false : fallback
      }).prompt
    });
    expect(await install(ctx, { ...DEFAULT_NAMES, localConfigPath: localPath() })).toMatchObject({
      connected: false,
      demo: false
    });
  });

  it('offers a sample only right after a first install, not on an update', async () => {
    const cwd = tempCheckout();
    const path = localPath();
    const secret = generateSecret();
    seedLocal(path, secret);
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
    const prompts = fakePrompt();
    const fetcher = (async (input: string | URL | Request, init?: RequestInit) =>
      String(input).endsWith('/healthz')
        ? Response.json({ ok: true })
        : new Headers(init?.headers).get('authorization') === `Bearer ${secret}`
          ? Response.json([])
          : new Response('', { status: 401 })) as typeof fetch;
    const { ctx } = fakeCtx({ cwd, run: wrangler.run, prompt: prompts.prompt, fetch: fetcher });
    expect(await install(ctx, { ...DEFAULT_NAMES, localConfigPath: path })).toMatchObject({
      connected: true,
      demo: false
    });
    expect(prompts.log.some((line) => line.includes('sample data'))).toBe(false);
  });
});

import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { connectConsole } from '../../../../scripts/ops/connect.js';
import { generateSecret } from '../../../../scripts/ops/secrets.js';
import { WORKER_URL, fakeCtx, fakePrompt, workerFetch } from '../ops-support.js';

const target = () =>
  join(mkdtempSync(join(tmpdir(), 'vizoalica-connect-')), 'cfg', 'local-operations.json');
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;

describe('connecting this computer as an operator console', () => {
  it('verifies the secret first, then writes an owner-only file in an owner-only directory', async () => {
    const secret = generateSecret();
    const configPath = target();
    const { ctx } = fakeCtx({ cwd: '.', fetch: workerFetch({ adminSecret: secret }) });
    const result = await connectConsole(ctx, {
      configPath,
      workerUrl: WORKER_URL,
      adminSecret: secret
    });
    expect(result).toMatchObject({ workerUrl: WORKER_URL, changed: true });
    expect(read(configPath)).toEqual({
      VIZOALICA_REMOTE_URL: WORKER_URL,
      VIZOALICA_ADMIN_SECRET: secret
    });
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    expect(statSync(join(configPath, '..')).mode & 0o777).toBe(0o700);
  });

  it('asks for the secret with a hidden prompt when it was not just generated', async () => {
    const secret = generateSecret();
    const prompts = fakePrompt({ hidden: () => secret });
    const { ctx } = fakeCtx({
      cwd: '.',
      prompt: prompts.prompt,
      fetch: workerFetch({ adminSecret: secret })
    });
    await connectConsole(ctx, { configPath: target(), workerUrl: WORKER_URL });
    expect(prompts.log.some((line) => line.startsWith('hidden:'))).toBe(true);
  });

  it('asks for the Worker address when nothing knows it', async () => {
    const secret = generateSecret();
    const { ctx } = fakeCtx({
      cwd: '.',
      prompt: fakePrompt({ text: () => WORKER_URL }).prompt,
      fetch: workerFetch({ adminSecret: secret })
    });
    expect(
      (await connectConsole(ctx, { configPath: target(), adminSecret: secret })).workerUrl
    ).toBe(WORKER_URL);
  });

  it('writes nothing when the Worker rejects the secret', async () => {
    const configPath = target();
    const { ctx } = fakeCtx({ cwd: '.', fetch: workerFetch({ adminSecret: generateSecret() }) });
    await expect(
      connectConsole(ctx, { configPath, workerUrl: WORKER_URL, adminSecret: generateSecret() })
    ).rejects.toThrow(/rejected that secret/);
    expect(existsSync(configPath)).toBe(false);
  });

  it.each([
    ['not a secret at all', 'too short', /does not look like a Vizoalica secret/],
    ['an unreachable Worker', generateSecret(), /Could not reach/]
  ])('rejects %s', async (_label, secret, message) => {
    const failing = (async () => Promise.reject(new Error('offline'))) as typeof fetch;
    const { ctx } = fakeCtx({ cwd: '.', fetch: failing });
    await expect(
      connectConsole(ctx, { configPath: target(), workerUrl: WORKER_URL, adminSecret: secret })
    ).rejects.toThrow(message);
  });

  it('rejects an address that is not a Vizoalica Worker', async () => {
    const other = (async () => new Response('<html>', { status: 200 })) as typeof fetch;
    const { ctx } = fakeCtx({ cwd: '.', fetch: other });
    await expect(
      connectConsole(ctx, {
        configPath: target(),
        workerUrl: WORKER_URL,
        adminSecret: generateSecret()
      })
    ).rejects.toThrow(/not like a Vizoalica Worker/);
  });

  it('leaves a working connection alone', async () => {
    const secret = generateSecret();
    const configPath = target();
    const first = fakeCtx({ cwd: '.', fetch: workerFetch({ adminSecret: secret }) });
    await connectConsole(first.ctx, { configPath, workerUrl: WORKER_URL, adminSecret: secret });
    const before = readFileSync(configPath, 'utf8');
    const again = fakeCtx({ cwd: '.', fetch: workerFetch({ adminSecret: secret }) });
    const result = await connectConsole(again.ctx, { configPath });
    expect(result.changed).toBe(false);
    expect(readFileSync(configPath, 'utf8')).toBe(before);
  });

  it('replaces a saved secret that stopped working, for example after a rotation', async () => {
    const oldSecret = generateSecret();
    const newSecret = generateSecret();
    const configPath = target();
    const setup = fakeCtx({ cwd: '.', fetch: workerFetch({ adminSecret: oldSecret }) });
    await connectConsole(setup.ctx, { configPath, workerUrl: WORKER_URL, adminSecret: oldSecret });
    const { ctx, output } = fakeCtx({
      cwd: '.',
      prompt: fakePrompt({ hidden: () => newSecret }).prompt,
      fetch: workerFetch({ adminSecret: newSecret })
    });
    const result = await connectConsole(ctx, { configPath });
    expect(result.changed).toBe(true);
    expect(output()).toMatch(/no longer works/);
    expect(read(configPath).VIZOALICA_ADMIN_SECRET).toBe(newSecret);
  });

  it('does nothing on a computer that already uses OneCLI', async () => {
    const configPath = target();
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        VIZOALICA_REMOTE_URL: WORKER_URL,
        VIZOALICA_ADMIN_SECRET: 'onecli-managed'
      }),
      { mode: 0o600 }
    );
    const { ctx } = fakeCtx({ cwd: '.' });
    const result = await connectConsole(ctx, { configPath });
    expect(result).toMatchObject({ changed: false, adminSecret: undefined });
    expect(read(configPath).VIZOALICA_ADMIN_SECRET).toBe('onecli-managed');
  });
});

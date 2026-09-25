import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Run } from '@vizoalica/ops-core';
import { describe, expect, it, vi } from 'vitest';
import { Vault } from '../../local-ops-api/src/environments/vault.js';
import type { DeployDeps } from '../src/deploy-command.js';
import { rotateCommand } from '../src/rotate-command.js';
import { tempHome, writePrivate } from './support.js';

const ACCOUNT = 'a'.repeat(32);
const OLD = 'old-admin-secret-0123456789abcdefghijklmnop';
const prod = { url: 'https://prod-vizoalica-worker.acme.workers.dev', role: 'admin', secret: OLD };

function setup(options: { answers?: string[]; interactive?: boolean; bulkFails?: boolean } = {}) {
  const home = tempHome();
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const answers = [...(options.answers ?? [])];
  const calls: Array<{ args: readonly string[]; env?: Record<string, string>; stdin?: string }> =
    [];
  const stored: Record<string, string> = {};
  const run: Run = async (args, runOptions = {}) => {
    calls.push({ args, ...runOptions });
    if (args[0] === 'whoami') return { code: 0, stdout: `│ Acme │ ${ACCOUNT} │`, stderr: '' };
    if (args[0] === 'secret' && args[1] === 'bulk') {
      if (options.bulkFails) return { code: 1, stdout: '', stderr: 'Authentication error [10000]' };
      Object.assign(stored, JSON.parse(runOptions.stdin ?? '{}'));
      return { code: 0, stdout: '', stderr: '' };
    }
    return { code: 1, stdout: '', stderr: `unexpected ${args.join(' ')}` };
  };
  const deps: DeployDeps = {
    home,
    version: '0.7.0',
    assetDir: '/assets/dist',
    env: { CLOUDFLARE_API_TOKEN: 'cf-token' },
    out: (text) => void out.push(text),
    err: (text) => void err.push(text),
    interactive: options.interactive ?? true,
    ask: async (question) => {
      asked.push(question.split('\n').pop()!);
      return answers.shift() ?? '';
    },
    readStdin: async () => '',
    vault: new Vault(vi.fn() as never),
    run,
    fetch: vi.fn(async (input: URL | string, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      const ok =
        new Headers(init?.headers).get('authorization') ===
        `Bearer ${stored.VIZOALICA_ADMIN_SECRET}`;
      if (!ok) return Response.json({ error: 'unauthorized' }, { status: 401 });
      if (path === '/v1/admin/whoami')
        return Response.json({ role: 'admin', scope: {}, workerVersion: '0.7.0', features: {} });
      return Response.json({ workerVersion: '0.7.0', schema: { applied: 1, status: 'current' } });
    })
  };
  writePrivate(home, 'environments.json', { version: 1, environments: { prod } });
  const environments = () =>
    (
      JSON.parse(readFileSync(join(home, '.config', 'vizoalica', 'environments.json'), 'utf8')) as {
        environments: Record<string, { secret: unknown }>;
      }
    ).environments;
  return {
    deps,
    calls,
    stored,
    asked,
    environments,
    home,
    text: () => out.join(''),
    errors: () => err.join('')
  };
}

describe('vizoalica rotate', () => {
  it('replaces the token secret on the Worker, shows it once, and waits until it is saved', async () => {
    const t = setup({ answers: ['rotate', 'saved'] });
    expect(await rotateCommand(['prod', 'token'], t.deps)).toBe(0);
    const bulk = t.calls.find((call) => call.args[1] === 'bulk')!;
    expect(bulk.args).toEqual(['secret', 'bulk', '--name', 'prod-vizoalica-worker']);
    expect(bulk.env).toEqual({ CLOUDFLARE_ACCOUNT_ID: ACCOUNT });
    expect(Object.keys(t.stored)).toEqual(['VIZOALICA_TOKEN_SECRET']);
    const text = t.text();
    expect(text).toContain('VIZOALICA_TOKEN_SECRET GitHub secret of each website');
    expect(text).toContain(`VIZOALICA_TOKEN_SECRET\n    ${t.stored.VIZOALICA_TOKEN_SECRET}\n`);
    expect(t.asked).toEqual([
      'Type "rotate" to continue: ',
      'When you have saved them, type "saved": '
    ]);
    expect(t.environments().prod!.secret).toBe(OLD);
  });

  it('rotates the admin secret into the environment file without printing it, and verifies it', async () => {
    const t = setup({ answers: ['rotate'] });
    expect(await rotateCommand(['prod', 'admin'], t.deps)).toBe(0);
    const secret = t.stored.VIZOALICA_ADMIN_SECRET!;
    expect(t.environments().prod!.secret).toBe(secret);
    expect(t.text()).not.toContain(secret);
    expect(t.text()).toContain('"prod" works with it.');
  });

  it('changes nothing unless confirmed, or when storing fails', async () => {
    const no = setup({ answers: ['no'] });
    expect(await rotateCommand(['prod', 'all'], no.deps)).toBe(1);
    expect(no.errors()).toContain('Nothing was rotated');
    expect(no.calls.some((call) => call.args[1] === 'bulk')).toBe(false);
    const failing = setup({ answers: ['rotate'], bulkFails: true });
    expect(await rotateCommand(['prod', 'admin'], failing.deps)).toBe(1);
    expect(failing.errors()).toContain('nothing was rotated');
    expect(failing.environments().prod!.secret).toBe(OLD);
  });

  it('without a terminal needs --yes and a new --secrets-file for secrets it has to hand over', async () => {
    const t = setup({ interactive: false });
    expect(await rotateCommand(['prod', 'token', '--yes'], t.deps)).toBe(1);
    expect(t.errors()).toContain('--secrets-file');
    expect(await rotateCommand(['prod', 'admin'], t.deps)).toBe(1);
    expect(t.errors()).toContain('--yes');
    const file = join(t.home, 'new-secrets.env');
    expect(await rotateCommand(['prod', 'digest', '--yes', '--secrets-file', file], t.deps)).toBe(
      0
    );
    expect(readFileSync(file, 'utf8')).toBe(
      `VIZOALICA_ANALYTICS_DIGEST_SECRET=${t.stored.VIZOALICA_ANALYTICS_DIGEST_SECRET}\n`
    );
    expect(t.text()).not.toContain(t.stored.VIZOALICA_ANALYTICS_DIGEST_SECRET!);
  });

  it('refuses an unknown environment or secret, and a role that is not admin', async () => {
    const t = setup();
    expect(await rotateCommand(['nope', 'token'], t.deps)).toBe(1);
    expect(t.errors()).toContain('no environment named "nope"');
    expect(await rotateCommand(['prod', 'password'], t.deps)).toBe(1);
    expect(t.errors()).toContain('<admin|token|digest|all>');
    writePrivate(t.home, 'environments.json', {
      version: 1,
      environments: { prod: { ...prod, role: 'analyst' } }
    });
    expect(await rotateCommand(['prod', 'token'], t.deps)).toBe(1);
    expect(t.errors()).toContain('Only its administrator');
    expect(existsSync(join(t.home, 'new-secrets.env'))).toBe(false);
  });

  it('asks for the Worker name when the address is a custom domain', async () => {
    const t = setup();
    writePrivate(t.home, 'environments.json', {
      version: 1,
      environments: { prod: { ...prod, url: 'https://analytics.example.com' } }
    });
    expect(await rotateCommand(['prod', 'token'], t.deps)).toBe(1);
    expect(t.errors()).toContain('--worker <name>');
  });
});

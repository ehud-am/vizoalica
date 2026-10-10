import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentDef } from '../src/environments/file.js';
import { Vault, VaultError } from '../src/environments/vault.js';
import { verifyCloudflareToken, verifyEnvironment } from '../src/environments/verify.js';
import { stubWorker } from './worker-stub.js';

afterEach(() => vi.unstubAllGlobals());

const vault = new Vault(vi.fn() as never);
const deps = { version: '0.7.0', expectedSchema: 1, vault };
const admin: EnvironmentDef = { url: 'https://w.example.com', role: 'admin', secret: 'the-secret' };
const current = { workerVersion: '0.7.0', schemaApplied: 1 };

describe('verifyEnvironment', () => {
  it('is usable when the Worker accepts the secret and reports the chosen role', async () => {
    const { requests } = stubWorker({ role: 'admin', ...current, accept: ['the-secret'] });
    const state = await verifyEnvironment('prod', admin, deps);
    expect(state).toMatchObject({
      name: 'prod',
      usable: true,
      role: 'admin',
      actualRole: 'admin',
      secretSource: 'file',
      cloudflare: 'none',
      problems: []
    });
    expect(requests[0]).toMatchObject({
      path: '/v1/admin/whoami',
      authorization: 'Bearer the-secret'
    });
    expect(JSON.stringify(state)).not.toContain('the-secret');
  });

  it('works for a custom domain and for owner and analyst keys', async () => {
    stubWorker({ role: 'analyst', ...current });
    const state = await verifyEnvironment(
      'stage',
      { url: 'https://analytics.example.org', role: 'analyst', secret: 'k' },
      deps
    );
    expect(state.usable).toBe(true);
    expect(state.url).toBe('https://analytics.example.org');
  });

  it.each([
    ['admin', 'owner', 'a website owner access key'],
    ['analyst', 'admin', 'an analyst access key'],
    ['owner', 'analyst', 'an owner']
  ] as const)('refuses a %s credential used as %s', async (actual, chosen) => {
    stubWorker({ role: actual, ...current });
    const state = await verifyEnvironment(
      'x',
      { url: 'https://w.example.com', role: chosen, secret: 'k' },
      deps
    );
    expect(state.usable).toBe(false);
    expect(state.actualRole).toBe(actual);
    expect(state.problems[0]).toMatchObject({ code: 'wrong_role' });
    expect(state.problems[0]!.message).toContain(`says ${chosen}`);
  });

  it('says a rejected secret is rejected, differently for an admin and for a key holder', async () => {
    stubWorker({ accept: ['other'] });
    const a = await verifyEnvironment('p', admin, deps);
    expect(a.problems[0]).toMatchObject({ code: 'unauthorized' });
    expect(a.problems[0]!.message).toContain('administrator secret');
    const k = await verifyEnvironment('p', { ...admin, role: 'analyst' }, deps);
    expect(k.problems[0]!.message).toContain('access key');
  });

  it('reports an unreachable Worker', async () => {
    stubWorker({ fail: 'network' });
    const state = await verifyEnvironment('p', admin, deps);
    expect(state.problems[0]).toMatchObject({ code: 'unreachable' });
    expect(state.problems[0]!.message).toContain('https://w.example.com');
  });

  it('reports a database this console cannot work with', async () => {
    stubWorker({ role: 'admin', workerVersion: '0.7.0', schemaApplied: 9 });
    const state = await verifyEnvironment('p', admin, deps);
    expect(state.problems[0]).toMatchObject({ code: 'incompatible' });
  });

  it('carries on when only the version route fails', async () => {
    const stub = stubWorker({ role: 'admin', ...current });
    const original = stub.fetchMock.getMockImplementation()!;
    stub.fetchMock.mockImplementation(async (input, init) =>
      String(input).endsWith('/v1/admin/backend')
        ? Response.json({}, { status: 500 })
        : original(input, init)
    );
    expect((await verifyEnvironment('p', admin, deps)).usable).toBe(true);
  });

  it('checks an admin Cloudflare token too, and reports which check failed', async () => {
    const stub = stubWorker({ role: 'admin', ...current });
    const worker = stub.fetchMock.getMockImplementation()!;
    stub.fetchMock.mockImplementation(async (input, init) =>
      String(input).startsWith('https://api.cloudflare.com')
        ? Response.json({ success: false }, { status: 401 })
        : worker(input, init)
    );
    const state = await verifyEnvironment('p', { ...admin, cloudflare: { token: 'cf' } }, deps);
    expect(state.cloudflare).toBe('file');
    expect(state.usable).toBe(false);
    expect(state.problems.map((problem) => problem.code)).toEqual(['cloudflare_rejected']);
  });

  it('uses OneCLI for a vault-held secret: the placeholder goes out through the helper', async () => {
    const seen: Array<{ url: string; authorization: string }> = [];
    const spawn = vi.fn(() => {
      throw new Error('should not spawn: the vault is faked below');
    });
    const fakeVault = new Vault(spawn as never);
    vi.spyOn(fakeVault, 'fetchFor').mockReturnValue(async (input, init) => {
      const url = String(input);
      seen.push({ url, authorization: new Headers(init?.headers).get('authorization') ?? '' });
      return url.endsWith('/whoami')
        ? Response.json({ role: 'admin', scope: {}, workerVersion: '0.7.0', features: {} })
        : Response.json({
            workerVersion: '0.7.0',
            schema: { applied: 1, expected: 1, appliedNames: [], status: 'current' }
          });
    });
    const onecli = { workspace: 'acme', agent: 'vz', gateway: 'localhost:10255' };
    const state = await verifyEnvironment(
      'p',
      { ...admin, secret: { onecli } },
      { ...deps, vault: fakeVault }
    );
    expect(state).toMatchObject({ usable: true, secretSource: 'onecli' });
    expect(seen[0]).toEqual({
      url: 'https://w.example.com/v1/admin/whoami',
      authorization: 'Bearer onecli-managed'
    });
  });

  it('turns a OneCLI failure into its own plain problem, for the secret and for the token', async () => {
    const failing = new Vault(vi.fn() as never);
    vi.spyOn(failing, 'fetchFor').mockReturnValue(async () => {
      throw new VaultError('onecli_not_installed', 'OneCLI is not installed.');
    });
    const onecli = { workspace: 'w', agent: 'a', gateway: 'g:1' };
    const state = await verifyEnvironment(
      'p',
      { ...admin, secret: { onecli }, cloudflare: { token: { onecli } } },
      { ...deps, vault: failing }
    );
    expect(state.usable).toBe(false);
    expect(state.problems.map((problem) => problem.code)).toEqual(['onecli', 'onecli']);
    expect(state.problems[0]!.message).toContain('not installed');
  });
});

describe('verifyCloudflareToken', () => {
  const call = (responses: Record<string, Response | 'network'>) =>
    verifyCloudflareToken('cf-token', {
      vault,
      fetch: async (input) => {
        const path = String(input).replace('https://api.cloudflare.com/client/v4', '');
        const answer = responses[path];
        if (answer === 'network') throw new TypeError('offline');
        return answer ?? Response.json({}, { status: 404 });
      }
    });

  it('accepts an active user token', async () => {
    expect(
      await call({ '/user/tokens/verify': Response.json({ result: { status: 'active' } }) })
    ).toBeUndefined();
  });

  it('accepts an account token that the user endpoint does not know', async () => {
    expect(
      await call({
        '/user/tokens/verify': Response.json({}, { status: 401 }),
        '/accounts?per_page=1': Response.json({ result: [] })
      })
    ).toBeUndefined();
  });

  it('names an expired or disabled token', async () => {
    const problem = await call({
      '/user/tokens/verify': Response.json({ result: { status: 'expired' } })
    });
    expect(problem).toMatchObject({ code: 'cloudflare_rejected' });
    expect(problem?.message).toContain('expired');
  });

  it('rejects a token neither endpoint accepts, and reports an unreachable Cloudflare', async () => {
    expect(await call({})).toMatchObject({ code: 'cloudflare_rejected' });
    expect(await call({ '/user/tokens/verify': 'network' })).toMatchObject({
      code: 'cloudflare_unreachable'
    });
  });
});

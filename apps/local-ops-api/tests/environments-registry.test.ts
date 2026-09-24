import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Registry } from '../src/environments/registry.js';
import { Vault } from '../src/environments/vault.js';
import type { EnvironmentState } from '../src/environments/verify.js';
import { stubWorker } from './worker-stub.js';

afterEach(() => vi.unstubAllGlobals());

const def = (role = 'admin', secret = 'k') => ({ url: 'https://w.example.com', role, secret });
function setup(
  environments: Record<string, unknown>,
  extra: { ttlMs?: number; now?: () => number } = {}
) {
  const home = mkdtempSync(join(tmpdir(), 'vizoalica-registry-'));
  const file = join(home, 'environments.json');
  const save = (value: Record<string, unknown>) => {
    writeFileSync(file, JSON.stringify({ version: 1, environments: value }), { mode: 0o600 });
    chmodSync(file, 0o600);
  };
  save(environments);
  const registry = new Registry({
    homeDir: home,
    preferencesPath: join(home, 'preferences.json'),
    version: '0.7.0',
    expectedSchema: 1,
    vault: new Vault(vi.fn() as never),
    ...extra
  });
  return { registry, home, file, save };
}
const stub = (options = {}) =>
  stubWorker({ role: 'admin', workerVersion: '0.7.0', schemaApplied: 1, ...options });

describe('Registry', () => {
  it('selects the first usable environment when nothing was chosen before', async () => {
    stub();
    const { registry } = setup({ b: def(), a: def() });
    await registry.refresh();
    expect(registry.snapshot.selected).toBe('a');
    expect(registry.current()).toMatchObject({
      name: 'a',
      remoteUrl: 'https://w.example.com',
      role: 'admin'
    });
    expect(registry.snapshot.environments.map((item) => item.name)).toEqual(['a', 'b']);
  });

  it('has no selection, with the reasons, when nothing is usable', async () => {
    stubWorker({ accept: ['other'] });
    const { registry } = setup({ prod: def() });
    await registry.refresh();
    expect(registry.current()).toBeUndefined();
    expect(registry.snapshot.selected).toBeUndefined();
    expect(registry.snapshot.environments[0]!.problems[0]!.code).toBe('unauthorized');
  });

  it('shows a broken file, and an invalid entry, without failing', async () => {
    stub();
    const { registry, file, save } = setup({ ok: def(), bad: { url: 'x' } });
    await registry.refresh();
    expect(registry.snapshot.environments.find((item) => item.name === 'bad')).toMatchObject({
      usable: false,
      problems: [{ code: 'invalid' }]
    });
    expect(registry.snapshot.selected).toBe('ok');
    writeFileSync(file, '{');
    await registry.refresh();
    expect(registry.snapshot.file).toMatchObject({
      status: 'broken',
      reason: expect.stringContaining('JSON')
    });
    expect(registry.current()).toBeUndefined();
    save({ ok: def() });
    await registry.refresh();
    expect(registry.snapshot.file.status).toBe('ok');
    expect(registry.current()?.name).toBe('ok');
  });

  it('notices a hand edit of the file without a restart, and bumps the revision', async () => {
    stub();
    const { registry, save } = setup({ prod: def() });
    await registry.refresh();
    const before = registry.revision;
    save({ prod: { ...def(), url: 'https://analytics.example.org' } });
    await registry.refresh();
    expect(registry.current()?.remoteUrl).toBe('https://analytics.example.org');
    expect(registry.revision).toBeGreaterThan(before);
  });

  it('does not check again within the freshness window, and does after it', async () => {
    const { requests } = stub();
    let now = 0;
    const { registry } = setup({ prod: def() }, { ttlMs: 1000, now: () => now });
    await registry.refresh();
    const first = requests.length;
    await registry.refresh();
    expect(requests.length).toBe(first);
    now = 5000;
    await registry.refresh();
    expect(requests.length).toBeGreaterThan(first);
    await registry.refresh(true);
    expect(requests.length).toBeGreaterThan(first * 2);
  });

  it('shares one check between callers that arrive together', async () => {
    const { requests } = stub();
    const { registry } = setup({ prod: def() });
    await Promise.all([registry.refresh(), registry.refresh(), registry.refresh()]);
    expect(requests.filter((request) => request.path === '/v1/admin/whoami')).toHaveLength(1);
  });

  it('remembers a selection for next time, and prefers it', async () => {
    stub();
    const first = setup({ a: def(), b: def() });
    await first.registry.select('b');
    expect(first.registry.current()?.name).toBe('b');
    expect(JSON.parse(readFileSync(join(first.home, 'preferences.json'), 'utf8'))).toMatchObject({
      environment: 'b'
    });
    const second = new Registry({
      homeDir: first.home,
      preferencesPath: join(first.home, 'preferences.json'),
      version: '0.7.0',
      expectedSchema: 1,
      vault: new Vault(vi.fn() as never)
    });
    await second.refresh();
    expect(second.current()?.name).toBe('b');
  });

  it('falls back to another usable environment when the remembered one stops working', async () => {
    const stubbed = stub();
    const { registry } = setup({ a: def('admin', 'good'), b: def('admin', 'bad') });
    await registry.select('b');
    const original = stubbed.fetchMock.getMockImplementation()!;
    stubbed.fetchMock.mockImplementation(async (input, init) =>
      new Headers(init?.headers).get('authorization') === 'Bearer bad'
        ? Response.json({}, { status: 401 })
        : original(input, init)
    );
    await registry.refresh(true);
    expect(registry.current()?.name).toBe('a');
  });

  it('refuses to select an unknown or unusable environment', async () => {
    const stubbed = stub();
    const original = stubbed.fetchMock.getMockImplementation()!;
    stubbed.fetchMock.mockImplementation(async (input, init) =>
      new Headers(init?.headers).get('authorization') === 'Bearer bad'
        ? Response.json({}, { status: 401 })
        : original(input, init)
    );
    const { registry } = setup({ a: def(), b: def('admin', 'bad') });
    await expect(registry.select('nope')).rejects.toThrow('environment_not_found');
    await expect(registry.select('b')).rejects.toThrow('environment_unusable');
    expect(registry.current()?.name).toBe('a');
  });

  it('uses an injected check and list when given one, and never writes the environments file', async () => {
    const verify = vi.fn(async (name: string): Promise<EnvironmentState> => ({
      name,
      cloudflare: 'none',
      usable: true,
      problems: []
    }));
    const registry = new Registry({
      version: '0.7.0',
      expectedSchema: 1,
      vault: new Vault(vi.fn() as never),
      verify: verify as never,
      load: () => ({ status: 'ok', path: '', entries: [{ name: 'x', def: def() as never }] })
    });
    await registry.refresh();
    expect(registry.current()?.name).toBe('x');
    await registry.select('x');
  });
});

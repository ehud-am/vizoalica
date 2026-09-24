import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Vault } from '../../local-ops-api/src/environments/vault.js';
import { envCommand, type EnvDeps } from '../src/env-command.js';
import { stubWorker } from '../../local-ops-api/tests/worker-stub.js';
import { tempHome, writePrivate } from './support.js';

afterEach(() => vi.unstubAllGlobals());

function setup(answers: string[] = [], stdin = '') {
  const home = tempHome();
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  const deps: EnvDeps = {
    home,
    version: '0.7.0',
    assetDir: '/assets/dist',
    out: (text) => void out.push(text),
    err: (text) => void err.push(text),
    interactive: answers.length > 0,
    ask: async (question) => {
      asked.push(question);
      return answers.shift() ?? '';
    },
    readStdin: async () => stdin,
    vault: new Vault(vi.fn() as never)
  };
  const file = join(home, '.config', 'vizoalica', 'environments.json');
  const read = () =>
    JSON.parse(readFileSync(file, 'utf8')) as {
      environments: Record<string, Record<string, unknown>>;
    };
  const seed = (environments: Record<string, unknown>) =>
    writePrivate(home, 'environments.json', { version: 1, environments });
  return {
    deps,
    home,
    file,
    out,
    err,
    asked,
    read,
    seed,
    text: () => out.join(''),
    errors: () => err.join('')
  };
}
const worker = (accept = ['good']) =>
  stubWorker({ role: 'admin', workerVersion: '0.7.0', schemaApplied: 1, accept });
const admin = { url: 'https://w.example.com', role: 'admin', secret: 'good' };

describe('vizoalica env (help and errors)', () => {
  it('shows usage with no command, and rejects an unknown command or option', async () => {
    const t = setup();
    expect(await envCommand([], t.deps)).toBe(0);
    expect(t.text()).toContain('vizoalica env');
    expect(await envCommand(['bogus', 'x'], t.deps)).toBe(1);
    expect(await envCommand(['add', 'x', '--bogus'], t.deps)).toBe(1);
    expect(t.errors()).toContain('Unknown option: --bogus');
    expect(await envCommand(['add', 'x', '--url'], t.deps)).toBe(1);
    expect(t.errors()).toContain('--url needs a value');
  });

  it('reports a broken environments file with its path, and does nothing', async () => {
    const t = setup();
    mkdirSync(join(t.home, '.config', 'vizoalica'), { recursive: true });
    writeFileSync(t.file, '{', { mode: 0o600 });
    expect(await envCommand(['list'], t.deps)).toBe(1);
    expect(t.errors()).toContain(t.file);
    expect(await envCommand(['remove', 'x', '--yes'], t.deps)).toBe(1);
  });
});

describe('vizoalica env list and check', () => {
  it('says how to add the first environment', async () => {
    const t = setup();
    expect(await envCommand(['list'], t.deps)).toBe(0);
    expect(t.text()).toContain('vizoalica env add');
    expect(await envCommand(['check'], t.deps)).toBe(1);
  });

  it('shows each environment with its state and never a secret', async () => {
    worker();
    const t = setup();
    t.seed({ dev: admin, prod: { ...admin, secret: 'bad-secret-value' }, bad: { url: 'x' } });
    expect(await envCommand(['list'], t.deps)).toBe(0);
    const text = t.text();
    expect(text).toContain('✓ dev  (admin, https://w.example.com, secret: file)');
    expect(text).toContain('✗ prod');
    expect(text).toContain('rejected');
    expect(text).toContain('✗ bad');
    expect(text).not.toContain('bad-secret-value');
    expect(text).not.toContain('good');
  });

  it('check fails when any environment is unusable, and can look at just one', async () => {
    worker();
    const t = setup();
    t.seed({ dev: admin, prod: { ...admin, secret: 'nope' } });
    expect(await envCommand(['check'], t.deps)).toBe(1);
    expect(await envCommand(['check', 'dev'], t.deps)).toBe(0);
    expect(await envCommand(['check', 'missing'], t.deps)).toBe(1);
    expect(t.errors()).toContain('no environment named "missing"');
  });
});

describe('vizoalica env add', () => {
  it('verifies, then writes a private file with the secret read from stdin', async () => {
    const stubbed = worker();
    const t = setup([], 'good\n');
    const code = await envCommand(
      [
        'add',
        'prod',
        '--url',
        'https://analytics.example.com',
        '--role',
        'admin',
        '--secret-stdin'
      ],
      t.deps
    );
    expect(code).toBe(0);
    expect(t.read()).toEqual({
      version: 1,
      environments: {
        prod: { url: 'https://analytics.example.com', role: 'admin', secret: 'good' }
      }
    });
    expect(statSync(t.file).mode & 0o777).toBe(0o600);
    expect(stubbed.requests[0]!.authorization).toBe('Bearer good');
    expect(t.text()).not.toContain('good');
  });

  it('asks for what is missing in a terminal, hiding secrets, and takes an optional Cloudflare token', async () => {
    const stubbed = worker();
    const cf = stubbed.fetchMock.getMockImplementation()!;
    stubbed.fetchMock.mockImplementation(async (input, init) =>
      String(input).startsWith('https://api.cloudflare.com')
        ? Response.json({ result: { status: 'active' } })
        : cf(input, init)
    );
    const t = setup(['https://w.example.com', 'admin', 'good', 'cf-token']);
    const ask = vi.spyOn(t.deps, 'ask');
    expect(await envCommand(['add', 'prod'], t.deps)).toBe(0);
    expect(ask.mock.calls.map((call) => Boolean(call[1]?.secret))).toEqual([
      false,
      false,
      true,
      true
    ]);
    expect(t.read().environments.prod).toMatchObject({ cloudflare: { token: 'cf-token' } });
  });

  it('does not save an environment that does not work, and says why', async () => {
    worker(['other']);
    const t = setup([], 'good\n');
    const code = await envCommand(
      ['add', 'prod', '--url', 'https://w.example.com', '--role', 'admin', '--secret-stdin'],
      t.deps
    );
    expect(code).toBe(1);
    expect(t.errors()).toContain('Not saved');
    expect(t.errors()).toContain('rejected');
    expect(() => t.read()).toThrow();
  });

  it('refuses a credential whose role is not the chosen one', async () => {
    worker();
    const t = setup([], 'good\n');
    expect(
      await envCommand(
        ['add', 'x', '--url', 'https://w.example.com', '--role', 'analyst', '--secret-stdin'],
        t.deps
      )
    ).toBe(1);
    expect(t.errors()).toContain('administrator secret');
  });

  it('saves without checking on request, and says so', async () => {
    const t = setup([], 'anything\n');
    expect(
      await envCommand(
        [
          'add',
          'x',
          '--url',
          'https://w.example.com',
          '--role',
          'admin',
          '--secret-stdin',
          '--no-verify'
        ],
        t.deps
      )
    ).toBe(0);
    expect(t.text()).toContain('--no-verify');
    expect(t.read().environments.x).toBeDefined();
  });

  it('keeps a secret in OneCLI when asked, needing all three OneCLI options', async () => {
    const t = setup();
    const args = [
      'add',
      'x',
      '--url',
      'https://w.example.com',
      '--role',
      'admin',
      '--secret-onecli',
      '--no-verify'
    ];
    expect(await envCommand(args, t.deps)).toBe(1);
    expect(t.errors()).toContain('--onecli-workspace');
    expect(
      await envCommand(
        [
          ...args,
          '--onecli-workspace',
          'acme',
          '--onecli-agent',
          'vz',
          '--onecli-gateway',
          'localhost:10255'
        ],
        t.deps
      )
    ).toBe(0);
    expect(t.read().environments.x!.secret).toEqual({
      onecli: { workspace: 'acme', agent: 'vz', gateway: 'localhost:10255' }
    });
  });

  it('refuses a duplicate name, an invalid name, and anything missing without a terminal', async () => {
    const t = setup();
    t.seed({ dev: admin });
    expect(await envCommand(['add', 'dev', '--url', 'https://w.example.com'], t.deps)).toBe(1);
    expect(t.errors()).toContain('already exists');
    t.err.length = 0;
    expect(
      await envCommand(
        [
          'add',
          'Bad Name',
          '--url',
          'https://w.example.com',
          '--role',
          'admin',
          '--secret-stdin',
          '--no-verify'
        ],
        t.deps
      )
    ).toBe(1);
    expect(t.errors()).toContain('lowercase');
    t.err.length = 0;
    expect(await envCommand(['add', 'new'], t.deps)).toBe(1);
    expect(t.errors()).toContain('Missing');
  });

  it('does not read two values from stdin', async () => {
    const t = setup();
    expect(
      await envCommand(['add', 'x', '--secret-stdin', '--cloudflare-token-stdin'], t.deps)
    ).toBe(1);
    expect(t.errors()).toContain('Only one value');
  });

  it('will not rewrite a file that has an entry it would drop', async () => {
    worker();
    const t = setup([], 'good\n');
    t.seed({ broken: { url: 'nope' } });
    expect(
      await envCommand(
        ['add', 'x', '--url', 'https://w.example.com', '--role', 'admin', '--secret-stdin'],
        t.deps
      )
    ).toBe(1);
    expect(t.errors()).toContain('"broken"');
    expect(Object.keys(t.read().environments)).toEqual(['broken']);
  });
});

describe('vizoalica env update', () => {
  it('changes just what was given and keeps the rest, including the stored secret', async () => {
    worker();
    const t = setup();
    t.seed({ prod: admin });
    expect(
      await envCommand(['update', 'prod', '--url', 'https://analytics.example.org'], t.deps)
    ).toBe(0);
    expect(t.read().environments.prod).toEqual({ ...admin, url: 'https://analytics.example.org' });
  });

  it('replaces the secret from stdin and can drop the Cloudflare token', async () => {
    worker(['new']);
    const t = setup([], 'new\n');
    t.seed({ prod: { ...admin, cloudflare: { token: 'cf' } } });
    expect(await envCommand(['update', 'prod', '--secret-stdin', '--no-cloudflare'], t.deps)).toBe(
      0
    );
    expect(t.read().environments.prod).toEqual({ ...admin, secret: 'new' });
  });

  it('refuses an unknown environment, and a change that would leave it unusable', async () => {
    worker();
    const t = setup();
    t.seed({ prod: admin });
    expect(await envCommand(['update', 'nope'], t.deps)).toBe(1);
    expect(t.errors()).toContain('vizoalica env add nope');
    t.err.length = 0;
    expect(await envCommand(['update', 'prod', '--role', 'owner'], t.deps)).toBe(1);
    expect(t.errors()).toContain('Not saved');
    expect(t.read().environments.prod).toEqual(admin);
  });
});

describe('vizoalica env remove', () => {
  it('needs --yes without a terminal, and removes only the named one', async () => {
    const t = setup();
    t.seed({ dev: admin, prod: admin });
    expect(await envCommand(['remove', 'dev'], t.deps)).toBe(1);
    expect(t.errors()).toContain('--yes');
    expect(await envCommand(['remove', 'dev', '--yes'], t.deps)).toBe(0);
    expect(Object.keys(t.read().environments)).toEqual(['prod']);
    expect(t.text()).toContain('Nothing in Cloudflare was deleted');
    expect(await envCommand(['remove', 'dev', '--yes'], t.deps)).toBe(1);
  });

  it('asks the person to type the name in a terminal', async () => {
    const t = setup(['wrong']);
    t.seed({ dev: admin });
    expect(await envCommand(['remove', 'dev'], t.deps)).toBe(1);
    expect(Object.keys(t.read().environments)).toEqual(['dev']);
    const again = setup(['dev']);
    again.seed({ dev: admin });
    expect(await envCommand(['remove', 'dev'], again.deps)).toBe(0);
    expect(again.read().environments).toEqual({});
  });
});

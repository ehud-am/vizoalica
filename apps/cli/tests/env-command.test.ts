import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Vault } from '../../local-ops-api/src/environments/vault.js';
import { envCommand, type EnvDeps } from '../src/env-command.js';
import { Cancelled } from '../src/prompt.js';
import { stubWorker } from '../../local-ops-api/tests/worker-stub.js';
import { makeTrace } from '../../local-ops-api/src/trace.js';
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
      asked.push(question.split('\n').pop()!);
      const answer = answers.shift();
      if (answer === undefined) throw new Error(`No answer left for: ${question}`);
      return answer;
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
  const full: string[] = [];
  const ask = deps.ask;
  deps.ask = (question, options) => {
    full.push(question);
    return ask(question, options);
  };
  return {
    deps,
    full,
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

const onecli = { workspace: 'acme', agent: 'vz', gateway: 'localhost:10255' };
const onecliArgs = [
  '--onecli-workspace',
  'acme',
  '--onecli-agent',
  'vz',
  '--onecli-gateway',
  'localhost:10255'
];

describe('vizoalica env add offers to deploy', () => {
  it('deploys the backend when asked, passing OneCLI along', async () => {
    const t = setup(['y', 'y', 'acme', 'vz', '']);
    const deploy = vi.fn(async () => 0);
    expect(await envCommand(['add', 'prod'], { ...t.deps, deploy })).toBe(0);
    expect(t.asked).toEqual([
      'Deploy a new backend for "prod" now? (Y/n): ',
      'Is your Cloudflare API token stored in OneCLI? (Y/n): ',
      'OneCLI workspace: ',
      'OneCLI agent: ',
      'OneCLI gateway (host:port) [localhost:10255]: '
    ]);
    expect(deploy).toHaveBeenCalledWith(['prod', '--apply', '--cloudflare-onecli', ...onecliArgs]);
    expect(() => t.read()).toThrow();
  });

  it('connects to an existing backend, with the secret held by OneCLI, when deploy is declined', async () => {
    const t = setup([
      'n',
      'https://w.example.com',
      'admin',
      'y',
      'acme',
      'vz',
      'localhost:10255',
      'n'
    ]);
    const deploy = vi.fn(async () => 0);
    const code = await envCommand(['add', 'prod', '--no-verify'], { ...t.deps, deploy });
    expect(code).toBe(0);
    expect(deploy).not.toHaveBeenCalled();
    expect(t.read().environments.prod).toEqual({
      url: 'https://w.example.com',
      role: 'admin',
      secret: { onecli }
    });
  });

  it('does not ask about deploying when the address is given', async () => {
    const t = setup(['n']);
    const deploy = vi.fn(async () => 0);
    await envCommand(
      ['add', 'prod', '--url', 'https://w.example.com', '--role', 'analyst', '--no-verify'],
      { ...t.deps, deploy }
    );
    expect(t.asked.join('')).not.toContain('Deploy a new backend');
  });
});

describe('vizoalica env add: every question, or only options', () => {
  it('with no options asks each question in turn, starting with the name', async () => {
    const t = setup(['prod', 'y', 'n']);
    const deploy = vi.fn(async () => 0);
    expect(await envCommand(['add'], { ...t.deps, deploy })).toBe(0);
    expect(t.asked).toEqual([
      'Environment name: ',
      'Deploy a new backend for "prod" now? (Y/n): ',
      'Is your Cloudflare API token stored in OneCLI? (Y/n): '
    ]);
    expect(deploy).toHaveBeenCalledWith(['prod', '--apply']);
  });

  it('explains every question on the lines above its prompt', async () => {
    worker(['good']);
    const t = setup(['prod', 'n', 'https://w.example.com', 'admin', 'n', 'good', '']);
    expect(await envCommand(['add'], { ...t.deps, deploy: async () => 0 })).toBe(0);
    expect(t.full).toHaveLength(7);
    for (const question of t.full) {
      const lines = question.split('\n');
      expect(lines.length).toBeGreaterThan(2);
      expect(lines[1]!.length).toBeGreaterThan(20);
    }
  });

  it('asks the connect questions, name first, when the backend already exists', async () => {
    worker(['good']);
    const t = setup(['prod', 'n', 'https://w.example.com', 'admin', 'n', 'good', '']);
    const deploy = vi.fn(async () => 0);
    expect(await envCommand(['add'], { ...t.deps, deploy })).toBe(0);
    expect(deploy).not.toHaveBeenCalled();
    expect(t.asked).toEqual([
      'Environment name: ',
      'Deploy a new backend for "prod" now? (Y/n): ',
      'Worker address (https://…): ',
      'Role (1-3, or admin, owner, analyst): ',
      'Is the administrator secret stored in OneCLI? (y/N): ',
      'Administrator secret (hidden): ',
      'Cloudflare API token (hidden, Enter to skip): '
    ]);
    expect(t.read().environments.prod).toEqual({
      url: 'https://w.example.com',
      role: 'admin',
      secret: 'good'
    });
  });

  it('asks again after an answer that cannot be used, saying why', async () => {
    worker(['key']);
    const t = setup([
      'Bad Name',
      'prod',
      'maybe',
      'n',
      'http://w.example.com',
      'https://w.example.com/path',
      'https://w.example.com',
      'boss',
      '3',
      'n',
      '',
      'key'
    ]);
    const code = await envCommand(['add', '--no-verify'], { ...t.deps, deploy: async () => 0 });
    expect(code).toBe(0);
    const errors = t.errors();
    expect(errors).toContain('must start with a lowercase letter');
    expect(errors).toContain('Answer y or n.');
    expect(errors).toContain('The address must start with https://');
    expect(errors).toContain('no path');
    expect(errors).toContain('Type 1, 2, or 3');
    expect(errors).toContain('An answer is needed.');
    expect(t.read().environments.prod).toEqual({
      url: 'https://w.example.com',
      role: 'analyst',
      secret: 'key'
    });
  });

  it('asks for another name when the one typed already exists', async () => {
    const t = setup(['dev', 'prod', '--nothing--']);
    t.seed({ dev: admin });
    await envCommand(['add'], { ...t.deps, deploy: async () => 0 }).catch(() => undefined);
    expect(t.errors()).toContain('"dev" already exists');
    expect(t.asked.slice(0, 3)).toEqual([
      'Environment name: ',
      'Environment name: ',
      'Deploy a new backend for "prod" now? (Y/n): '
    ]);
  });

  it('gives up after five unusable answers', async () => {
    const t = setup(['x y', 'x y', 'x y', 'x y', 'x y']);
    expect(await envCommand(['add'], t.deps)).toBe(1);
    expect(t.errors()).toContain('No usable answer for the environment name');
  });

  it('offers to save an environment that does not verify, and saves nothing on no', async () => {
    worker(['other']);
    const no = setup(['', 'n'], 'good\n');
    const args = [
      'add',
      'prod',
      '--url',
      'https://w.example.com',
      '--role',
      'admin',
      '--secret-stdin'
    ];
    no.deps.interactive = true;
    expect(await envCommand(args, no.deps)).toBe(1);
    expect(no.errors()).toContain('rejected');
    expect(no.asked).toEqual([
      'Cloudflare API token (hidden, Enter to skip): ',
      'Save "prod" anyway? (y/N): '
    ]);
    expect(() => no.read()).toThrow();
    const yes = setup(['', 'y'], 'good\n');
    expect(await envCommand(args, yes.deps)).toBe(0);
    expect(yes.read().environments.prod).toMatchObject({ secret: 'good' });
  });

  it('stops with 130 and saves nothing when a question is cancelled', async () => {
    const t = setup(['prod']);
    t.deps.ask = async () => {
      throw new Cancelled();
    };
    expect(await envCommand(['add'], t.deps)).toBe(130);
    expect(t.errors()).toContain('Cancelled');
  });

  it('deploys from options alone, passing the deploy options and OneCLI along', async () => {
    const t = setup();
    const deploy = vi.fn(async () => 0);
    const code = await envCommand(
      [
        'add',
        'prod',
        '--deploy',
        '--yes',
        '--account',
        'acc',
        '--secrets-file',
        '/tmp/s',
        '--onecli',
        ...onecliArgs
      ],
      { ...t.deps, deploy }
    );
    expect(code).toBe(0);
    expect(t.asked).toEqual([]);
    expect(deploy).toHaveBeenCalledWith([
      'prod',
      '--apply',
      '--yes',
      '--account',
      'acc',
      '--secrets-file',
      '/tmp/s',
      '--cloudflare-onecli',
      ...onecliArgs
    ]);
  });

  it('connects from options alone, and rejects contradictory options before asking anything', async () => {
    worker(['good']);
    const t = setup([], 'good\n');
    expect(
      await envCommand(
        [
          'add',
          'prod',
          '--connect',
          '--url',
          'https://w.example.com',
          '--role',
          'admin',
          '--secret-stdin',
          '--no-onecli'
        ],
        t.deps
      )
    ).toBe(0);
    expect(t.read().environments.prod).toMatchObject({ secret: 'good' });
    for (const args of [
      ['--deploy', '--connect'],
      ['--deploy', '--url', 'https://w.example.com'],
      ['--onecli', '--no-onecli'],
      ['--no-onecli', '--secret-onecli'],
      ['--secret-stdin', '--secret-onecli'],
      ['--deploy', '--role', 'analyst'],
      ['--deploy', '--secret-stdin'],
      ['--connect', '--account', 'acc']
    ]) {
      t.err.length = 0;
      expect(await envCommand(['add', 'other', ...args], t.deps)).toBe(1);
      expect(t.errors()).toMatch(
        /Choose one|no --url|role is admin|takes no|only used with --deploy/
      );
    }
  });

  it('checks an address or role given as an option before asking anything else', async () => {
    const t = setup(['unused']);
    expect(await envCommand(['add', 'prod', '--url', 'w.example.com'], t.deps)).toBe(1);
    expect(t.errors()).toContain('--url: The address is not a web address');
    expect(
      await envCommand(['add', 'prod', '--url', 'https://w.example.com', '--role', 'boss'], t.deps)
    ).toBe(1);
    expect(t.errors()).toContain('--role must be');
    expect(t.asked).toEqual([]);
  });

  it('keeps only the Cloudflare token in OneCLI with --cloudflare-onecli', async () => {
    const t = setup([], 'good\n');
    const args = ['--cloudflare-onecli', ...onecliArgs, '--no-verify'];
    expect(
      await envCommand(
        [
          'add',
          'prod',
          '--url',
          'https://w.example.com',
          '--role',
          'admin',
          '--secret-stdin',
          ...args
        ],
        t.deps
      )
    ).toBe(0);
    expect(t.read().environments.prod).toEqual({ ...admin, cloudflare: { token: { onecli } } });
    t.seed({ dev: admin });
    expect(await envCommand(['update', 'dev', ...args], t.deps)).toBe(0);
    expect(t.read().environments.dev).toEqual({ ...admin, cloudflare: { token: { onecli } } });
    expect(await envCommand(['update', 'dev', ...onecliArgs], t.deps)).toBe(1);
    expect(t.errors()).toContain('Say what OneCLI holds');
  });
});

describe('vizoalica env --verbose', () => {
  it('traces each step and request, and never a secret or an answer', async () => {
    const stubbed = worker(['very-secret']);
    const t = setup([], 'very-secret\n');
    const code = await envCommand(
      [
        'add',
        'prod',
        '--connect',
        '--url',
        'https://w.example.com',
        '--role',
        'admin',
        '--secret-stdin',
        '--no-onecli'
      ],
      { ...t.deps, trace: makeTrace(t.deps.out) }
    );
    expect(code).toBe(0);
    const text = t.text();
    expect(text).toContain('Connecting "prod" to an existing backend');
    expect(text).toContain('The secret is kept in the private file');
    expect(text).toMatch(/GET https:\/\/w\.example\.com\/\S+ -> 200 \(\d+ms\)/);
    expect(text).toContain('"prod" is usable');
    expect(text).toContain('Wrote ');
    expect(text).not.toContain('very-secret');
    expect(stubbed.requests.length).toBeGreaterThan(0);
  });

  it('shows the question being asked but not the answer', async () => {
    const t = setup([
      'prod',
      'n',
      'https://w.example.com',
      'admin',
      'n',
      'answer-that-is-secret',
      ''
    ]);
    worker(['answer-that-is-secret']);
    await envCommand(['add'], { ...t.deps, deploy: async () => 0, trace: makeTrace(t.deps.out) });
    const text = t.text();
    expect(text).toContain('Asking: Environment name:');
    expect(text).toContain('Asking: Administrator secret (hidden): (answer hidden)');
    expect(text).not.toContain('answer-that-is-secret');
  });
});

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
    const t = setup(['https://w.example.com', 'admin', 'n', 'good', 'cf-token']);
    const ask = vi.spyOn(t.deps, 'ask');
    expect(await envCommand(['add', 'prod', '--connect'], t.deps)).toBe(0);
    expect(ask.mock.calls.map((call) => Boolean(call[1]?.secret))).toEqual([
      false,
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
    expect(t.errors()).toContain('Say where the backend is');
    t.err.length = 0;
    expect(await envCommand(['add', 'new', '--connect'], t.deps)).toBe(1);
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

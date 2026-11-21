import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Vault } from '../../local-ops-api/src/environments/vault.js';
import { main } from '../src/main.js';
import { mappingCommand, type MappingDeps } from '../src/mapping-command.js';
import {
  describePlan,
  isEmptyPlan,
  parseMapping,
  planMapping
} from '../src/mapping/mapping-file.js';
import { defaultBackends, fakeWorkers, SECRETS, type FakeBackend } from './mcp-support.js';
import { tempHome, writePrivate } from './support.js';

const GOOD = {
  version: 1,
  environment: 'prod',
  project: 'Acme',
  website: 'Shop',
  pages: [
    { key: '/pricing', name: 'Pricing', group: 'Marketing', confidence: 'high', reason: 'plans' },
    { key: '/blog/*', name: 'Blog post' }
  ],
  groupingRules: [{ pattern: '/blog/*', key: '/blog/:post' }],
  goals: [{ kind: 'event', name: 'Signed up', target: 'signup' }]
};

describe('parseMapping', () => {
  it('accepts a mapping and keeps the reviewer notes out of what is stored', () => {
    const parsed = parseMapping(JSON.stringify({ ...GOOD, pages: [GOOD.pages[0]] }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.mapping.pages[0]).toMatchObject({
        key: '/pricing',
        name: 'Pricing',
        group: 'Marketing',
        confidence: 'high'
      });
      expect(parsed.mapping.goals).toEqual(GOOD.goals);
    }
  });

  it('lists every problem with its position', () => {
    expect(parseMapping('nope')).toEqual({ ok: false, errors: ['The file is not valid JSON.'] });
    expect(parseMapping('[]')).toMatchObject({ ok: false });
    const bad = parseMapping(
      JSON.stringify({
        version: 2,
        environment: 3,
        pages: [
          { key: '/a', name: 'A' },
          { key: 'b', name: 'B' }
        ],
        groupingRules: [{ pattern: '/x/(.*)', key: '/x' }],
        goals: [{ kind: 'page', name: 'G', target: 'no-slash' }, { kind: 'bad' }]
      })
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.join('\n')).toMatch(/"version" must be 1/);
      expect(bad.errors.join('\n')).toMatch(/"environment" must be a text/);
      expect(bad.errors.join('\n')).toMatch(/pages #2: invalid key/);
      expect(bad.errors.join('\n')).toMatch(/groupingRules #1: invalid rule/);
      expect(bad.errors.join('\n')).toMatch(/goals #1/);
      expect(bad.errors.join('\n')).toMatch(/goals #2/);
    }
    const notes = parseMapping(
      JSON.stringify({ version: 1, pages: [{ key: '/a', name: 'A', reason: 5 }] })
    );
    expect(notes.ok).toBe(false);
    expect(parseMapping(JSON.stringify({ version: 1, goals: 'x' })).ok).toBe(false);
    expect(
      parseMapping(
        JSON.stringify({
          version: 1,
          goals: Array.from({ length: 21 }, (_, i) => ({
            kind: 'event',
            name: `g${i}`,
            target: 't'
          }))
        })
      ).ok
    ).toBe(false);
  });

  it('accepts an empty mapping', () => {
    const parsed = parseMapping('{"version":1}');
    expect(parsed).toMatchObject({
      ok: true,
      mapping: { pages: [], groupingRules: [], goals: [] }
    });
  });
});

describe('planMapping', () => {
  const inventory = {
    pages: [
      { key: '/pricing', views: 10 },
      { key: '/blog/a', views: 5 },
      { key: '/blog/b', views: 4 },
      { key: '/about', views: 1 }
    ],
    groupingRules: [],
    goals: [],
    labels: [{ key: '/about', name: 'About us', group: '' }]
  };
  const mapping = (extra: object = {}) => {
    const parsed = parseMapping(JSON.stringify({ ...GOOD, ...extra }));
    if (!parsed.ok) throw new Error(parsed.errors.join());
    return parsed.mapping;
  };

  it('adds names, rules with what they collapse, and goals, and removes nothing', () => {
    const plan = planMapping(inventory, mapping());
    expect(plan.labels.add.map((label) => label.key)).toEqual(['/pricing', '/blog/*']);
    expect(plan.labels.keep).toBe(1);
    expect(plan.rules.add[0]!.collapses).toEqual(['/blog/a', '/blog/b']);
    expect(plan.goals.add).toHaveLength(1);
    expect(plan.result.labels.map((label) => label.key)).toEqual(['/about', '/blog/*', '/pricing']);
    expect(isEmptyPlan(plan)).toBe(false);
    const text = describePlan(plan);
    expect(text).toContain('2 page keys seen now would count as one');
    expect(text).toContain('They count only new events');
    expect(text).toContain('+ event "Signed up" -> signup');
  });

  it('skips what is already there and reports changes', () => {
    const plan = planMapping(
      {
        ...inventory,
        groupingRules: [{ pattern: '/blog/*', key: '/blog/:post' }],
        goals: [
          {
            id: 'g',
            projectId: 'p',
            sourceId: 's',
            name: 'signed UP',
            kind: 'event',
            target: 'x',
            createdAt: 't'
          }
        ],
        labels: [{ key: '/pricing', name: 'Plans', group: '' }]
      },
      mapping()
    );
    expect(plan.rules.skipped).toHaveLength(1);
    expect(plan.goals.existing).toHaveLength(1);
    expect(plan.labels.change).toHaveLength(1);
    expect(describePlan(plan)).toContain('~ /pricing: "Plans" -> "Pricing" [Marketing]');
    const same = planMapping(
      {
        ...inventory,
        groupingRules: GOOD.groupingRules,
        goals: [
          {
            id: 'g',
            projectId: 'p',
            sourceId: 's',
            name: 'Signed up',
            kind: 'event',
            target: 'signup',
            createdAt: 't'
          }
        ],
        labels: [
          { key: '/pricing', name: 'Pricing', group: 'Marketing' },
          { key: '/blog/*', name: 'Blog post', group: '' }
        ]
      },
      mapping()
    );
    expect(isEmptyPlan(same)).toBe(true);
  });

  it('reports limits as problems', () => {
    const many = {
      ...inventory,
      groupingRules: Array.from({ length: 25 }, (_, i) => ({ pattern: `/r${i}`, key: `/k${i}` })),
      goals: Array.from({ length: 20 }, (_, i) => ({
        id: `g${i}`,
        projectId: 'p',
        sourceId: 's',
        name: `n${i}`,
        kind: 'event' as const,
        target: `t${i}`,
        createdAt: 't'
      }))
    };
    const plan = planMapping(many, mapping());
    expect(plan.problems.join(' ')).toMatch(/26 rules.*25/);
    expect(plan.problems.join(' ')).toMatch(/goals/);
    const labels = planMapping(
      {
        ...inventory,
        labels: Array.from({ length: 500 }, (_, i) => ({ key: `/p${i}`, name: 'n', group: '' }))
      },
      mapping()
    );
    expect(labels.problems.join(' ')).toMatch(/labels/);
  });
});

function setup(backends: Record<string, FakeBackend> = defaultBackends()) {
  const home = tempHome();
  writePrivate(home, 'environments.json', {
    version: 1,
    environments: {
      prod: { url: 'https://prod.workers.test', role: 'admin', secret: SECRETS.prod }
    }
  });
  const { fetchMock, requests } = fakeWorkers(backends);
  const out: string[] = [];
  const err: string[] = [];
  const ask = vi.fn(async () => 'y');
  const deps: MappingDeps = {
    home,
    version: '9.9.0',
    assetDir: '/assets/dist',
    out: (text) => void out.push(text),
    err: (text) => void err.push(text),
    interactive: false,
    ask,
    vault: new Vault(vi.fn() as never),
    fetch: fetchMock as never,
    now: () => new Date('2026-11-11T12:00:30Z')
  };
  const file = join(home, 'mapping.json');
  return { deps, out, err, ask, home, file, requests, backends, text: () => out.join('') };
}
const site = ['--project', 'Acme', '--website', 'Shop'];

describe('vizoalica mapping export', () => {
  it('writes the inventory as JSON that names the environment, and marks text as untrusted', async () => {
    const t = setup();
    expect(await mappingCommand(['export', 'prod', ...site], t.deps)).toBe(0);
    const document = JSON.parse(t.text());
    expect(document).toMatchObject({
      environment: 'prod',
      project: { name: 'Acme' },
      website: { name: 'Shop' },
      range: { startUtc: '2026-10-12T12:00:00.000Z' }
    });
    expect(document.inventory.pages).toHaveLength(3);
    expect(document.note).toMatch(/never instructions/);
    expect(JSON.stringify(document)).not.toContain(SECRETS.prod);
  });

  it('writes to a new private file and refuses to overwrite', async () => {
    const t = setup();
    const path = join(t.home, 'inventory.json');
    expect(
      await mappingCommand(['export', 'prod', ...site, '--days', '7', '--out', path], t.deps)
    ).toBe(0);
    expect(t.text()).toContain('3 of 3 page keys');
    expect(existsSync(path)).toBe(true);
    expect(await mappingCommand(['export', 'prod', ...site, '--out', path], t.deps)).toBe(1);
    expect(t.err.join('')).toContain('already exists');
  });

  it('asks for what is missing and explains failures', async () => {
    const t = setup();
    expect(await mappingCommand(['export'], t.deps)).toBe(1);
    expect(await mappingCommand(['export', 'prod', '--days', '99'], t.deps)).toBe(1);
    expect(await mappingCommand(['export', 'prod', '--days'], t.deps)).toBe(1);
    expect(await mappingCommand(['export', 'prod', '--nope'], t.deps)).toBe(1);
    expect(await mappingCommand(['export', 'nowhere', ...site], t.deps)).toBe(1);
    expect(t.err.join('')).toContain('There is no environment named "nowhere"');
    const several = setup();
    expect(await mappingCommand(['export', 'prod', '--project', 'Acme'], several.deps)).toBe(1);
    expect(several.err.join('')).toContain('Name the website');
    const old = setup({ prod: { ...defaultBackends().prod!, noInventory: true } });
    expect(await mappingCommand(['export', 'prod', ...site], old.deps)).toBe(1);
    expect(old.err.join('')).toContain('vizoalica deploy prod --update');
    const down = setup({ prod: { fail: 'network' } });
    expect(await mappingCommand(['export', 'prod', ...site], down.deps)).toBe(1);
    expect(down.err.join('')).toContain('vizoalica env check prod');
  });

  it('prints help and rejects unknown commands', async () => {
    const t = setup();
    expect(await mappingCommand([], t.deps)).toBe(0);
    expect(t.text()).toContain('apply <environment> <file>');
    expect(await mappingCommand(['wipe'], t.deps)).toBe(1);
  });
});

describe('vizoalica mapping apply', () => {
  const write = (t: ReturnType<typeof setup>, value: unknown = GOOD) =>
    writeFileSync(t.file, typeof value === 'string' ? value : JSON.stringify(value));

  it('shows the changes and writes nothing without a yes', async () => {
    const t = setup();
    write(t);
    expect(await mappingCommand(['apply', 'prod', t.file], t.deps)).toBe(0);
    expect(t.text()).toContain('Environment: prod');
    expect(t.text()).toContain('+ /blog/* -> /blog/:post: 2 page keys');
    expect(t.text()).toContain('Run again with --yes to apply');
    expect(t.backends.prod!.writes ?? []).toEqual([]);
  });

  it('applies goals, rules and names after --yes, merged with what exists', async () => {
    const t = setup();
    t.backends.prod!.labels = [{ key: '/about', name: 'About us', group: '' }];
    write(t);
    expect(await mappingCommand(['apply', 'prod', t.file, '--yes'], t.deps)).toBe(0);
    const writes = t.backends.prod!.writes!;
    expect(writes.map((item) => `${item.method} ${item.path.split('/').slice(-1)[0]}`)).toEqual([
      'POST goals',
      'PATCH s1',
      'PUT labels'
    ]);
    expect(writes[1]!.body).toEqual({ groupingRules: GOOD.groupingRules });
    expect(
      (writes[2]!.body as { labels: Array<{ key: string }> }).labels.map((l) => l.key)
    ).toEqual(['/about', '/blog/*', '/pricing']);
    expect(t.text()).toContain('Applied to prod / Shop: 2 names, 1 rules, 1 goals.');
    // Running it again changes nothing.
    t.out.length = 0;
    t.backends.prod!.existing = {
      goals: GOOD.goals.map((g) => ({ ...g, id: 'g' })),
      groupingRules: GOOD.groupingRules
    };
    expect(await mappingCommand(['apply', 'prod', t.file, '--yes'], t.deps)).toBe(0);
    expect(t.text()).toContain('Nothing to change.');
  });

  it('asks in a terminal, and stops on anything but yes', async () => {
    const t = setup();
    write(t);
    t.deps.interactive = true;
    t.ask.mockResolvedValueOnce('n');
    expect(await mappingCommand(['apply', 'prod', t.file], t.deps)).toBe(0);
    expect(t.text()).toContain('Nothing changed.');
    expect(t.backends.prod!.writes ?? []).toEqual([]);
    t.ask.mockResolvedValueOnce('yes');
    expect(await mappingCommand(['apply', 'prod', t.file], t.deps)).toBe(0);
    expect(t.backends.prod!.writes).toHaveLength(3);
  });

  it('refuses an invalid file, the wrong environment, a missing file, and over-limit results', async () => {
    const t = setup();
    write(t, '{"version":1,"pages":[{"key":"x","name":"X"}]}');
    expect(await mappingCommand(['apply', 'prod', t.file, '--yes', ...site], t.deps)).toBe(1);
    expect(t.err.join('')).toContain('is not a valid mapping');
    write(t, { ...GOOD, environment: 'stage' });
    expect(await mappingCommand(['apply', 'prod', t.file, '--yes'], t.deps)).toBe(1);
    expect(t.err.join('')).toContain('written for environment "stage"');
    expect(await mappingCommand(['apply', 'prod', join(t.home, 'missing.json')], t.deps)).toBe(1);
    expect(await mappingCommand(['apply', 'prod'], t.deps)).toBe(1);
    const full = setup();
    full.backends.prod!.existing = {
      groupingRules: Array.from({ length: 25 }, (_, i) => ({ pattern: `/r${i}`, key: `/k${i}` }))
    };
    write(full);
    expect(await mappingCommand(['apply', 'prod', full.file, '--yes'], full.deps)).toBe(1);
    expect(full.text()).toContain('Problem: The website would have 26 rules');
    expect(full.backends.prod!.writes ?? []).toEqual([]);
  });

  it('needs the website when the project has several and the file does not name one', async () => {
    const t = setup();
    write(t, { version: 1, project: 'Acme' });
    expect(await mappingCommand(['apply', 'prod', t.file], t.deps)).toBe(1);
    expect(t.err.join('')).toContain('Name the website');
  });

  it('explains a refused credential', async () => {
    const t = setup();
    write(t);
    t.backends.prod!.fail = 403;
    expect(await mappingCommand(['apply', 'prod', t.file, '--yes'], t.deps)).toBe(1);
    expect(t.err.join('')).toContain('vizoalica env check prod');
  });
});

describe('vizoalica mapping through the main command', () => {
  it('is listed in the help and routed', async () => {
    const out: string[] = [];
    const home = tempHome();
    const code = await main(['mapping'], {
      env: {},
      home,
      version: '9.9.0',
      assetDir: '/assets/dist',
      out: (text: string) => void out.push(text),
      err: () => undefined,
      interactive: false,
      ask: vi.fn(),
      vault: new Vault(vi.fn() as never),
      nodeVersion: '22.0.0',
      platform: 'linux'
    } as never);
    expect(code).toBe(0);
    expect(out.join('')).toContain('apply <environment> <file>');
    expect(readFileSync(join(__dirname, '../src/main.ts'), 'utf8')).toContain(
      'mapping export|apply'
    );
  });
});

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Vault } from '../../local-ops-api/src/environments/vault.js';
import { specCommand, type SpecDeps } from '../src/spec-command.js';
import { parseSiteSpec } from '../../ingest-api/src/spec/site-spec.js';
import { renderOntology, specToFiles } from '../../ingest-api/src/spec/spec-files.js';
import { defaultBackends, fakeWorkers, SECRETS, type FakeBackend } from './mcp-support.js';
import { tempHome, writePrivate } from './support.js';

const SPEC = {
  meta: { version: 1, environment: 'prod', project: 'Acme', website: 'Shop' },
  pages: [{ id: 'pricing', match: ['/pricing'], name: 'Pricing' }]
};

function setup(
  answer = 'y',
  interactive = true,
  backends: Record<string, FakeBackend> = defaultBackends()
) {
  const home = tempHome();
  writePrivate(home, 'environments.json', {
    version: 1,
    environments: {
      prod: { url: 'https://prod.workers.test', role: 'admin', secret: SECRETS.prod }
    }
  });
  const { fetchMock } = fakeWorkers(backends);
  const out: string[] = [];
  const err: string[] = [];
  const cwd = join(home, 'work');
  mkdirSync(cwd);
  const deps: SpecDeps = {
    home,
    version: '9.9.0',
    assetDir: '/assets/dist',
    out: (text) => void out.push(text),
    err: (text) => void err.push(text),
    interactive,
    ask: vi.fn(async () => answer),
    vault: new Vault(vi.fn() as never),
    fetch: fetchMock as never,
    cwd,
    now: () => new Date('2026-11-11T12:00:30Z')
  };
  return { deps, out, err, cwd, backends, text: () => out.join(''), errs: () => err.join('') };
}
const site = ['--project', 'Acme', '--website', 'Shop'];

function writeFolder(folder: string, spec: unknown = SPEC): void {
  const parsed = parseSiteSpec(spec);
  if (!parsed.ok) throw new Error(parsed.errors.join());
  mkdirSync(folder, { recursive: true });
  for (const [name, content] of Object.entries(specToFiles(parsed.spec)))
    writeFileSync(join(folder, name), content);
  writeFileSync(join(folder, 'ONTOLOGY.md'), renderOntology(parsed.spec));
}

describe('vizoalica spec: arguments and folders', () => {
  it('rejects bad options and argument counts', async () => {
    const t = setup();
    expect(await specCommand(['validate', '--bogus'], t.deps)).toBe(1);
    expect(t.errs()).toContain('Unknown option');
    expect(await specCommand(['init', 'prod', '--dir'], t.deps)).toBe(1);
    expect(t.errs()).toContain('needs a value');
    expect(await specCommand(['validate', 'a', 'b'], t.deps)).toBe(1);
    expect(await specCommand(['diff'], t.deps)).toBe(1);
    expect(await specCommand(['diff', 'prod', 'a', 'b'], t.deps)).toBe(1);
    expect(await specCommand(['import', 'prod'], t.deps)).toBe(1);
    expect(await specCommand(['--help'], t.deps)).toBe(0);
  });

  it('finds the only spec folder, refuses several, and says when none exists', async () => {
    const t = setup();
    expect(await specCommand(['validate'], t.deps)).toBe(1);
    expect(t.errs()).toContain('No spec folder found');
    writeFolder(join(t.cwd, 'vizoalica-spec', 'one'));
    expect(await specCommand(['validate'], t.deps)).toBe(0);
    writeFolder(join(t.cwd, 'vizoalica-spec', 'two'));
    t.err.length = 0;
    expect(await specCommand(['validate'], t.deps)).toBe(1);
    expect(t.errs()).toContain('Several spec folders');
    writeFolder(join(t.cwd, 'vizoalica-spec'));
    expect(await specCommand(['validate'], t.deps)).toBe(0);
    mkdirSync(join(t.cwd, 'empty'));
    expect(await specCommand(['validate', 'empty'], t.deps)).toBe(1);
    expect(t.errs()).toContain('has no spec.json');
    writeFileSync(join(t.cwd, 'vizoalica-spec', 'pages.json'), '[{"id":"x"}]');
    t.err.length = 0;
    expect(await specCommand(['validate'], t.deps)).toBe(1);
    expect(t.errs()).toContain('is not valid');
  });
});

describe('vizoalica spec: init, pull, export, import, apply', () => {
  it('init starts from the backend spec and picks git when inside a repository', async () => {
    const t = setup();
    t.backends.prod!.specStore = { version: 2, spec: SPEC };
    mkdirSync(join(t.cwd, '.git'));
    expect(await specCommand(['init', 'prod', ...site, '--dir', 'mine'], t.deps)).toBe(0);
    expect(t.text()).toContain('starts from the spec already on the backend');
    expect(t.text()).toContain('git: commit this folder');
    expect(readFileSync(join(t.cwd, 'mine', '.vizoalica-base.json'), 'utf8')).toContain(
      '"version":2'
    );
  });

  it('pull and export say when there is nothing; export prints to the screen', async () => {
    const t = setup();
    expect(await specCommand(['pull', 'prod', ...site], t.deps)).toBe(1);
    expect(t.errs()).toContain('no spec');
    t.err.length = 0;
    expect(await specCommand(['export', 'prod', ...site], t.deps)).toBe(1);
    expect(t.errs()).toContain('to back up');
    t.backends.prod!.specStore = { version: 1, spec: SPEC };
    expect(await specCommand(['export', 'prod', ...site], t.deps)).toBe(0);
    expect(t.text()).toContain('vizoalica-spec-backup');
  });

  it('import handles unreadable, unchanged and invalid backups, and a declined restore', async () => {
    const t = setup('n');
    expect(await specCommand(['import', 'prod', 'missing.json', ...site], t.deps)).toBe(1);
    expect(t.errs()).toContain('could not be read');
    writeFileSync(
      join(t.cwd, 'bad.json'),
      JSON.stringify({ kind: 'vizoalica-spec-backup', format: 1, spec: { nope: 1 } })
    );
    t.err.length = 0;
    expect(await specCommand(['import', 'prod', 'bad.json', ...site], t.deps)).toBe(1);
    expect(t.errs()).toContain('not a valid spec');
    writeFileSync(
      join(t.cwd, 'ok.json'),
      JSON.stringify({ kind: 'vizoalica-spec-backup', format: 1, spec: SPEC })
    );
    expect(await specCommand(['import', 'prod', 'ok.json', ...site], t.deps)).toBe(0);
    expect(t.text()).toContain('Nothing changed.');
    t.backends.prod!.specStore = { version: 1, spec: { meta: { version: 1 } } };
    t.out.length = 0;
    const yes = setup('yes');
    yes.backends.prod!.specStore = { version: 1, spec: { meta: { version: 1 } } };
    writeFileSync(
      join(yes.cwd, 'ok.json'),
      JSON.stringify({ kind: 'vizoalica-spec-backup', format: 1, spec: SPEC })
    );
    expect(await specCommand(['import', 'prod', 'ok.json', ...site], yes.deps)).toBe(0);
    expect(yes.text()).toContain('Restored as version 2');
    const same = setup('y');
    same.backends.prod!.specStore = { version: 4, spec: SPEC };
    writeFileSync(
      join(same.cwd, 'ok.json'),
      JSON.stringify({ kind: 'vizoalica-spec-backup', format: 1, spec: SPEC })
    );
    expect(await specCommand(['import', 'prod', 'ok.json', ...site], same.deps)).toBe(0);
    expect(same.text()).toContain('Nothing to change.');
  });

  it('apply asks interactively, and stops on a conflict or a problem', async () => {
    const declined = setup('n');
    const folder = join(declined.cwd, 'f');
    writeFolder(folder);
    expect(await specCommand(['apply', 'prod', folder, ...site], declined.deps)).toBe(0);
    expect(declined.text()).toContain('Nothing changed.');
    expect(declined.backends.prod!.writes ?? []).toHaveLength(0);

    const accepted = setup('y');
    const dir = join(accepted.cwd, 'f');
    writeFolder(dir);
    writeFileSync(join(dir, '.vizoalica-base.json'), '{not json');
    expect(await specCommand(['apply', 'prod', dir, ...site], accepted.deps)).toBe(0);
    expect(accepted.text()).toContain('Applied to prod');

    const problem = setup('y');
    const wild = join(problem.cwd, 'w');
    writeFolder(wild, { ...SPEC, pages: [{ id: 'blog', match: ['/blog/*'], name: 'Blog' }] });
    expect(await specCommand(['apply', 'prod', wild, ...site, '--yes'], problem.deps)).toBe(1);
    expect(problem.errs()).toContain('Nothing was changed');

    const conflict = setup('y');
    const cf = join(conflict.cwd, 'c');
    writeFolder(cf);
    conflict.backends.prod!.specStore = { version: 7, spec: { meta: { version: 1 } } };
    writeFileSync(join(cf, '.vizoalica-base.json'), '{"version":3}');
    expect(await specCommand(['apply', 'prod', cf, ...site, '--yes'], conflict.deps)).toBe(1);
    expect(conflict.errs()).toContain('changed since this folder');
  });

  it('rejects an invalid stored spec', async () => {
    const t = setup();
    t.backends.prod!.specStore = { version: 1, spec: { nope: 1 } };
    expect(await specCommand(['pull', 'prod', ...site], t.deps)).toBe(1);
    expect(t.errs()).toContain('not valid for this version');
  });
});

describe('specToMapping', () => {
  it('reports duplicate keys and skips deprecated pages', async () => {
    const { specToMapping } = await import('../src/spec/spec-mapping.js');
    const parsed = parseSiteSpec({
      meta: { version: 1 },
      pages: [
        { id: 'a', match: ['/x'], name: 'A' },
        { id: 'b', match: ['/x'], name: 'B' },
        { id: 'c', match: ['/y'], name: 'C', status: 'deprecated' },
        { id: 'd', match: ['/z/*'], key: '/z/:id', name: 'D' }
      ]
    });
    if (!parsed.ok) throw new Error('invalid');
    const { mapping, problems } = specToMapping(parsed.spec);
    expect(problems.join()).toContain('another page already uses');
    expect(mapping.pages.map((p) => p.key)).toEqual(['/x', '/z/:id']);
  });
});

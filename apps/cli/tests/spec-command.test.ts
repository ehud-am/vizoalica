import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Vault } from '../../local-ops-api/src/environments/vault.js';
import { main } from '../src/main.js';
import { specCommand, type SpecDeps } from '../src/spec-command.js';
import { specToMapping } from '../src/spec/spec-mapping.js';
import { parseSiteSpec } from '../../ingest-api/src/spec/site-spec.js';
import { defaultBackends, fakeWorkers, SECRETS, type FakeBackend } from './mcp-support.js';
import { tempHome, writePrivate } from './support.js';

const SPEC = {
  meta: { version: 1, environment: 'prod', project: 'Acme', website: 'Shop' },
  groups: [{ id: 'marketing', name: 'Marketing' }],
  pages: [
    { id: 'pricing', match: ['/pricing'], name: 'Pricing', group: 'marketing' },
    { id: 'blog-post', match: ['/blog/*'], key: '/blog/:post', name: 'Blog post' }
  ],
  events: [{ id: 'signup', event: 'signup', name: 'Signup' }],
  funnels: [
    {
      id: 'trial',
      name: 'Trial',
      steps: [
        { kind: 'page', ref: 'pricing' },
        { kind: 'event', ref: 'signup' }
      ],
      within: 'session'
    }
  ],
  goals: [{ name: 'Signed up', kind: 'event', target: 'signup' }]
};

function setup(backends: Record<string, FakeBackend> = defaultBackends(), interactive = false) {
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
  const ask = vi.fn(async () => 'y');
  const cwd = join(home, 'work');
  mkdirSync(cwd);
  const deps: SpecDeps = {
    home,
    version: '9.9.0',
    assetDir: '/assets/dist',
    out: (text) => void out.push(text),
    err: (text) => void err.push(text),
    interactive,
    ask,
    vault: new Vault(vi.fn() as never),
    fetch: fetchMock as never,
    cwd,
    now: () => new Date('2026-11-11T12:00:30Z')
  };
  return { deps, out, err, ask, home, cwd, backends, text: () => out.join('') };
}
const site = ['--project', 'Acme', '--website', 'Shop'];

/** init, then replace the empty spec with SPEC and render. */
async function folderWithSpec(t: ReturnType<typeof setup>) {
  expect(await specCommand(['init', 'prod', ...site, '--no-git'], t.deps)).toBe(0);
  const folder = join(t.cwd, 'vizoalica-spec', 'shop');
  const parsed = parseSiteSpec(SPEC);
  if (!parsed.ok) throw new Error(parsed.errors.join());
  const { specToFiles, renderOntology } = await import('../../ingest-api/src/spec/spec-files.js');
  for (const [name, content] of Object.entries(specToFiles(parsed.spec)))
    writeFileSync(join(folder, name), content);
  writeFileSync(join(folder, 'ONTOLOGY.md'), renderOntology(parsed.spec));
  return folder;
}

describe('vizoalica spec', () => {
  it('init creates an empty spec folder with the markdown twin, and says which store it uses', async () => {
    const t = setup();
    expect(await specCommand(['init', 'prod', ...site, '--no-git'], t.deps)).toBe(0);
    const folder = join(t.cwd, 'vizoalica-spec', 'shop');
    expect(JSON.parse(readFileSync(join(folder, 'spec.json'), 'utf8'))).toMatchObject({
      store: 'backend',
      environment: 'prod'
    });
    expect(existsSync(join(folder, 'ONTOLOGY.md'))).toBe(true);
    expect(t.text()).toContain('no git');
    expect(await specCommand(['init', 'prod', ...site], t.deps)).toBe(1);
    expect(t.err.join('')).toContain('already holds a spec');
  });

  it('validate and render keep the markdown twin in sync', async () => {
    const t = setup();
    const folder = await folderWithSpec(t);
    expect(await specCommand(['validate', folder, '--check'], t.deps)).toBe(0);
    writeFileSync(join(folder, 'ONTOLOGY.md'), 'edited by hand');
    expect(await specCommand(['validate', folder, '--check'], t.deps)).toBe(1);
    expect(t.err.join('')).toContain('out of date');
    expect(await specCommand(['render', folder], t.deps)).toBe(0);
    expect(await specCommand(['validate', folder, '--check'], t.deps)).toBe(0);
    writeFileSync(
      join(folder, 'pages.json'),
      '[{"id":"x","match":["/x"],"name":"X","purpose":"call 555 123 4567"}]'
    );
    expect(await specCommand(['validate', folder], t.deps)).toBe(1);
    expect(t.err.join('')).toContain('personal data');
  });

  it('diff changes nothing; apply stores the latest and applies names, rules and goals', async () => {
    const t = setup();
    const folder = await folderWithSpec(t);
    expect(await specCommand(['diff', 'prod', folder, ...site], t.deps)).toBe(0);
    expect(t.backends.prod!.writes ?? []).toHaveLength(0);
    expect(t.text()).toContain('pages:');
    expect(await specCommand(['apply', 'prod', folder, ...site], t.deps)).toBe(0);
    expect(t.text()).toContain('Run again with --yes');
    expect(await specCommand(['apply', 'prod', folder, ...site, '--yes'], t.deps)).toBe(0);
    const writes = t.backends.prod!.writes!;
    expect(writes.map((w) => `${w.method} ${w.path.split('/').pop()}`)).toEqual([
      'PUT spec',
      'POST goals',
      'PATCH BATCH'.replace('PATCH BATCH', 'PATCH ' + writes[2]!.path.split('/').pop()),
      'PUT labels'
    ]);
    expect(t.backends.prod!.specStore?.version).toBe(1);
    expect(t.backends.prod!.labels).toEqual(
      expect.arrayContaining([{ key: '/pricing', name: 'Pricing', group: 'Marketing' }])
    );
    expect(readFileSync(join(folder, '.vizoalica-base.json'), 'utf8')).toContain('"version":1');
    // A second apply of the same folder has nothing to do.
    expect(await specCommand(['apply', 'prod', folder, ...site, '--yes'], t.deps)).toBe(0);
    expect(t.text()).toContain('Spec changes:\nNo changes.');
  });

  it('refuses a stale folder, a stale twin, and another environment', async () => {
    const t = setup();
    const folder = await folderWithSpec(t);
    writeFileSync(join(folder, 'ONTOLOGY.md'), 'old');
    expect(await specCommand(['apply', 'prod', folder, ...site, '--yes'], t.deps)).toBe(1);
    await specCommand(['render', folder], t.deps);
    t.backends.prod!.specStore = { version: 3, spec: parseSiteSpec(SPEC).ok ? SPEC : undefined };
    writeFileSync(join(folder, '.vizoalica-base.json'), '{"version":1}');
    t.err.length = 0;
    expect(await specCommand(['apply', 'prod', folder, ...site, '--yes'], t.deps)).toBe(1);
    expect(t.err.join('')).toContain('changed since this folder');
    const meta = JSON.parse(readFileSync(join(folder, 'spec.json'), 'utf8'));
    writeFileSync(join(folder, 'spec.json'), JSON.stringify({ ...meta, environment: 'dev' }));
    expect(await specCommand(['apply', 'prod', folder, ...site, '--yes'], t.deps)).toBe(1);
    expect(t.err.join('')).toContain('written for environment "dev"');
  });

  it('pull writes the backend copy (no git), then export backs up and import restores', async () => {
    const t = setup();
    const folder = await folderWithSpec(t);
    expect(await specCommand(['apply', 'prod', folder, ...site, '--yes'], t.deps)).toBe(0);
    const pulled = join(t.cwd, 'pulled');
    expect(await specCommand(['pull', 'prod', pulled, ...site], t.deps)).toBe(0);
    expect(JSON.parse(readFileSync(join(pulled, 'pages.json'), 'utf8'))).toHaveLength(2);
    expect(await specCommand(['pull', 'prod', pulled, ...site], t.deps)).toBe(1);
    expect(await specCommand(['pull', 'prod', pulled, ...site, '--force'], t.deps)).toBe(0);
    expect(await specCommand(['validate', pulled, '--check'], t.deps)).toBe(0);

    const backup = join(t.cwd, 'backup.json');
    expect(await specCommand(['export', 'prod', ...site, '--out', backup], t.deps)).toBe(0);
    expect(await specCommand(['export', 'prod', ...site, '--out', backup], t.deps)).toBe(1);
    expect(JSON.parse(readFileSync(backup, 'utf8'))).toMatchObject({
      kind: 'vizoalica-spec-backup',
      version: 1
    });

    // Lose the backend copy, then restore it.
    t.backends.prod!.specStore = { version: 5, spec: { meta: { version: 1 } } };
    t.out.length = 0;
    expect(await specCommand(['import', 'prod', backup, ...site], t.deps)).toBe(0);
    expect(t.text()).toContain('Run again with --yes');
    expect(await specCommand(['import', 'prod', backup, ...site, '--yes'], t.deps)).toBe(0);
    expect(t.backends.prod!.specStore?.version).toBe(6);
    expect(JSON.stringify(t.backends.prod!.specStore?.spec)).toContain('blog-post');
    writeFileSync(join(t.cwd, 'junk.json'), '{"kind":"other"}');
    expect(await specCommand(['import', 'prod', 'junk.json', ...site, '--yes'], t.deps)).toBe(1);
    expect(t.err.join('')).toContain('not a Vizoalica spec backup');
  });

  it('explains an older backend, prints help, and is reachable from the main command', async () => {
    const old = setup({ prod: { ...defaultBackends().prod!, noInventory: true } });
    expect(await specCommand(['pull', 'prod', ...site], old.deps)).toBe(1);
    expect(old.err.join('')).toContain('vizoalica deploy prod --update');
    const t = setup();
    expect(await specCommand([], t.deps)).toBe(0);
    expect(t.text()).toContain('never holds personal data');
    expect(await specCommand(['wipe'], t.deps)).toBe(1);
    expect(await specCommand(['apply'], t.deps)).toBe(1);
    expect(typeof main).toBe('function');
  });

  it('maps a spec to page names, grouping rules and goals', () => {
    const parsed = parseSiteSpec(SPEC);
    if (!parsed.ok) throw new Error('invalid');
    const { mapping, problems } = specToMapping(parsed.spec);
    expect(problems).toEqual([]);
    expect(mapping.pages).toEqual([
      { key: '/pricing', name: 'Pricing', group: 'Marketing' },
      { key: '/blog/:post', name: 'Blog post', group: '' }
    ]);
    expect(mapping.groupingRules).toEqual([{ pattern: '/blog/*', key: '/blog/:post' }]);
    const wild = parseSiteSpec({
      meta: SPEC.meta,
      pages: [{ id: 'blog', match: ['/blog/*'], name: 'Blog' }]
    });
    if (!wild.ok) throw new Error('invalid');
    expect(specToMapping(wild.spec).problems[0]).toContain('no "key"');
  });
});

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sketchEvents } from '../../ingest-api/src/spec/learn-sketch.js';
import { specToFiles, renderOntology } from '../../ingest-api/src/spec/spec-files.js';
import { parseSiteSpec } from '../../ingest-api/src/spec/site-spec.js';
import { defaultBackends, harness } from './mcp-support.js';

let n = 0;
const ev = (type: string, session: string, data: Record<string, unknown>) => ({
  specversion: '1.0',
  id: `e${n++}`,
  type,
  source: 'https://shop.test',
  time: new Date(Date.UTC(2026, 10, 25, 10, 0, n)).toISOString(),
  datacontenttype: 'application/json',
  data: { visitor: { anonymous_id: session }, session: { id: session }, ...data }
});
const slice = (sessions: string[]) =>
  sessions.flatMap((s) => [
    ev('com.vizoalica.page_view.v1', s, {
      page: { url_origin: 'x', url_path: '/pricing', url_query_redacted: false }
    }),
    ev('com.vizoalica.action.v1', s, {
      page: { url_origin: 'x', url_path: '/pricing' },
      action: { name: 'Start trial', kind: 'button' }
    }),
    ev('com.vizoalica.custom_event.v1', s, { name: 'signup', page: { url_path: '/pricing' } }),
    ev('com.vizoalica.page_structure.v1', s, {
      page: { url_origin: 'x', url_path: '/pricing' },
      structure: {
        title: 'Pricing',
        controls: [
          { role: 'button', name: 'Start trial' },
          { role: 'button', landmark: 'banner' }
        ],
        a11y: { controls: 2, unlabeledControls: 1, imagesWithoutAlt: 0 }
      }
    })
  ]);
const slices = () =>
  [slice(['a', 'b']), slice(['c', 'd'])].map((events) => ({
    sketch: sketchEvents(events as never),
    objects: 2,
    done: false
  }));

describe('learning tools', () => {
  const backends = () => ({
    ...defaultBackends(),
    prod: { ...defaultBackends().prod!, learnSlices: slices() }
  });
  const site = { environment: 'prod', project: 'Acme', website: 'Shop' };

  it('summarises the newest events across calls and pages through the digest', async () => {
    const h = await harness({ backends: backends() });
    const started = await h.call('learn_start', { ...site, depth_k: 1 });
    expect(started.isError).toBe(false);
    expect(started.text).toContain('Environment: prod');
    expect(started.data).toMatchObject({ events: 16, sessions: 4, calls: 2, exhausted: true });
    const run = started.data!.run as string;

    const pages = await h.call('learn_get', { run, section: 'pages', min_sessions: 3 });
    expect(pages.data).toMatchObject({ section: 'pages', total: 1 });
    expect((pages.data!.items as any[])[0]).toMatchObject({ key: '/pricing', views: 4 });
    expect((pages.data!.quality as any).labelCoverage).toBeCloseTo(0.5, 1);

    const gaps = await h.call('learn_get', { run, section: 'gaps', min_sessions: 3 });
    expect((gaps.data!.items as any[])[0]).toMatchObject({
      page: '/pricing',
      role: 'button',
      landmark: 'banner'
    });
    const paged = await h.call('learn_get', { run, section: 'journeys', limit: 1 });
    expect((paged.data!.items as any[]).length).toBe(1);
  });

  it('refuses a min_sessions below 3, so the assistant cannot turn the privacy floor down', async () => {
    const h = await harness({ backends: backends() });
    const run = (await h.call('learn_start', { ...site, depth_k: 1 })).data!.run as string;
    const result = await h.call('learn_get', { run, section: 'actions', min_sessions: 1 });
    expect(result.isError).toBe(true);
  });

  it('hides what the operator already decided in a local spec folder', async () => {
    const h = await harness({ backends: backends() });
    const run = (await h.call('learn_start', { ...site, depth_k: 1 })).data!.run as string;
    const folder = join(h.home, 'spec');
    mkdirSync(folder);
    const parsed = parseSiteSpec({
      meta: { version: 1 },
      decisions: [
        {
          id: 'd-1',
          type: 'gap',
          decision: 'ignore',
          match: { page: '*', role: 'button', landmark: 'banner', name: '' },
          reason: 'Logo'
        }
      ]
    });
    if (!parsed.ok) throw new Error(parsed.errors.join());
    for (const [name, content] of Object.entries(specToFiles(parsed.spec)))
      writeFileSync(join(folder, name), content);
    writeFileSync(join(folder, 'ONTOLOGY.md'), renderOntology(parsed.spec));
    const gaps = await h.call('learn_get', { run, section: 'gaps', spec_dir: folder });
    expect(gaps.data).toMatchObject({ total: 0, decisionsApplied: true });
    const missing = await h.call('learn_get', {
      run,
      section: 'gaps',
      spec_dir: join(h.home, 'nowhere')
    });
    expect(missing.isError).toBe(true);
  });

  it('checks a funnel on the sample, and reports an unknown run', async () => {
    const h = await harness({ backends: backends() });
    const run = (await h.call('learn_start', { ...site, depth_k: 1 })).data!.run as string;
    const funnel = await h.call('check_funnel', {
      run,
      steps: [
        { kind: 'page', key: '/pricing' },
        { kind: 'action', page: '/pricing', name: 'Start trial' },
        { kind: 'event', name: 'signup' }
      ]
    });
    expect((funnel.data!.steps as any[]).map((step) => step.reached)).toEqual([4, 4, 4]);
    expect(
      (
        await h.call('check_funnel', {
          run: 'run-nope',
          steps: [
            { kind: 'page', key: '/' },
            { kind: 'page', key: '/a' }
          ]
        })
      ).isError
    ).toBe(true);
    expect((await h.call('learn_get', { run: 'run-nope', section: 'pages' })).isError).toBe(true);
  });

  it('explains a backend that predates learning, and reads the stored spec', async () => {
    const old = await harness({ backends: defaultBackends() });
    const failed = await old.call('learn_start', { ...site });
    expect(failed.isError).toBe(true);
    expect(failed.text).toContain('vizoalica deploy prod --update');

    const spec = {
      meta: { version: 1, store: 'git' },
      pages: [{ id: 'pricing', match: ['/pricing'], name: 'Pricing' }]
    };
    const h = await harness({
      backends: {
        ...defaultBackends(),
        prod: { ...defaultBackends().prod!, specStore: { version: 3, spec } }
      }
    });
    const stored = await h.call('get_spec', site);
    expect(stored.data).toMatchObject({ version: 3, store: 'git' });
    const none = await harness({ backends: defaultBackends() });
    expect((await none.call('get_spec', site)).data).toMatchObject({ version: 0 });
  });
});

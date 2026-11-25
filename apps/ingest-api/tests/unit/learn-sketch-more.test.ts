import { describe, expect, it } from 'vitest';
import type { CloudEvent } from '@vizoalica/event-contracts';
import { buildDigest, evaluateFunnel, SECTION_NAMES } from '../../src/spec/learn-digest.js';
import { CAPS, emptySketch, mergeSketches, sketchEvents } from '../../src/spec/learn-sketch.js';

let n = 0;
const ev = (type: string, data: Record<string, unknown>, time?: string): CloudEvent =>
  ({
    specversion: '1.0',
    id: `x${n++}`,
    type,
    source: 'https://shop.test',
    time: time ?? new Date(Date.UTC(2026, 10, 25, 10, 0, n)).toISOString(),
    datacontenttype: 'application/json',
    data
  }) as CloudEvent;
const sess = (s: string) => ({ session: { id: s } });

const struct = (s: string, path: string) =>
  ev('com.vizoalica.page_structure.v1', {
    ...sess(s),
    page: { url_path: path },
    structure: {
      title: 'Plans',
      headings: [{ level: 1, text: 'Plans' }],
      landmarks: [{ role: 'navigation', label: 'Main' }, { role: 'main' }],
      controls: [{ role: 'button', name: 'Buy', landmark: 'main' }, { role: 'link' }],
      forms: [
        { name: 'Signup', fields: [{ type: 'email', label: 'Work address' }, { type: 'text' }] }
      ],
      a11y: { controls: 2, unlabeledControls: 1, imagesWithoutAlt: 1 }
    }
  });

const sample = () => [
  ev('com.vizoalica.page_view.v1', {
    ...sess('s1'),
    page: { url_path: '/pricing' },
    referrer: { origin: 'https://search.test' },
    campaign: { source: 'news', medium: 'mail', campaign: 'spring' }
  }),
  ev('com.vizoalica.page_view.v1', { ...sess('s1'), page: { url_path: '/checkout' } }),
  ev('com.vizoalica.page_view.v1', { ...sess('s1'), page: { url_path: '/checkout' } }),
  ev('com.vizoalica.page_view.v1', { ...sess('s1'), page: {} }),
  ev('com.vizoalica.action.v1', {
    ...sess('s1'),
    page: { url_path: '/checkout' },
    action: { name: 'Pay', kind: 'button' }
  }),
  ev('com.vizoalica.action.v1', {
    ...sess('s1'),
    page: { url_path: '/checkout' },
    action: { name: 'Pay', rage: true }
  }),
  ev('com.vizoalica.action.v1', { ...sess('s1'), action: {} }),
  ev('com.vizoalica.custom_event.v1', { ...sess('s1'), name: 'signup', page: { url_path: '/x' } }),
  ev('com.vizoalica.custom_event.v1', { ...sess('s1') }),
  ev('com.vizoalica.custom_event.v1', { name: 'nosession' }),
  struct('s1', '/pricing'),
  struct('s2', '/pricing'),
  ev('com.vizoalica.page_structure.v1', { ...sess('s2') }),
  ev(
    'com.vizoalica.page_structure.v1',
    { ...sess('s2'), page: { url_path: '/bare' } },
    'not-a-date'
  )
];

describe('sketch and digest: every event shape', () => {
  it('counts what it should and ignores what it should', () => {
    const sketch = sketchEvents(sample());
    expect(sketch.pages).toEqual({ '/pricing': 1, '/checkout': 2 });
    expect(sketch.referrers).toEqual({ 'https://search.test': 1 });
    expect(Object.keys(sketch.campaigns)).toHaveLength(1);
    expect(Object.keys(sketch.actions)).toHaveLength(2);
    expect(sketch.customEvents.signup).toMatchObject({ count: 1 });
    expect(sketch.customEvents.nosession).toMatchObject({ count: 1 });
    expect(sketch.structure['/pricing']!.samples).toBe(2);
    expect(sketch.structure['/pricing']!.a11y).toEqual({
      controls: 4,
      unlabeled: 2,
      imagesWithoutAlt: 2
    });
    expect(sketch.structure['/bare']!.samples).toBe(1);
    expect(sketch.sessions).toBe(1);
  });

  it('merges overlapping slices by adding counts', () => {
    const a = sketchEvents(sample());
    const b = sketchEvents(sample());
    const merged = mergeSketches(a, b);
    expect(merged.pages['/checkout']).toBe(4);
    expect(merged.structure['/pricing']!.samples).toBe(4);
    expect(merged.customEvents.signup!.count).toBe(2);
    expect(mergeSketches(emptySketch(), a).events).toBe(a.events);
    expect(mergeSketches(a, emptySketch()).pages).toEqual(a.pages);
  });

  it('keeps a sketch bounded however many distinct values appear', () => {
    const many = Array.from({ length: CAPS.pages + 50 }, (_, i) =>
      ev('com.vizoalica.page_view.v1', { ...sess(`s${i}`), page: { url_path: `/p${i}` } })
    );
    expect(Object.keys(sketchEvents(many).pages)).toHaveLength(CAPS.pages);
  });

  it('builds every digest section and evaluates action and missing steps', () => {
    const sketch = mergeSketches(sketchEvents(sample()), sketchEvents(sample()));
    const digest = buildDigest(sketch, { minSessions: 1 });
    for (const name of SECTION_NAMES) expect(Array.isArray(digest.sections[name])).toBe(true);
    expect(digest.sections.campaigns.length).toBe(1);
    expect(digest.sections.referrers.length).toBe(1);
    expect(digest.quality.labelCoverage).not.toBeNull();
    const none = buildDigest(emptySketch(), { minSessions: 3 });
    expect(none.quality.labelCoverage).toBeNull();
    expect(none.quality.pagesSeen).toBe(0);
    expect(
      evaluateFunnel(sketch, [
        { kind: 'page', key: '/checkout' },
        { kind: 'action', page: '/checkout', name: 'Pay' },
        { kind: 'event', name: 'missing' }
      ])
    ).toEqual([2, 2, 0]);
    expect(evaluateFunnel(emptySketch(), [{ kind: 'page', key: '/a' }])).toEqual([0]);
  });

  it('reports clicked controls with fallback names as gaps and keeps partial campaigns', () => {
    const events = [
      ev('com.vizoalica.page_view.v1', {
        ...sess('a'),
        page: { url_path: '/home' },
        campaign: { source: 'news' }
      }),
      ev('com.vizoalica.page_view.v1', { ...sess('a'), page: { url_path: '/next' } }),
      ev('com.vizoalica.action.v1', {
        ...sess('a'),
        page: { url_path: '/home' },
        action: { name: 'Unlabeled button', kind: 'button' }
      }),
      ev('com.vizoalica.action.v1', {
        ...sess('b'),
        page: { url_path: '/home' },
        action: { name: 'Unlabeled button', kind: 'button' }
      })
    ];
    const digest = buildDigest(sketchEvents(events), { minSessions: 1 });
    expect(digest.sections.gaps[0]).toMatchObject({
      page: '/home',
      source: 'clicked controls',
      count: 2
    });
    expect(digest.sections.campaigns[0]).toMatchObject({ source: 'news', medium: undefined });
    expect(digest.sections.transitions[0]).toMatchObject({ from: '/home', to: '/next' });
    const decided = buildDigest(sketchEvents(events), {
      minSessions: 1,
      decisions: [{ id: 'x', type: 'gap', decision: 'accept', match: { page: '/home' } }]
    });
    expect(decided.sections.gaps).toEqual([]);
  });
});

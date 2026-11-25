import { describe, expect, it } from 'vitest';
import type { CloudEvent } from '@vizoalica/event-contracts';
import { buildDigest, evaluateFunnel } from '../../src/spec/learn-digest.js';
import { mergeSketches, sketchEvents } from '../../src/spec/learn-sketch.js';
import type { Decision } from '../../src/spec/site-spec.js';

let n = 0;
const ev = (type: string, session: string, data: Record<string, unknown>, at = n++): CloudEvent =>
  ({
    specversion: '1.0',
    id: `e${n++}`,
    type,
    source: 'https://shop.test',
    time: new Date(Date.UTC(2026, 10, 25, 10, 0, at)).toISOString(),
    datacontenttype: 'application/json',
    data: { visitor: { anonymous_id: session }, session: { id: session }, ...data }
  }) as CloudEvent;
const view = (s: string, path: string) =>
  ev('com.vizoalica.page_view.v1', s, { page: { url_origin: 'x', url_path: path, url_query_redacted: false } });
const click = (s: string, page: string, name: string) =>
  ev('com.vizoalica.action.v1', s, { page: { url_origin: 'x', url_path: page }, action: { name, kind: 'button' } });
const custom = (s: string, name: string) =>
  ev('com.vizoalica.custom_event.v1', s, { name, page: { url_path: '/pricing' } });
const structure = (s: string, path: string, title: string, controls: unknown[]) =>
  ev('com.vizoalica.page_structure.v1', s, {
    page: { url_origin: 'x', url_path: path },
    structure: {
      title,
      headings: [{ level: 1, text: title }],
      controls,
      a11y: { controls: controls.length, unlabeledControls: controls.filter((c: any) => !c.name).length, imagesWithoutAlt: 0 }
    }
  });

const events = [
  ...['a', 'b', 'c'].flatMap((s) => [
    view(s, '/pricing'),
    click(s, '/pricing', 'Start trial'),
    custom(s, s === 'c' ? 'signup' : 'sign_up'),
    structure(s, '/pricing', s === 'c' ? 'Plans' : 'Pricing', [{ role: 'button', name: 'Start trial', landmark: 'main' }, { role: 'button', landmark: 'banner' }])
  ]),
  view('d', '/pricing'),
  structure('d', '/rare', 'Jane Doe dashboard', [{ role: 'link', name: 'Jane Doe' }])
];

describe('learn sketch and digest', () => {
  it('summarises sessions without keeping ids and drops labels seen too rarely', () => {
    const sketch = sketchEvents(events);
    expect(JSON.stringify(sketch)).not.toMatch(/anonymous|"[abcd]":/);
    expect(sketch.sessions).toBe(4);
    const digest = buildDigest(sketch, { minSessions: 2 });
    const pricing = digest.sections.pages.find((p: any) => p.key === '/pricing') as any;
    expect(pricing.titles[0]).toMatchObject({ value: 'Pricing', count: 2 });
    expect(JSON.stringify(digest)).not.toContain('Jane Doe');
    expect(digest.quality.rareLabelsDropped).toBeGreaterThan(0);
    expect(digest.quality.labelCoverage).toBeCloseTo(0.57, 1);
    expect(digest.sections.gaps[0]).toMatchObject({ page: '/pricing', role: 'button', landmark: 'banner', count: 3 });
  });

  it('finds conflicts and skips what the operator already decided', () => {
    const sketch = sketchEvents(events);
    const open = buildDigest(sketch, { minSessions: 1 });
    expect(open.sections.conflicts.map((c: any) => `${c.kind}:${c.ref}`)).toEqual(
      expect.arrayContaining(['event:sign_up|signup'])
    );
    const decisions: Decision[] = [
      { id: 'd-1', type: 'gap', decision: 'ignore', match: { page: '*', role: 'button', landmark: 'banner', name: '' } },
      { id: 'd-2', type: 'conflict', decision: 'custom', subject: { kind: 'event', ref: 'sign_up|signup' }, chosen: 'Sign up' },
      { id: 'd-3', type: 'conflict', decision: 'custom', subject: { kind: 'page', ref: '/pricing' }, chosen: 'Pricing' }
    ];
    const decided = buildDigest(sketch, { minSessions: 1, decisions });
    expect(decided.sections.gaps).toEqual([]);
    expect(decided.quality.gapsDecided).toBe(1);
    expect(decided.sections.conflicts).toEqual([]);
  });

  it('merges slices and evaluates a funnel in order', () => {
    const half = Math.floor(events.length / 2);
    const merged = mergeSketches(sketchEvents(events.slice(0, half)), sketchEvents(events.slice(half)));
    expect(merged.events).toBe(events.length);
    const steps = [
      { kind: 'page', key: '/pricing' },
      { kind: 'action', page: '/pricing', name: 'Start trial' },
      { kind: 'event', name: 'sign_up' }
    ] as const;
    expect(evaluateFunnel(sketchEvents(events), [...steps])).toEqual([4, 3, 2]);
    expect(evaluateFunnel(sketchEvents(events), [{ kind: 'event', name: 'signup' }, { kind: 'page', key: '/pricing' }])).toEqual([1, 0]);
  });
});

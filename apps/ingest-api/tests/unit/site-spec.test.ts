import { describe, expect, it } from 'vitest';
import {
  describeDiff,
  diffSpecs,
  filesToSpec,
  findConflictDecision,
  findGapDecision,
  renderOntology,
  specToFiles
} from '../../src/spec/spec-files.js';
import { emptySpec, looksPersonal, parseSiteSpec } from '../../src/spec/site-spec.js';

const sample = () => ({
  meta: { version: 1, website: 'Shop', environment: 'prod' },
  groups: [
    { id: 'marketing', name: 'Marketing', kind: 'page' },
    { id: 'conversion', name: 'Conversion' }
  ],
  pages: [
    {
      id: 'pricing',
      match: ['/pricing'],
      name: 'Pricing',
      group: 'marketing',
      purpose: 'Plans',
      type: 'WebPage'
    },
    {
      id: 'blog-post',
      match: ['/blog/*'],
      key: '/blog/:post',
      name: 'Blog post',
      confidence: 'medium'
    }
  ],
  actions: [
    {
      id: 'start-trial',
      page: 'pricing',
      label: 'Start free trial',
      name: 'Start trial',
      role: 'button',
      group: 'conversion'
    }
  ],
  events: [{ id: 'signup', event: 'signup', name: 'Signup' }],
  campaigns: [
    {
      id: 'facebook',
      name: 'Facebook',
      channel: 'paid-social',
      aliases: { utm_source: ['fb', 'facebook'] }
    }
  ],
  funnels: [
    {
      id: 'trial',
      name: 'Trial',
      steps: [
        { kind: 'page', ref: 'pricing' },
        { kind: 'action', ref: 'start-trial' },
        { kind: 'event', ref: 'signup' }
      ],
      within: 'session'
    }
  ],
  paths: {
    anchors: [{ id: 'from-pricing', start: 'pricing' }],
    collapse: [{ group: 'marketing' }]
  },
  goals: [{ name: 'Signed up', kind: 'event', target: 'signup' }],
  decisions: [
    {
      id: 'd-1',
      type: 'gap',
      decision: 'ignore',
      match: { page: '*', role: 'button', landmark: 'banner', name: '' },
      reason: 'Logo'
    },
    {
      id: 'd-2',
      type: 'conflict',
      decision: 'option',
      subject: { kind: 'action', ref: 'start-trial' },
      options: ['Start free trial', 'Try it free'],
      chosen: 'Start free trial'
    }
  ]
});

describe('site spec', () => {
  it('accepts a full spec and round-trips through files', () => {
    const parsed = parseSiteSpec(sample());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const files = specToFiles(parsed.spec);
    const again = filesToSpec(files);
    expect(again.ok).toBe(true);
    if (again.ok) expect(specToFiles(again.spec)).toEqual(files);
  });

  it('lists every problem with its position', () => {
    const bad = sample() as any;
    bad.pages[0].group = 'nope';
    bad.funnels[0].steps[0].ref = 'missing';
    bad.actions[0].extra = 1;
    const parsed = parseSiteSpec(bad);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors.join('\n')).toContain('pages[0]: group "nope"');
      expect(parsed.errors.join('\n')).toContain('funnels[0].steps[0]');
      expect(parsed.errors.join('\n')).toContain('actions[0]: unknown field "extra"');
    }
  });

  it('refuses personal data anywhere in text', () => {
    for (const value of [
      'mail jane@example.com',
      'from 203.0.113.7',
      'call 555 123 4567',
      'at 2001:db8::1'
    ]) {
      const bad = sample() as any;
      bad.pages[0].purpose = value;
      const parsed = parseSiteSpec(bad);
      expect(parsed.ok, value).toBe(false);
    }
    expect(looksPersonal('Plans and pricing')).toBeUndefined();
    expect(looksPersonal('Step 2 of 3')).toBeUndefined();
  });

  it('refuses a funnel with fewer than two steps, a bad pattern, and a chosen option not offered', () => {
    const bad = sample() as any;
    bad.funnels[0].steps = [{ kind: 'page', ref: 'pricing' }];
    bad.pages[1].match = ['/blog/a*b'];
    bad.decisions[1].chosen = 'Other';
    const parsed = parseSiteSpec(bad);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('renders a deterministic markdown twin', () => {
    const parsed = parseSiteSpec(sample());
    if (!parsed.ok) throw new Error('invalid');
    const md = renderOntology(parsed.spec);
    expect(md).toBe(renderOntology(parsed.spec));
    expect(md).toContain('# Site ontology: Shop');
    expect(md).toContain('### Marketing');
    expect(md).toContain('1. page: Pricing');
    expect(md).toContain('3. event: Signup');
    expect(md).toContain('Do not edit');
  });

  it('diffs by entity id', () => {
    const a = parseSiteSpec(sample());
    const changed = sample() as any;
    changed.pages[0].name = 'Plans';
    changed.pages.pop();
    changed.events.push({ id: 'buy', event: 'buy', name: 'Buy' });
    const b = parseSiteSpec(changed);
    if (!a.ok || !b.ok) throw new Error('invalid');
    const diffs = diffSpecs(a.spec, b.spec);
    expect(diffs.find((d) => d.section === 'pages')).toMatchObject({
      changed: ['pricing'],
      removed: ['blog-post']
    });
    expect(diffs.find((d) => d.section === 'events')?.added).toEqual(['buy']);
    expect(describeDiff(diffs)).toContain('pages:');
    expect(diffSpecs(a.spec, a.spec)).toEqual([]);
    expect(diffSpecs(undefined, emptySpec()).length).toBe(0);
  });

  it('finds remembered decisions', () => {
    const parsed = parseSiteSpec(sample());
    if (!parsed.ok) throw new Error('invalid');
    const gap = { page: 'cart', role: 'button', landmark: 'banner', name: '', index: 2 };
    expect(findGapDecision(parsed.spec.decisions, gap)?.id).toBe('d-1');
    expect(findGapDecision(parsed.spec.decisions, { ...gap, landmark: 'main' })).toBeUndefined();
    expect(findConflictDecision(parsed.spec.decisions, 'action', 'start-trial')?.chosen).toBe(
      'Start free trial'
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  describePlan,
  isEmptyPlan,
  parseMapping,
  planMapping
} from '../src/mapping/mapping-file.js';

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

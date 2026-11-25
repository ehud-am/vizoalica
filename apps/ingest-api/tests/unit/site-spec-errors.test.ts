import { describe, expect, it } from 'vitest';
import { parseSiteSpec } from '../../src/spec/site-spec.js';

const meta = { version: 1 };
const base = {
  meta,
  groups: [{ id: 'g', name: 'G' }],
  pages: [{ id: 'p', match: ['/p'], name: 'P' }],
  actions: [{ id: 'a', page: 'p', label: 'Buy', name: 'Buy' }],
  events: [{ id: 'e', event: 'signup', name: 'Signup' }]
};

const errors = (raw: unknown): string => {
  const result = parseSiteSpec(raw);
  return result.ok ? '' : result.errors.join('\n');
};

describe('parseSiteSpec: problems are listed with their position', () => {
  it.each<[string, unknown, string]>([
    ['non-object', [], 'one JSON object'],
    ['unknown top field', { meta, nope: 1 }, 'unknown field "nope"'],
    ['bad version', { meta: { version: 2 } }, 'must be 1'],
    ['bad store', { meta: { version: 1, store: 'x' } }, 'git or backend'],
    ['list not array', { meta, pages: {} }, 'must be a list'],
    ['too many', { meta, groups: Array.from({ length: 500 }, () => ({})) }, 'at most'],
    ['entry not object', { meta, pages: [1] }, 'must be an object'],
    ['bad group kind', { meta, groups: [{ id: 'g', name: 'G', kind: 'x' }] }, 'page, action'],
    ['bad id', { meta, groups: [{ id: 'G!', name: 'G' }] }, '"id" must be lowercase'],
    [
      'duplicate id',
      {
        meta,
        groups: [
          { id: 'g', name: 'G' },
          { id: 'g', name: 'H' }
        ]
      },
      'used twice'
    ],
    ['empty text', { meta, groups: [{ id: 'g', name: ' ' }] }, 'must be text'],
    [
      'unknown group',
      { ...base, pages: [{ id: 'p', match: ['/p'], name: 'P', group: 'zz' }] },
      'not defined in groups'
    ],
    ['bad match list', { meta, pages: [{ id: 'p', match: [], name: 'P' }] }, 'path patterns'],
    [
      'bad pattern',
      { meta, pages: [{ id: 'p', match: ['no-slash'], name: 'P' }] },
      'not a valid path pattern'
    ],
    [
      'trailing slash',
      { meta, pages: [{ id: 'p', match: ['/a/'], name: 'P' }] },
      'not a valid path pattern'
    ],
    [
      'partial wildcard',
      { meta, pages: [{ id: 'p', match: ['/a*b'], name: 'P' }] },
      'not a whole segment'
    ],
    ['bad key', { meta, pages: [{ id: 'p', match: ['/p'], name: 'P', key: 'x' }] }, 'page key'],
    [
      'bad type',
      { meta, pages: [{ id: 'p', match: ['/p'], name: 'P', type: 'x y' }] },
      'schema.org'
    ],
    [
      'bad confidence',
      { meta, pages: [{ id: 'p', match: ['/p'], name: 'P', confidence: 'sure' }] },
      'high, medium or low'
    ],
    [
      'bad status',
      { meta, pages: [{ id: 'p', match: ['/p'], name: 'P', status: 'x' }] },
      'active or deprecated'
    ],
    [
      'action page missing',
      { ...base, actions: [{ id: 'a', page: 'zz', label: 'L', name: 'N' }] },
      'not defined in pages'
    ],
    [
      'bad role',
      { ...base, actions: [{ id: 'a', page: '*', label: 'L', name: 'N', role: 'Bad Role' }] },
      'ARIA role'
    ],
    [
      'bad event name',
      { meta, events: [{ id: 'e', event: 'Sign Up', name: 'S' }] },
      'lowercase event name'
    ],
    [
      'duplicate event name',
      {
        meta,
        events: [
          { id: 'e', event: 'x', name: 'S' },
          { id: 'f', event: 'x', name: 'T' }
        ]
      },
      'event "x" is used twice'
    ],
    [
      'campaign aliases not object',
      { meta, campaigns: [{ id: 'c', name: 'C', aliases: 1 }] },
      '"aliases" must be an object'
    ],
    [
      'campaign alias list',
      { meta, campaigns: [{ id: 'c', name: 'C', aliases: { utm_source: 'x' } }] },
      'list of at most 20'
    ],
    [
      'campaign alias field',
      { meta, campaigns: [{ id: 'c', name: 'C', aliases: { utm_x: [] } }] },
      'unknown field "utm_x"'
    ],
    ['funnel steps', { ...base, funnels: [{ id: 'f', name: 'F', steps: [] }] }, '2 to'],
    [
      'funnel within',
      { ...base, funnels: [{ id: 'f', name: 'F', within: 'week', steps: [] }] },
      '"within" must be'
    ],
    [
      'funnel bad step',
      { ...base, funnels: [{ id: 'f', name: 'F', steps: [1, 2] }] },
      'needs "kind"'
    ],
    [
      'funnel unknown ref',
      {
        ...base,
        funnels: [
          {
            id: 'f',
            name: 'F',
            steps: [
              { kind: 'page', ref: 'p' },
              { kind: 'event', ref: 'zz' }
            ]
          }
        ]
      },
      'is not defined'
    ],
    ['paths not object', { ...base, paths: 1 }, 'paths: must be an object'],
    ['anchor empty', { ...base, paths: { anchors: [{ id: 'x' }] } }, 'needs "start" or "end"'],
    [
      'anchor bad page',
      { ...base, paths: { anchors: [{ id: 'x', start: 'zz' }] } },
      'page id defined'
    ],
    [
      'collapse bad group',
      { ...base, paths: { collapse: [{ group: 'zz' }] } },
      'not defined in groups'
    ],
    [
      'goal bad kind',
      { ...base, goals: [{ name: 'G', kind: 'x', target: 't' }] },
      '"kind" must be page'
    ],
    ['decision bad type', { ...base, decisions: [{ id: 'd', type: 'x' }] }, 'gap or conflict'],
    [
      'decision bad date',
      { ...base, decisions: [{ id: 'd', type: 'x', decided: 'soon', 'review-after': 'later' }] },
      'YYYY-MM-DD'
    ],
    [
      'gap bad decision',
      { ...base, decisions: [{ id: 'd', type: 'gap', decision: 'x' }] },
      'label, accept or ignore'
    ],
    [
      'gap no match',
      { ...base, decisions: [{ id: 'd', type: 'gap', decision: 'accept' }] },
      '"match" must be an object'
    ],
    [
      'gap empty match',
      { ...base, decisions: [{ id: 'd', type: 'gap', decision: 'accept', match: {} }] },
      '"match" is empty'
    ],
    [
      'gap bad index',
      { ...base, decisions: [{ id: 'd', type: 'gap', decision: 'accept', match: { index: -1 } }] },
      '"index" must be'
    ],
    [
      'gap value on accept',
      {
        ...base,
        decisions: [{ id: 'd', type: 'gap', decision: 'accept', match: { page: 'p' }, value: 'x' }]
      },
      'only for label'
    ],
    [
      'gap label needs value',
      { ...base, decisions: [{ id: 'd', type: 'gap', decision: 'label', match: { page: 'p' } }] },
      '"value" is required'
    ],
    [
      'conflict bad decision',
      { ...base, decisions: [{ id: 'd', type: 'conflict', decision: 'x' }] },
      'option or custom'
    ],
    [
      'conflict no subject',
      { ...base, decisions: [{ id: 'd', type: 'conflict', decision: 'option' }] },
      '"subject" needs'
    ],
    [
      'conflict few options',
      {
        ...base,
        decisions: [
          {
            id: 'd',
            type: 'conflict',
            decision: 'option',
            subject: { kind: 'page', ref: 'p' },
            options: ['a'],
            chosen: 'a'
          }
        ]
      },
      '2 to 5 options'
    ],
    [
      'conflict chosen not option',
      {
        ...base,
        decisions: [
          {
            id: 'd',
            type: 'conflict',
            decision: 'option',
            subject: { kind: 'page', ref: 'p' },
            options: ['a', 'b'],
            chosen: 'c'
          }
        ]
      },
      'must be one of'
    ],
    [
      'personal data',
      { ...base, pages: [{ id: 'p', match: ['/p'], name: 'mail me at a@b.com' }] },
      'personal data'
    ]
  ])('%s', (_name, raw, expected) => {
    expect(errors(raw)).toContain(expected);
  });

  it('accepts a full spec with every decision shape, anchors and aliases', () => {
    const result = parseSiteSpec({
      meta: {
        version: 1,
        store: 'git',
        environment: 'prod',
        project: 'Acme',
        website: 'Shop',
        generatedFrom: { depthK: 5, start: '2026-11-01', end: '2026-11-14' }
      },
      ...base,
      campaigns: [
        {
          id: 'c',
          name: 'Spring',
          channel: 'email',
          aliases: { utm_source: ['news'], utm_medium: ['mail'] }
        }
      ],
      funnels: [
        {
          id: 'f',
          name: 'F',
          within: 'session',
          steps: [
            { kind: 'page', ref: 'p' },
            { kind: 'action', ref: 'a' },
            { kind: 'event', ref: 'e' }
          ]
        }
      ],
      paths: {
        anchors: [{ id: 'x', name: 'X', start: 'p', end: 'p' }],
        collapse: [{ group: 'g' }]
      },
      goals: [{ name: 'Signed up', kind: 'event', target: 'signup' }],
      decisions: [
        {
          id: 'g1',
          type: 'gap',
          decision: 'label',
          match: { page: '/p', role: 'button', landmark: 'nav', name: '', index: 2 },
          value: 'Menu',
          reason: 'ok',
          decided: '2026-11-01',
          'review-after': '2027-01-01'
        },
        { id: 'g2', type: 'gap', decision: 'ignore', match: { name: 'x' } },
        {
          id: 'c1',
          type: 'conflict',
          decision: 'option',
          subject: { kind: 'page', ref: 'p' },
          options: ['a', 'b'],
          chosen: 'a'
        },
        {
          id: 'c2',
          type: 'conflict',
          decision: 'custom',
          subject: { kind: 'event', ref: 'e' },
          chosen: 'Own name'
        }
      ]
    });
    expect(result).toMatchObject({ ok: true });
  });

  it('refuses a spec over the size cap', () => {
    const pages = Array.from({ length: 400 }, (_, i) => ({
      id: `p${i}`,
      match: [`/p${i}`],
      name: 'n'.repeat(80),
      purpose: 'x'.repeat(200),
      evidence: 'y'.repeat(200)
    }));
    const actions = Array.from({ length: 800 }, (_, i) => ({
      id: `a${i}`,
      page: '*',
      label: 'l'.repeat(80),
      name: 'n'.repeat(80),
      evidence: 'y'.repeat(200)
    }));
    const text = errors({ meta, pages, actions });
    expect(text.length).toBeGreaterThan(0);
  });
});

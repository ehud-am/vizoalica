import { describe, expect, it } from 'vitest';
import {
  filesToSpec,
  findGapDecision,
  renderOntology,
  specToFiles
} from '../../src/spec/spec-files.js';
import { emptySpec, parseSiteSpec, type Decision } from '../../src/spec/site-spec.js';

const gap = (match: Record<string, unknown>): Decision =>
  ({ id: 'd', type: 'gap', decision: 'ignore', match }) as Decision;
const element = { page: '/shop/cart', role: 'button', landmark: 'main', name: 'Buy now', index: 1 };

describe('findGapDecision: gitignore-like selectors', () => {
  it('matches exact, wildcard, prefix, suffix and index selectors', () => {
    expect(findGapDecision([gap({ page: '*' })], element)).toBeDefined();
    expect(findGapDecision([gap({ page: '/shop/*' })], element)).toBeDefined();
    expect(findGapDecision([gap({ name: '*now' })], element)).toBeDefined();
    expect(findGapDecision([gap({ name: 'Buy*now' })], element)).toBeDefined();
    expect(findGapDecision([gap({ name: 'Buy now*now' })], element)).toBeUndefined();
    expect(findGapDecision([gap({ page: '/other/*' })], element)).toBeUndefined();
    expect(findGapDecision([gap({ role: 'link' })], element)).toBeUndefined();
    expect(findGapDecision([gap({ landmark: 'nav' })], element)).toBeUndefined();
    expect(findGapDecision([gap({ name: 'Other' })], element)).toBeUndefined();
    expect(findGapDecision([gap({ index: 2 })], element)).toBeUndefined();
    expect(findGapDecision([gap({ index: 1 })], element)).toBeDefined();
    expect(findGapDecision([], element)).toBeUndefined();
    expect(
      findGapDecision(
        [
          {
            id: 'c',
            type: 'conflict',
            decision: 'custom',
            subject: { kind: 'page', ref: 'x' },
            chosen: 'y'
          }
        ],
        element
      )
    ).toBeUndefined();
  });
});

describe('filesToSpec', () => {
  it('names missing and unreadable files', () => {
    const missing = filesToSpec({});
    expect(missing.ok).toBe(false);
    const bad = filesToSpec({ 'spec.json': '{"version":1}', 'pages.json': '{oops' });
    expect(bad.ok ? [] : bad.errors.join()).toContain('pages.json is not valid JSON');
    const broken = filesToSpec({ 'spec.json': 'nope' });
    expect(broken.ok ? [] : broken.errors.join()).toContain('spec.json is not valid JSON');
  });
  it('round-trips an empty spec', () => {
    const files = specToFiles(emptySpec({ version: 1 }));
    expect(filesToSpec(files).ok).toBe(true);
  });
});

describe('renderOntology', () => {
  it('says when a funnel crosses page loads', () => {
    const parsed = parseSiteSpec({
      meta: { version: 1 },
      pages: [
        { id: 'a', match: ['/a'], name: 'A' },
        { id: 'b', match: ['/b'], name: 'B' }
      ],
      funnels: [
        {
          id: 'f',
          name: 'Flow',
          within: 'day',
          steps: [
            { kind: 'page', ref: 'a' },
            { kind: 'page', ref: 'b' }
          ]
        }
      ]
    });
    if (!parsed.ok) throw new Error('invalid');
    expect(renderOntology(parsed.spec)).toContain('across page loads in one day');
  });
});

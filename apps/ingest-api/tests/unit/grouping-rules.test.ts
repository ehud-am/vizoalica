import { describe, expect, it } from 'vitest';
import {
  applyGroupingRules,
  MAX_GROUPING_RULES,
  parseGroupingRules
} from '../../src/ingestion/grouping-rules.js';

describe('grouping rules', () => {
  const rules = [
    { pattern: '/blog/*', key: '/blog/:post' },
    { pattern: '/docs/**', key: '/docs/:page' },
    { pattern: '/shop/*/reviews', key: '/shop/:item/reviews' }
  ];

  it('renames a page key by the first rule that matches', () => {
    expect(applyGroupingRules('/blog/hello-world', rules)).toBe('/blog/:post');
    expect(applyGroupingRules('/docs/a/b/c', rules)).toBe('/docs/:page');
    expect(applyGroupingRules('/shop/shoes/reviews', rules)).toBe('/shop/:item/reviews');
  });

  it('keeps a hash route and leaves other pages alone', () => {
    expect(applyGroupingRules('/blog/hello#/comments', rules)).toBe('/blog/:post#/comments');
    expect(applyGroupingRules('/blog', rules)).toBe('/blog');
    expect(applyGroupingRules('/blog/a/b', rules)).toBe('/blog/a/b');
    expect(applyGroupingRules('/docs', rules)).toBe('/docs');
    expect(applyGroupingRules('/pricing', rules)).toBe('/pricing');
    expect(applyGroupingRules('/blog/x', undefined)).toBe('/blog/x');
    expect(applyGroupingRules('/blog/x', [])).toBe('/blog/x');
  });

  it('uses the first matching rule', () => {
    const ordered = [
      { pattern: '/a/*', key: '/first' },
      { pattern: '/a/b', key: '/second' }
    ];
    expect(applyGroupingRules('/a/b', ordered)).toBe('/first');
  });

  it('accepts a valid list and trims entries', () => {
    expect(parseGroupingRules([{ pattern: ' /blog/* ', key: ' /blog/:post ' }])).toEqual({
      ok: true,
      rules: [{ pattern: '/blog/*', key: '/blog/:post' }]
    });
    expect(parseGroupingRules([])).toEqual({ ok: true, rules: [] });
  });

  it('refuses anything that is not a plain path pattern, naming the position', () => {
    expect(parseGroupingRules('x')).toEqual({ ok: false, reason: 'not_a_list' });
    expect(parseGroupingRules(Array(MAX_GROUPING_RULES + 1).fill({}))).toEqual({
      ok: false,
      reason: 'too_many'
    });
    const bad = [
      { pattern: 'blog/*', key: '/k' },
      { pattern: '/blog/(a+)+', key: '/k' },
      { pattern: '/blog/*', key: '/k?x' },
      { pattern: '/blog/p*', key: '/k' },
      { pattern: '/**/x', key: '/k' },
      { pattern: '/' + 'a'.repeat(200), key: '/k' },
      { pattern: '/a', key: '' },
      null
    ];
    for (const [index, rule] of bad.entries())
      expect(parseGroupingRules([{ pattern: '/ok', key: '/ok' }, rule]), String(index)).toEqual({
        ok: false,
        reason: 'invalid_rule',
        index: 1
      });
  });
});

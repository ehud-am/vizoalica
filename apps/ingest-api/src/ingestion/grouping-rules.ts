import type { GroupingRule } from '../domain/types.js';

export const MAX_GROUPING_RULES = 25;
export const MAX_RULE_LENGTH = 200;

// Plain path characters only: no regular expressions, so a rule can never run away.
const PATTERN = /^\/[A-Za-z0-9_.~:@%+\-*/]*$/;
const KEY = /^\/[^?#\u0000-\u001F\u007F]*$/;

export type RulesResult =
  { ok: true; rules: GroupingRule[] } | { ok: false; reason: string; index?: number };

/**
 * Validates the grouping rules of a request. `*` stands for one whole path segment and a final
 * `**` for the rest of the path. The refusal names the rule's position and the reason.
 */
export function parseGroupingRules(value: unknown): RulesResult {
  if (!Array.isArray(value)) return { ok: false, reason: 'not_a_list' };
  if (value.length > MAX_GROUPING_RULES) return { ok: false, reason: 'too_many' };
  const rules: GroupingRule[] = [];
  for (const [index, entry] of value.entries()) {
    const rule = entry as { pattern?: unknown; key?: unknown } | null;
    const pattern = typeof rule?.pattern === 'string' ? rule.pattern.trim() : '';
    const key = typeof rule?.key === 'string' ? rule.key.trim() : '';
    if (!pattern || !key || pattern.length > MAX_RULE_LENGTH || key.length > MAX_RULE_LENGTH)
      return { ok: false, reason: 'invalid_rule', index };
    if (!PATTERN.test(pattern) || !KEY.test(key))
      return { ok: false, reason: 'invalid_rule', index };
    // Page keys never end in a slash or hold an empty segment, so such a pattern could never match.
    if (pattern !== '/' && (pattern.endsWith('/') || pattern.includes('//')))
      return { ok: false, reason: 'invalid_rule', index };
    const segments = pattern.split('/').slice(1);
    // A segment is whole text, `*`, or a last `**`; `*` inside text is not a wildcard.
    if (segments.some((segment, at) => segment.includes('*') && !isWildcard(segment, at, segments)))
      return { ok: false, reason: 'invalid_rule', index };
    rules.push({ pattern, key });
  }
  return { ok: true, rules };
}

function isWildcard(segment: string, at: number, segments: string[]): boolean {
  return segment === '*' || (segment === '**' && at === segments.length - 1);
}

/** Whether a page path (no hash) matches a rule's pattern. Linear in the path, no backtracking. */
function matches(pattern: string, path: string): boolean {
  const want = pattern.split('/').slice(1);
  const have = path.split('/').slice(1);
  for (let at = 0; at < want.length; at += 1) {
    const segment = want[at]!;
    if (segment === '**' && at === want.length - 1) return have.length > at;
    if (at >= have.length) return false;
    if (segment !== '*' && segment !== have[at]) return false;
  }
  return have.length === want.length;
}

/**
 * Renames a page key by the first rule that matches its path. A `#/route` suffix is kept. With no
 * rules, or no match, the key is returned unchanged.
 */
export function applyGroupingRules(pageKey: string, rules: GroupingRule[] | undefined): string {
  if (!rules?.length) return pageKey;
  const hash = pageKey.indexOf('#');
  const path = hash === -1 ? pageKey : pageKey.slice(0, hash);
  const suffix = hash === -1 ? '' : pageKey.slice(hash);
  for (const rule of rules) if (matches(rule.pattern, path)) return rule.key + suffix;
  return pageKey;
}

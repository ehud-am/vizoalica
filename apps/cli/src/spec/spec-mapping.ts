import type { SiteSpec } from '../../../ingest-api/src/spec/site-spec.js';
import type { Mapping } from '../mapping/mapping-file.js';

/**
 * The part of a spec the backend applies to reports today: page names and groups (labels),
 * grouping rules, and goals. It reuses the guided-setup plan, so nothing is ever removed.
 */
export function specToMapping(spec: SiteSpec): { mapping: Mapping; problems: string[] } {
  const problems: string[] = [];
  const groups = new Map(spec.groups.map((group) => [group.id, group.name]));
  const pages: Mapping['pages'] = [];
  const groupingRules: Mapping['groupingRules'] = [];
  const seenKeys = new Set<string>();
  for (const page of spec.pages) {
    if (page.status === 'deprecated') continue;
    const literal = page.match.find((pattern) => !pattern.includes('*'));
    const key = page.key ?? literal;
    if (!key) {
      problems.push(
        `page "${page.id}" matches only wildcards and has no "key"; add a key such as "/blog/:post".`
      );
      continue;
    }
    if (seenKeys.has(key)) {
      problems.push(`page "${page.id}" uses key ${key}, which another page already uses.`);
      continue;
    }
    seenKeys.add(key);
    pages.push({
      key,
      name: page.name,
      group: page.group ? (groups.get(page.group) ?? '') : ''
    });
    for (const pattern of page.match)
      if (pattern !== key && (pattern.includes('*') || page.key !== undefined))
        groupingRules.push({ pattern, key });
  }
  return {
    mapping: {
      version: 1,
      ...(spec.meta.project ? { project: spec.meta.project } : {}),
      ...(spec.meta.website ? { website: spec.meta.website } : {}),
      pages,
      groupingRules,
      goals: spec.goals
    },
    problems
  };
}

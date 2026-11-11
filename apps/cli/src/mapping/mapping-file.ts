import type {
  Goal,
  GoalKind,
  GroupingRule,
  PageLabel,
  SetupInventory
} from '../../../ingest-api/src/domain/types.js';
import {
  applyGroupingRules,
  MAX_GROUPING_RULES,
  parseGroupingRules
} from '../../../ingest-api/src/ingestion/grouping-rules.js';
import { MAX_PAGE_LABELS, parsePageLabels } from '../../../ingest-api/src/ingestion/page-labels.js';

/** Goals per website; the Worker enforces the same limit. */
export const MAX_GOALS = 20;

export type MappingGoal = { kind: GoalKind; name: string; target: string };

/**
 * The file a person reviews. `confidence` and `reason` on a page are for the reviewer; they are
 * checked for type and never stored.
 */
export type Mapping = {
  version: 1;
  environment?: string | undefined;
  project?: string | undefined;
  website?: string | undefined;
  pages: Array<PageLabel & { confidence?: string; reason?: string }>;
  groupingRules: GroupingRule[];
  goals: MappingGoal[];
};

export type ParsedMapping = { ok: true; mapping: Mapping } | { ok: false; errors: string[] };

const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' && value.length <= max ? value : undefined;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Reads and validates a mapping file. Every problem is listed with its position. */
export function parseMapping(source: string): ParsedMapping {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return { ok: false, errors: ['The file is not valid JSON.'] };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return { ok: false, errors: ['The file must hold one JSON object.'] };
  const file = raw as Record<string, unknown>;
  const errors: string[] = [];
  if (file.version !== 1) errors.push('"version" must be 1.');
  for (const field of ['environment', 'project', 'website'])
    if (file[field] !== undefined && text(file[field], 200) === undefined)
      errors.push(`"${field}" must be a text.`);

  const pagesIn = file.pages === undefined ? [] : file.pages;
  const pages = parsePageLabels(pagesIn);
  if (!pages.ok)
    errors.push(
      `pages${pages.index === undefined ? '' : ` #${pages.index + 1}`}: ${pages.reason.replace('_', ' ')} (key: a page key starting with "/", no "?"; name: 1 to 80 characters; group: up to 60; each key once; at most ${MAX_PAGE_LABELS}).`
    );
  const notes: Array<{ confidence?: string; reason?: string }> = [];
  if (Array.isArray(pagesIn))
    for (const [index, page] of pagesIn.entries()) {
      const entry = page as { confidence?: unknown; reason?: unknown } | null;
      for (const field of ['confidence', 'reason'] as const)
        if (entry && entry[field] !== undefined && text(entry[field], 500) === undefined)
          errors.push(`pages #${index + 1}: "${field}" must be a text of at most 500 characters.`);
      notes.push({
        ...(typeof entry?.confidence === 'string' ? { confidence: entry.confidence } : {}),
        ...(typeof entry?.reason === 'string' ? { reason: entry.reason } : {})
      });
    }

  const rules = parseGroupingRules(file.groupingRules === undefined ? [] : file.groupingRules);
  if (!rules.ok)
    errors.push(
      `groupingRules${rules.index === undefined ? '' : ` #${rules.index + 1}`}: ${rules.reason.replace('_', ' ')} ("*" is one whole segment, a final "**" is the rest; at most ${MAX_GROUPING_RULES}).`
    );

  const goals: MappingGoal[] = [];
  const goalsIn = file.goals === undefined ? [] : file.goals;
  if (!Array.isArray(goalsIn)) errors.push('goals must be a list.');
  else {
    if (goalsIn.length > MAX_GOALS) errors.push(`goals: at most ${MAX_GOALS}.`);
    for (const [index, item] of goalsIn.entries()) {
      const goal = item as { kind?: unknown; name?: unknown; target?: unknown } | null;
      const name = typeof goal?.name === 'string' ? goal.name.trim() : '';
      const target = typeof goal?.target === 'string' ? goal.target.trim() : '';
      const kind = goal?.kind;
      const valid =
        (kind === 'page' || kind === 'action' || kind === 'event') &&
        name &&
        name.length <= 80 &&
        !CONTROL.test(name) &&
        target &&
        target.length <= (kind === 'page' ? 512 : 80) &&
        !CONTROL.test(target) &&
        (kind !== 'page' || (target.startsWith('/') && !target.includes('?')));
      if (!valid)
        errors.push(
          `goals #${index + 1}: needs kind page, action or event; a name up to 80 characters; a target (a page key starting with "/" for a page).`
        );
      else goals.push({ kind: kind as GoalKind, name, target });
    }
  }
  if (errors.length > 0 || !pages.ok || !rules.ok) return { ok: false, errors };
  return {
    ok: true,
    mapping: {
      version: 1,
      ...(typeof file.environment === 'string' ? { environment: file.environment } : {}),
      ...(typeof file.project === 'string' ? { project: file.project } : {}),
      ...(typeof file.website === 'string' ? { website: file.website } : {}),
      pages: pages.labels.map((label, index) => ({ ...label, ...notes[index] })),
      groupingRules: rules.rules,
      goals
    }
  };
}

export type RuleEffect = { rule: GroupingRule; collapses: string[]; existing: boolean };

export type Plan = {
  labels: { add: PageLabel[]; change: Array<{ from: PageLabel; to: PageLabel }>; keep: number };
  rules: { add: RuleEffect[]; skipped: GroupingRule[] };
  goals: { add: MappingGoal[]; existing: MappingGoal[] };
  /** What would be written, after merging with what the website already has. */
  result: { labels: PageLabel[]; groupingRules: GroupingRule[]; goalsToCreate: MappingGoal[] };
  problems: string[];
};

/**
 * What applying `mapping` to a website would change. Nothing is removed: labels and rules the
 * website already has stay, a label for a key already labelled replaces it, a rule or goal that is
 * already there is skipped. Each new rule lists the page keys seen in the inventory that it would
 * count as one page from now on (grouping applies to new events only).
 */
export function planMapping(
  current: Pick<SetupInventory, 'pages' | 'groupingRules' | 'goals' | 'labels'>,
  mapping: Mapping
): Plan {
  const problems: string[] = [];
  const have = new Map(current.labels.map((label) => [label.key, label]));
  const add: PageLabel[] = [];
  const change: Plan['labels']['change'] = [];
  let keep = current.labels.length;
  for (const page of mapping.pages) {
    const to = { key: page.key, name: page.name, group: page.group };
    const from = have.get(page.key);
    if (!from) add.push(to);
    else if (from.name !== to.name || from.group !== to.group) {
      change.push({ from, to });
    }
    if (from) keep -= 1;
    have.set(page.key, to);
  }
  if (have.size > MAX_PAGE_LABELS)
    problems.push(`The website would have ${have.size} labels; the limit is ${MAX_PAGE_LABELS}.`);

  const rules = [...current.groupingRules];
  const ruleAdd: RuleEffect[] = [];
  const skipped: GroupingRule[] = [];
  for (const rule of mapping.groupingRules) {
    if (rules.some((item) => item.pattern === rule.pattern)) {
      skipped.push(rule);
      continue;
    }
    rules.push(rule);
    ruleAdd.push({
      rule,
      collapses: current.pages
        .map((page) => page.key)
        .filter((key) => applyGroupingRules(key, [rule]) !== key),
      existing: false
    });
  }
  if (rules.length > MAX_GROUPING_RULES)
    problems.push(
      `The website would have ${rules.length} rules; the limit is ${MAX_GROUPING_RULES}.`
    );

  const goalsExisting: MappingGoal[] = [];
  const goalsAdd: MappingGoal[] = [];
  for (const goal of mapping.goals) {
    const same = current.goals.some(
      (item: Goal) =>
        (item.kind === goal.kind && item.target === goal.target) ||
        item.name.toLowerCase() === goal.name.toLowerCase()
    );
    (same ? goalsExisting : goalsAdd).push(goal);
  }
  if (current.goals.length + goalsAdd.length > MAX_GOALS)
    problems.push(
      `The website would have ${current.goals.length + goalsAdd.length} goals; the limit is ${MAX_GOALS}.`
    );
  return {
    labels: { add, change, keep: Math.max(keep, 0) },
    rules: { add: ruleAdd, skipped },
    goals: { add: goalsAdd, existing: goalsExisting },
    result: {
      labels: [...have.values()].sort((a, b) => a.key.localeCompare(b.key)),
      groupingRules: rules,
      goalsToCreate: goalsAdd
    },
    problems
  };
}

export const isEmptyPlan = (plan: Plan): boolean =>
  plan.labels.add.length +
    plan.labels.change.length +
    plan.rules.add.length +
    plan.goals.add.length ===
  0;

const quote = (value: string) => JSON.stringify(value);

/** The review text: what changes, in plain lines. */
export function describePlan(plan: Plan): string {
  const lines: string[] = [];
  const named = (label: PageLabel) =>
    `${label.key} -> ${quote(label.name)}${label.group ? ` [${label.group}]` : ''}`;
  lines.push(
    `Page names and groups: ${plan.labels.add.length} new, ${plan.labels.change.length} changed, ${plan.labels.keep} left as they are.`
  );
  for (const label of plan.labels.add) lines.push(`  + ${named(label)}`);
  for (const { from, to } of plan.labels.change)
    lines.push(
      `  ~ ${from.key}: ${quote(from.name)}${from.group ? ` [${from.group}]` : ''} -> ${quote(to.name)}${to.group ? ` [${to.group}]` : ''}`
    );
  lines.push(
    `Grouping rules: ${plan.rules.add.length} new${plan.rules.skipped.length ? `, ${plan.rules.skipped.length} already there` : ''}. They count only new events, and merge pages for good.`
  );
  for (const { rule, collapses } of plan.rules.add) {
    const shown = collapses.slice(0, 5).join(', ');
    lines.push(
      `  + ${rule.pattern} -> ${rule.key}: ${collapses.length} page keys seen now would count as one${collapses.length ? ` (${shown}${collapses.length > 5 ? ', ...' : ''})` : ''}`
    );
  }
  lines.push(
    `Goals: ${plan.goals.add.length} new${plan.goals.existing.length ? `, ${plan.goals.existing.length} already there` : ''}.`
  );
  for (const goal of plan.goals.add)
    lines.push(`  + ${goal.kind} ${quote(goal.name)} -> ${goal.target}`);
  for (const problem of plan.problems) lines.push(`Problem: ${problem}`);
  return lines.join('\n');
}

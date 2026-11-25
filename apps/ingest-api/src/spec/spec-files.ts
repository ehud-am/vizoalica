import {
  emptySpec,
  parseSiteSpec,
  type Decision,
  type EntityKind,
  type GapMatch,
  type SiteSpec,
  type SpecResult
} from './site-spec.js';

/** The files of a spec folder, in the order they are written. */
export const SPEC_FILES = [
  'spec.json',
  'pages.json',
  'actions.json',
  'events.json',
  'groups.json',
  'campaigns.json',
  'funnels.json',
  'paths.json',
  'goals.json',
  'decisions.json'
] as const;
export const ONTOLOGY_FILE = 'ONTOLOGY.md';

const byId = <T extends { id: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** One file per entity type, entries sorted by id, so a git diff is line-based and stable. */
export function specToFiles(spec: SiteSpec): Record<string, string> {
  return {
    'spec.json': json(spec.meta),
    'pages.json': json(byId(spec.pages)),
    'actions.json': json(byId(spec.actions)),
    'events.json': json(byId(spec.events)),
    'groups.json': json(byId(spec.groups)),
    'campaigns.json': json(byId(spec.campaigns)),
    'funnels.json': json(byId(spec.funnels)),
    'paths.json': json({
      anchors: byId(spec.paths.anchors),
      collapse: [...spec.paths.collapse].sort((a, b) => (a.group < b.group ? -1 : 1))
    }),
    'goals.json': json(spec.goals),
    'decisions.json': json(byId(spec.decisions))
  };
}

/** Reads the files of a spec folder (only `spec.json` is required) and validates the whole. */
export function filesToSpec(files: Record<string, string | undefined>): SpecResult {
  const errors: string[] = [];
  const read = (name: string): unknown => {
    const source = files[name];
    if (source === undefined) return undefined;
    try {
      return JSON.parse(source);
    } catch {
      errors.push(`${name} is not valid JSON.`);
      return undefined;
    }
  };
  const meta = read('spec.json');
  if (meta === undefined && files['spec.json'] === undefined) errors.push('spec.json is missing.');
  const raw = {
    meta,
    pages: read('pages.json'),
    actions: read('actions.json'),
    events: read('events.json'),
    groups: read('groups.json'),
    campaigns: read('campaigns.json'),
    funnels: read('funnels.json'),
    paths: read('paths.json'),
    goals: read('goals.json'),
    decisions: read('decisions.json')
  };
  if (errors.length) return { ok: false, errors };
  const parsed = parseSiteSpec(raw);
  return parsed;
}

// ---------------------------------------------------------------- diff

export type SectionDiff = {
  section: string;
  added: string[];
  changed: string[];
  removed: string[];
};

function keyed(spec: SiteSpec, section: string): Map<string, unknown> {
  const map = new Map<string, unknown>();
  const add = (key: string, value: unknown) => map.set(key, value);
  switch (section) {
    case 'pages':
    case 'actions':
    case 'events':
    case 'groups':
    case 'campaigns':
    case 'funnels':
    case 'decisions':
      for (const item of spec[section] as Array<{ id: string }>) add(item.id, item);
      break;
    case 'goals':
      for (const item of spec.goals) add(`${item.kind}:${item.target}`, item);
      break;
    case 'paths':
      for (const item of spec.paths.anchors) add(`anchor:${item.id}`, item);
      for (const item of spec.paths.collapse) add(`collapse:${item.group}`, item);
      break;
  }
  return map;
}

/** What differs between two specs, per section, by entity id. */
export function diffSpecs(current: SiteSpec | undefined, next: SiteSpec): SectionDiff[] {
  const base = current ?? emptySpec();
  const out: SectionDiff[] = [];
  for (const section of [
    ...['pages', 'actions', 'events', 'groups', 'campaigns', 'funnels'],
    'paths',
    'goals',
    'decisions'
  ]) {
    const before = keyed(base, section);
    const after = keyed(next, section);
    const diff: SectionDiff = { section, added: [], changed: [], removed: [] };
    for (const [key, value] of after) {
      if (!before.has(key)) diff.added.push(key);
      else if (JSON.stringify(before.get(key)) !== JSON.stringify(value)) diff.changed.push(key);
    }
    for (const key of before.keys()) if (!after.has(key)) diff.removed.push(key);
    if (diff.added.length + diff.changed.length + diff.removed.length > 0) out.push(diff);
  }
  return out;
}

export function describeDiff(diffs: SectionDiff[]): string {
  if (diffs.length === 0) return 'No changes.';
  const show = (items: string[]) =>
    items.length > 8
      ? `${items.slice(0, 8).join(', ')} and ${items.length - 8} more`
      : items.join(', ');
  return diffs
    .map((diff) =>
      [
        `${diff.section}:`,
        ...(diff.added.length ? [`  + ${diff.added.length} added: ${show(diff.added)}`] : []),
        ...(diff.changed.length
          ? [`  ~ ${diff.changed.length} changed: ${show(diff.changed)}`]
          : []),
        ...(diff.removed.length
          ? [`  - ${diff.removed.length} removed: ${show(diff.removed)}`]
          : [])
      ].join('\n')
    )
    .join('\n');
}

// ---------------------------------------------------------------- markdown twin

const cell = (value: string | undefined): string =>
  (value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/**
 * The human-readable twin of a spec. Deterministic (sorted, no dates) so a stale copy is a plain
 * text comparison. Never edited by hand: the JSON files are the source.
 */
export function renderOntology(spec: SiteSpec): string {
  const lines: string[] = [];
  const title = spec.meta.website ?? 'website';
  lines.push(`# Site ontology: ${title}`, '');
  lines.push(
    '> Generated from the spec JSON files by `vizoalica spec render`. Do not edit; edit the JSON and render again.',
    ''
  );
  const facts = [
    spec.meta.environment ? `environment ${spec.meta.environment}` : '',
    spec.meta.project ? `project ${spec.meta.project}` : '',
    spec.meta.generatedFrom?.depthK ? `learned from ${spec.meta.generatedFrom.depthK}k events` : ''
  ].filter(Boolean);
  if (facts.length) lines.push(facts.join(' · '), '');
  const groupName = new Map(spec.groups.map((group) => [group.id, group.name]));
  const pageName = new Map(spec.pages.map((page) => [page.id, page.name]));
  const actionName = new Map(spec.actions.map((action) => [action.id, action.name]));
  const eventName = new Map(spec.events.map((event) => [event.id, event.name]));
  const flag = (item: { confidence?: string; status?: string }) =>
    [
      item.status === 'deprecated' ? 'deprecated' : '',
      item.confidence && item.confidence !== 'high' ? `${item.confidence} confidence` : ''
    ]
      .filter(Boolean)
      .join(', ');

  lines.push(`## Pages (${spec.pages.length})`, '');
  if (spec.pages.length) {
    const grouped = new Map<string, typeof spec.pages>();
    for (const page of byId(spec.pages)) {
      const name = page.group ? (groupName.get(page.group) ?? page.group) : 'Ungrouped';
      grouped.set(name, [...(grouped.get(name) ?? []), page]);
    }
    for (const name of [...grouped.keys()].sort()) {
      lines.push(
        `### ${name}`,
        '',
        '| Page | Match | Purpose | Notes |',
        '| --- | --- | --- | --- |'
      );
      for (const page of grouped.get(name)!)
        lines.push(
          `| ${cell(page.name)} (\`${page.id}\`) | ${page.match.map((m) => `\`${m}\``).join(', ')}${page.key ? ` → \`${page.key}\`` : ''} | ${cell(page.purpose)} | ${cell([page.type, flag(page)].filter(Boolean).join('; '))} |`
        );
      lines.push('');
    }
  } else lines.push('None yet.', '');

  lines.push(`## Actions (${spec.actions.length})`, '');
  if (spec.actions.length) {
    lines.push(
      '| Action | Page | Control label | Role | Landmark | Notes |',
      '| --- | --- | --- | --- | --- | --- |'
    );
    for (const action of byId(spec.actions))
      lines.push(
        `| ${cell(action.name)} (\`${action.id}\`) | ${action.page === '*' ? 'any' : cell(pageName.get(action.page) ?? action.page)} | ${cell(action.label)} | ${cell(action.role)} | ${cell(action.landmark)} | ${cell(flag(action))} |`
      );
    lines.push('');
  } else lines.push('None yet.', '');

  lines.push(`## Events (${spec.events.length})`, '');
  if (spec.events.length) {
    lines.push('| Event | Name | Description | Notes |', '| --- | --- | --- | --- |');
    for (const event of byId(spec.events))
      lines.push(
        `| \`${event.event}\` | ${cell(event.name)} | ${cell(event.description)} | ${cell(flag(event))} |`
      );
    lines.push('');
  } else lines.push('None yet.', '');

  lines.push(`## Campaigns (${spec.campaigns.length})`, '');
  if (spec.campaigns.length) {
    lines.push(
      '| Campaign | Channel | Source aliases | Medium aliases | Campaign aliases |',
      '| --- | --- | --- | --- | --- |'
    );
    for (const campaign of byId(spec.campaigns))
      lines.push(
        `| ${cell(campaign.name)} (\`${campaign.id}\`) | ${cell(campaign.channel)} | ${cell((campaign.aliases.utm_source ?? []).join(', '))} | ${cell((campaign.aliases.utm_medium ?? []).join(', '))} | ${cell((campaign.aliases.utm_campaign ?? []).join(', '))} |`
      );
    lines.push('');
  } else lines.push('None yet.', '');

  lines.push(`## Funnels (${spec.funnels.length})`, '');
  const stepName = (kind: EntityKind, ref: string) =>
    (kind === 'page' ? pageName : kind === 'action' ? actionName : eventName).get(ref) ?? ref;
  if (spec.funnels.length)
    for (const funnel of byId(spec.funnels)) {
      lines.push(
        `### ${funnel.name} (\`${funnel.id}\`)${funnel.within === 'day' ? ', across page loads in one day' : ''}`,
        ''
      );
      funnel.steps.forEach((step, at) =>
        lines.push(`${at + 1}. ${step.kind}: ${stepName(step.kind, step.ref)}`)
      );
      lines.push('');
    }
  else lines.push('None yet.', '');

  lines.push('## Paths', '');
  if (spec.paths.anchors.length || spec.paths.collapse.length) {
    for (const anchor of byId(spec.paths.anchors))
      lines.push(
        `- ${anchor.name ?? anchor.id}: ${anchor.start ? `starts at ${pageName.get(anchor.start) ?? anchor.start}` : ''}${anchor.start && anchor.end ? ', ' : ''}${anchor.end ? `ends at ${pageName.get(anchor.end) ?? anchor.end}` : ''}`
      );
    for (const item of spec.paths.collapse)
      lines.push(`- Collapse group: ${groupName.get(item.group) ?? item.group}`);
    lines.push('');
  } else lines.push('None yet.', '');

  lines.push(`## Goals (${spec.goals.length})`, '');
  if (spec.goals.length) {
    for (const goal of spec.goals) lines.push(`- ${goal.name}: ${goal.kind} \`${goal.target}\``);
    lines.push('');
  } else lines.push('None yet.', '');

  lines.push(`## Decisions (${spec.decisions.length})`, '');
  if (spec.decisions.length) {
    lines.push(
      '| Id | Type | Decision | About | Result | Reason |',
      '| --- | --- | --- | --- | --- | --- |'
    );
    for (const decision of byId(spec.decisions)) {
      const about =
        decision.type === 'gap'
          ? Object.entries(decision.match)
              .map(([key, value]) => `${key}=${value === '' ? '(empty)' : value}`)
              .join(', ')
          : `${decision.subject.kind} ${decision.subject.ref}`;
      const result = decision.type === 'gap' ? (decision.value ?? '') : decision.chosen;
      lines.push(
        `| \`${decision.id}\` | ${decision.type} | ${decision.decision} | ${cell(about)} | ${cell(result)} | ${cell(decision.reason)} |`
      );
    }
    lines.push('');
  } else lines.push('None yet.', '');
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}

// ---------------------------------------------------------------- decisions

const globMatch = (pattern: string, value: string): boolean => {
  if (pattern === '*') return true;
  if (!pattern.includes('*')) return pattern === value;
  const [head, tail] = pattern.split('*', 2) as [string, string];
  return (
    value.startsWith(head) && value.endsWith(tail) && value.length >= head.length + tail.length
  );
};

export type GapDescriptor = {
  page: string;
  role: string;
  landmark: string;
  name: string;
  index?: number;
};

/** The first gap decision whose selector matches the element, if any. */
export function findGapDecision(
  decisions: Decision[],
  gap: GapDescriptor
): Extract<Decision, { type: 'gap' }> | undefined {
  for (const decision of decisions) {
    if (decision.type !== 'gap') continue;
    const match: GapMatch = decision.match;
    if (match.page !== undefined && !globMatch(match.page, gap.page)) continue;
    if (match.role !== undefined && !globMatch(match.role, gap.role)) continue;
    if (match.landmark !== undefined && !globMatch(match.landmark, gap.landmark)) continue;
    if (match.name !== undefined && !globMatch(match.name, gap.name)) continue;
    if (match.index !== undefined && match.index !== gap.index) continue;
    return decision;
  }
  return undefined;
}

/** The decision recorded for a conflict about one entity, if any. */
export function findConflictDecision(
  decisions: Decision[],
  kind: EntityKind,
  ref: string
): Extract<Decision, { type: 'conflict' }> | undefined {
  for (const decision of decisions)
    if (
      decision.type === 'conflict' &&
      decision.subject.kind === kind &&
      decision.subject.ref === ref
    )
      return decision;
  return undefined;
}

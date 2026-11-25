import { MAX_RULE_LENGTH } from '../ingestion/grouping-rules.js';

/**
 * The site spec ("ontology") of one website: names and structure for its pages, actions, events,
 * campaigns, funnels and paths, plus the operator's decisions about gaps and conflicts. It is
 * configuration, never visitor data: values that look like personal data are refused.
 */

export const SPEC_VERSION = 1;
export const MAX_SPEC_BYTES = 256 * 1024;

export const LIMITS = {
  pages: 500,
  actions: 500,
  events: 200,
  groups: 50,
  campaigns: 100,
  funnels: 20,
  funnelSteps: 10,
  anchors: 20,
  collapse: 20,
  goals: 20,
  decisions: 500,
  matches: 5
} as const;

export type Confidence = 'high' | 'medium' | 'low';
export type Status = 'active' | 'deprecated';
export type EntityKind = 'page' | 'action' | 'event';

type Common = { confidence?: Confidence; evidence?: string; status?: Status };

export type SpecPage = Common & {
  id: string;
  match: string[];
  key?: string;
  name: string;
  group?: string;
  purpose?: string;
  type?: string;
};
export type SpecAction = Common & {
  id: string;
  page: string;
  label: string;
  name: string;
  role?: string;
  landmark?: string;
  group?: string;
};
export type SpecEvent = Common & {
  id: string;
  event: string;
  name: string;
  description?: string;
  group?: string;
};
export type SpecGroup = { id: string; name: string; kind?: EntityKind | 'any' };
export type SpecCampaign = {
  id: string;
  name: string;
  channel?: string;
  aliases: { utm_source?: string[]; utm_medium?: string[]; utm_campaign?: string[] };
};
export type FunnelStep = { kind: EntityKind; ref: string };
export type SpecFunnel = {
  id: string;
  name: string;
  steps: FunnelStep[];
  within: 'session' | 'day';
};
export type SpecPaths = {
  anchors: Array<{ id: string; name?: string; start?: string; end?: string }>;
  collapse: Array<{ group: string }>;
};
export type SpecGoal = { name: string; kind: EntityKind; target: string };
export type GapMatch = {
  page?: string;
  role?: string;
  landmark?: string;
  name?: string;
  index?: number;
};
export type Decision =
  | {
      id: string;
      type: 'gap';
      decision: 'label' | 'accept' | 'ignore';
      match: GapMatch;
      value?: string;
      reason?: string;
      decided?: string;
      'review-after'?: string;
    }
  | {
      id: string;
      type: 'conflict';
      decision: 'option' | 'custom';
      subject: { kind: EntityKind; ref: string };
      options?: string[];
      chosen: string;
      reason?: string;
      decided?: string;
      'review-after'?: string;
    };

export type SpecMeta = {
  version: 1;
  store?: 'git' | 'backend';
  environment?: string;
  project?: string;
  website?: string;
  generatedFrom?: { depthK?: number; start?: string; end?: string };
};

export type SiteSpec = {
  meta: SpecMeta;
  pages: SpecPage[];
  actions: SpecAction[];
  events: SpecEvent[];
  groups: SpecGroup[];
  campaigns: SpecCampaign[];
  funnels: SpecFunnel[];
  paths: SpecPaths;
  goals: SpecGoal[];
  decisions: Decision[];
};

export const SECTIONS = [
  'pages',
  'actions',
  'events',
  'groups',
  'campaigns',
  'funnels',
  'goals',
  'decisions'
] as const;

export function emptySpec(meta: Partial<SpecMeta> = {}): SiteSpec {
  return {
    meta: { version: SPEC_VERSION, ...meta },
    pages: [],
    actions: [],
    events: [],
    groups: [],
    campaigns: [],
    funnels: [],
    paths: { anchors: [], collapse: [] },
    goals: [],
    decisions: []
  };
}

// ---------------------------------------------------------------- personal data

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const IPV4 = /(?:^|[^\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d])/;
// Compressed (contains "::") or full (eight groups) IPv6 forms; a clock time such as 10:30 is not one.
const IPV6 =
  /(?:^|[^\w:])(?:(?:[0-9a-f]{1,4}:){1,7}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?|(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|::[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})(?![\w:])/i;
const LONG_DIGITS = /\d(?:[\s().-]?\d){6,}/;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Whether a text looks like personal data: an email, an IP address, or a phone-like number. */
export function looksPersonal(value: string): string | undefined {
  if (EMAIL.test(value)) return 'an email address';
  if (IPV4.test(value) || IPV6.test(value)) return 'an IP address';
  if (LONG_DIGITS.test(value)) return 'a long number';
  return undefined;
}

// ---------------------------------------------------------------- validation

export type SpecResult = { ok: true; spec: SiteSpec } | { ok: false; errors: string[] };

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ROLE = /^[a-z][a-z-]{0,40}$/;
const SCHEMA_TYPE = /^[A-Z][A-Za-z]{0,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_NAME = /^[a-z][a-z0-9_]{0,63}$/;
// The same plain path characters the grouping rules allow, no expressions.
const PATTERN = /^\/[A-Za-z0-9_.~:@%+\-*/]*$/;
const KEY = /^\/[^?#\u0000-\u001F\u007F]*$/;
const CONFIDENCE = new Set(['high', 'medium', 'low']);
const STATUS = new Set(['active', 'deprecated']);
const KINDS = new Set(['page', 'action', 'event']);

type Ctx = { errors: string[] };
type Obj = Record<string, unknown>;

const isObject = (value: unknown): value is Obj =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function strictKeys(ctx: Ctx, where: string, value: Obj, allowed: readonly string[]): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) ctx.errors.push(`${where}: unknown field "${key}".`);
}

function text(
  ctx: Ctx,
  where: string,
  field: string,
  value: unknown,
  max: number,
  required = true
): string | undefined {
  if (value === undefined) {
    if (required) ctx.errors.push(`${where}: "${field}" is required.`);
    return undefined;
  }
  if (typeof value !== 'string' || !value.trim() || value.length > max || CONTROL.test(value)) {
    ctx.errors.push(`${where}: "${field}" must be text of 1 to ${max} characters.`);
    return undefined;
  }
  const personal = looksPersonal(value);
  if (personal) {
    ctx.errors.push(
      `${where}: "${field}" looks like it holds ${personal}; personal data is not allowed in a spec.`
    );
    return undefined;
  }
  return value;
}

function id(ctx: Ctx, where: string, value: unknown, seen: Set<string>): string | undefined {
  if (typeof value !== 'string' || !ID.test(value)) {
    ctx.errors.push(`${where}: "id" must be lowercase letters, digits and hyphens (at most 64).`);
    return undefined;
  }
  if (seen.has(value)) {
    ctx.errors.push(`${where}: id "${value}" is used twice.`);
    return undefined;
  }
  seen.add(value);
  return value;
}

function common(ctx: Ctx, where: string, entry: Obj): Common {
  const out: Common = {};
  if (entry.confidence !== undefined) {
    if (typeof entry.confidence === 'string' && CONFIDENCE.has(entry.confidence))
      out.confidence = entry.confidence as Confidence;
    else ctx.errors.push(`${where}: "confidence" must be high, medium or low.`);
  }
  if (entry.status !== undefined) {
    if (typeof entry.status === 'string' && STATUS.has(entry.status))
      out.status = entry.status as Status;
    else ctx.errors.push(`${where}: "status" must be active or deprecated.`);
  }
  const evidence = text(ctx, where, 'evidence', entry.evidence, 200, false);
  if (evidence) out.evidence = evidence;
  return out;
}

function list(ctx: Ctx, section: string, value: unknown, max: number): Obj[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    ctx.errors.push(`${section}: must be a list.`);
    return [];
  }
  if (value.length > max) {
    ctx.errors.push(`${section}: at most ${max} entries (found ${value.length}).`);
    return [];
  }
  const out: Obj[] = [];
  for (const [index, entry] of value.entries()) {
    if (isObject(entry)) out.push(entry);
    else ctx.errors.push(`${section}[${index}]: must be an object.`);
  }
  return out;
}

function matchPatterns(ctx: Ctx, where: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > LIMITS.matches) {
    ctx.errors.push(`${where}: "match" must list 1 to ${LIMITS.matches} path patterns.`);
    return [];
  }
  const out: string[] = [];
  for (const pattern of value) {
    if (
      typeof pattern !== 'string' ||
      pattern.length > MAX_RULE_LENGTH ||
      !PATTERN.test(pattern) ||
      (pattern !== '/' && (pattern.endsWith('/') || pattern.includes('//')))
    ) {
      ctx.errors.push(`${where}: "${String(pattern)}" is not a valid path pattern.`);
      continue;
    }
    const personal = looksPersonal(pattern);
    if (personal) {
      ctx.errors.push(
        `${where}: a path pattern looks like it holds ${personal}; personal data is not allowed in a spec.`
      );
      continue;
    }
    const segments = pattern.split('/').slice(1);
    if (
      segments.some(
        (segment, at) =>
          segment.includes('*') &&
          !(segment === '*' || (segment === '**' && at === segments.length - 1))
      )
    )
      ctx.errors.push(`${where}: "${pattern}" uses a wildcard that is not a whole segment.`);
    else out.push(pattern);
  }
  return out;
}

const PAGE_FIELDS = [
  'id',
  'match',
  'key',
  'name',
  'group',
  'purpose',
  'type',
  'confidence',
  'evidence',
  'status'
];
const ACTION_FIELDS = [
  'id',
  'page',
  'label',
  'name',
  'role',
  'landmark',
  'group',
  'confidence',
  'evidence',
  'status'
];
const EVENT_FIELDS = [
  'id',
  'event',
  'name',
  'description',
  'group',
  'confidence',
  'evidence',
  'status'
];

/**
 * Validates a whole spec (the merged form of the spec files). Every problem is listed with its
 * position; references (groups, pages, actions, events) must exist. Personal data is refused.
 */
export function parseSiteSpec(raw: unknown): SpecResult {
  const ctx: Ctx = { errors: [] };
  if (!isObject(raw)) return { ok: false, errors: ['The spec must be one JSON object.'] };
  strictKeys(ctx, 'spec', raw, [
    'meta',
    'pages',
    'actions',
    'events',
    'groups',
    'campaigns',
    'funnels',
    'paths',
    'goals',
    'decisions'
  ]);
  const spec = emptySpec();

  // meta
  const meta = raw.meta;
  if (!isObject(meta) || meta.version !== SPEC_VERSION)
    ctx.errors.push('meta: "version" must be 1.');
  else {
    strictKeys(ctx, 'meta', meta, [
      'version',
      'store',
      'environment',
      'project',
      'website',
      'generatedFrom'
    ]);
    if (meta.store !== undefined) {
      if (meta.store === 'git' || meta.store === 'backend') spec.meta.store = meta.store;
      else ctx.errors.push('meta: "store" must be git or backend.');
    }
    for (const field of ['environment', 'project', 'website'] as const) {
      const value = text(ctx, 'meta', field, meta[field], 200, false);
      if (value) spec.meta[field] = value;
    }
    if (isObject(meta.generatedFrom)) {
      const from = meta.generatedFrom;
      strictKeys(ctx, 'meta.generatedFrom', from, ['depthK', 'start', 'end']);
      const out: NonNullable<SpecMeta['generatedFrom']> = {};
      if (typeof from.depthK === 'number' && Number.isInteger(from.depthK) && from.depthK > 0)
        out.depthK = from.depthK;
      for (const field of ['start', 'end'] as const)
        if (typeof from[field] === 'string' && DATE.test(from[field] as string))
          out[field] = from[field] as string;
      spec.meta.generatedFrom = out;
    }
  }

  // groups first: other sections refer to them
  const groupIds = new Set<string>();
  for (const [index, entry] of list(ctx, 'groups', raw.groups, LIMITS.groups).entries()) {
    const where = `groups[${index}]`;
    strictKeys(ctx, where, entry, ['id', 'name', 'kind']);
    const gid = id(ctx, where, entry.id, groupIds);
    const name = text(ctx, where, 'name', entry.name, 60);
    let kind: SpecGroup['kind'];
    if (entry.kind !== undefined) {
      if (entry.kind === 'any' || (typeof entry.kind === 'string' && KINDS.has(entry.kind)))
        kind = entry.kind as SpecGroup['kind'];
      else ctx.errors.push(`${where}: "kind" must be page, action, event or any.`);
    }
    if (gid && name) spec.groups.push({ id: gid, name, ...(kind ? { kind } : {}) });
  }
  const groupRef = (where: string, value: unknown): string | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === 'string' && groupIds.has(value)) return value;
    ctx.errors.push(`${where}: group "${String(value)}" is not defined in groups.`);
    return undefined;
  };

  const pageIds = new Set<string>();
  for (const [index, entry] of list(ctx, 'pages', raw.pages, LIMITS.pages).entries()) {
    const where = `pages[${index}]`;
    strictKeys(ctx, where, entry, PAGE_FIELDS);
    const pid = id(ctx, where, entry.id, pageIds);
    const name = text(ctx, where, 'name', entry.name, 80);
    const match = matchPatterns(ctx, where, entry.match);
    const page: SpecPage = { id: pid ?? '', match, name: name ?? '' };
    if (entry.key !== undefined) {
      if (
        typeof entry.key === 'string' &&
        entry.key.length <= 200 &&
        KEY.test(entry.key) &&
        !looksPersonal(entry.key)
      )
        page.key = entry.key;
      else ctx.errors.push(`${where}: "key" must be a page key starting with "/".`);
    }
    const group = groupRef(where, entry.group);
    if (group) page.group = group;
    const purpose = text(ctx, where, 'purpose', entry.purpose, 200, false);
    if (purpose) page.purpose = purpose;
    if (entry.type !== undefined) {
      if (typeof entry.type === 'string' && SCHEMA_TYPE.test(entry.type)) page.type = entry.type;
      else
        ctx.errors.push(`${where}: "type" must be a schema.org type name such as CollectionPage.`);
    }
    Object.assign(page, common(ctx, where, entry));
    if (pid && name) spec.pages.push(page);
  }
  const pageRef = (where: string, value: unknown): string | undefined => {
    if (value === '*') return '*';
    if (typeof value === 'string' && pageIds.has(value)) return value;
    ctx.errors.push(`${where}: page "${String(value)}" is not defined in pages.`);
    return undefined;
  };

  const actionIds = new Set<string>();
  for (const [index, entry] of list(ctx, 'actions', raw.actions, LIMITS.actions).entries()) {
    const where = `actions[${index}]`;
    strictKeys(ctx, where, entry, ACTION_FIELDS);
    const aid = id(ctx, where, entry.id, actionIds);
    const page = pageRef(where, entry.page);
    const label = text(ctx, where, 'label', entry.label, 80);
    const name = text(ctx, where, 'name', entry.name, 80);
    const action: SpecAction = {
      id: aid ?? '',
      page: page ?? '',
      label: label ?? '',
      name: name ?? ''
    };
    if (entry.role !== undefined) {
      if (typeof entry.role === 'string' && ROLE.test(entry.role)) action.role = entry.role;
      else ctx.errors.push(`${where}: "role" must be a lowercase ARIA role name.`);
    }
    const landmark = text(ctx, where, 'landmark', entry.landmark, 60, false);
    if (landmark) action.landmark = landmark;
    const group = groupRef(where, entry.group);
    if (group) action.group = group;
    Object.assign(action, common(ctx, where, entry));
    if (aid && page && label && name) spec.actions.push(action);
  }

  const eventIds = new Set<string>();
  const eventNames = new Set<string>();
  for (const [index, entry] of list(ctx, 'events', raw.events, LIMITS.events).entries()) {
    const where = `events[${index}]`;
    strictKeys(ctx, where, entry, EVENT_FIELDS);
    const eid = id(ctx, where, entry.id, eventIds);
    let eventName: string | undefined;
    if (typeof entry.event === 'string' && EVENT_NAME.test(entry.event)) {
      eventName = entry.event;
      if (eventNames.has(eventName))
        ctx.errors.push(`${where}: event "${eventName}" is used twice.`);
      eventNames.add(eventName);
    } else ctx.errors.push(`${where}: "event" must be a lowercase event name with underscores.`);
    const name = text(ctx, where, 'name', entry.name, 80);
    const event: SpecEvent = { id: eid ?? '', event: eventName ?? '', name: name ?? '' };
    const description = text(ctx, where, 'description', entry.description, 200, false);
    if (description) event.description = description;
    const group = groupRef(where, entry.group);
    if (group) event.group = group;
    Object.assign(event, common(ctx, where, entry));
    if (eid && eventName && name) spec.events.push(event);
  }

  const campaignIds = new Set<string>();
  for (const [index, entry] of list(ctx, 'campaigns', raw.campaigns, LIMITS.campaigns).entries()) {
    const where = `campaigns[${index}]`;
    strictKeys(ctx, where, entry, ['id', 'name', 'channel', 'aliases']);
    const cid = id(ctx, where, entry.id, campaignIds);
    const name = text(ctx, where, 'name', entry.name, 80);
    const campaign: SpecCampaign = { id: cid ?? '', name: name ?? '', aliases: {} };
    const channel = text(ctx, where, 'channel', entry.channel, 40, false);
    if (channel) campaign.channel = channel;
    if (!isObject(entry.aliases)) ctx.errors.push(`${where}: "aliases" must be an object.`);
    else {
      strictKeys(ctx, `${where}.aliases`, entry.aliases, [
        'utm_source',
        'utm_medium',
        'utm_campaign'
      ]);
      for (const field of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
        const values = entry.aliases[field];
        if (values === undefined) continue;
        if (!Array.isArray(values) || values.length > 20) {
          ctx.errors.push(`${where}: aliases.${field} must be a list of at most 20 labels.`);
          continue;
        }
        const clean = values
          .map((value) => text(ctx, where, `aliases.${field}`, value, 64))
          .filter((value): value is string => value !== undefined);
        campaign.aliases[field] = clean;
      }
    }
    if (cid && name) spec.campaigns.push(campaign);
  }

  const known: Record<EntityKind, Set<string>> = {
    page: pageIds,
    action: actionIds,
    event: eventIds
  };
  const funnelIds = new Set<string>();
  for (const [index, entry] of list(ctx, 'funnels', raw.funnels, LIMITS.funnels).entries()) {
    const where = `funnels[${index}]`;
    strictKeys(ctx, where, entry, ['id', 'name', 'steps', 'within']);
    const fid = id(ctx, where, entry.id, funnelIds);
    const name = text(ctx, where, 'name', entry.name, 80);
    if (entry.within !== undefined && entry.within !== 'session' && entry.within !== 'day')
      ctx.errors.push(`${where}: "within" must be "session" or "day".`);
    const steps: FunnelStep[] = [];
    if (
      !Array.isArray(entry.steps) ||
      entry.steps.length < 2 ||
      entry.steps.length > LIMITS.funnelSteps
    )
      ctx.errors.push(`${where}: "steps" must list 2 to ${LIMITS.funnelSteps} steps.`);
    else
      for (const [at, step] of entry.steps.entries()) {
        if (
          !isObject(step) ||
          typeof step.kind !== 'string' ||
          !KINDS.has(step.kind) ||
          typeof step.ref !== 'string'
        ) {
          ctx.errors.push(`${where}.steps[${at}]: needs "kind" (page, action or event) and "ref".`);
          continue;
        }
        strictKeys(ctx, `${where}.steps[${at}]`, step, ['kind', 'ref']);
        const kind = step.kind as EntityKind;
        if (!known[kind].has(step.ref))
          ctx.errors.push(`${where}.steps[${at}]: ${kind} "${step.ref}" is not defined.`);
        else steps.push({ kind, ref: step.ref });
      }
    if (fid && name && steps.length >= 2)
      spec.funnels.push({
        id: fid,
        name,
        steps,
        within: entry.within === 'day' ? 'day' : 'session'
      });
  }

  if (raw.paths !== undefined) {
    if (!isObject(raw.paths)) ctx.errors.push('paths: must be an object.');
    else {
      strictKeys(ctx, 'paths', raw.paths, ['anchors', 'collapse']);
      const anchorIds = new Set<string>();
      for (const [index, entry] of list(
        ctx,
        'paths.anchors',
        raw.paths.anchors,
        LIMITS.anchors
      ).entries()) {
        const where = `paths.anchors[${index}]`;
        strictKeys(ctx, where, entry, ['id', 'name', 'start', 'end']);
        const aid = id(ctx, where, entry.id, anchorIds);
        const anchor: SpecPaths['anchors'][number] = { id: aid ?? '' };
        const name = text(ctx, where, 'name', entry.name, 80, false);
        if (name) anchor.name = name;
        for (const field of ['start', 'end'] as const) {
          if (entry[field] === undefined) continue;
          if (typeof entry[field] === 'string' && pageIds.has(entry[field] as string))
            anchor[field] = entry[field] as string;
          else ctx.errors.push(`${where}: "${field}" must be a page id defined in pages.`);
        }
        if (!anchor.start && !anchor.end) ctx.errors.push(`${where}: needs "start" or "end".`);
        if (aid) spec.paths.anchors.push(anchor);
      }
      for (const [index, entry] of list(
        ctx,
        'paths.collapse',
        raw.paths.collapse,
        LIMITS.collapse
      ).entries()) {
        const where = `paths.collapse[${index}]`;
        strictKeys(ctx, where, entry, ['group']);
        const group = groupRef(where, entry.group);
        if (group) spec.paths.collapse.push({ group });
      }
    }
  }

  for (const [index, entry] of list(ctx, 'goals', raw.goals, LIMITS.goals).entries()) {
    const where = `goals[${index}]`;
    strictKeys(ctx, where, entry, ['name', 'kind', 'target']);
    const name = text(ctx, where, 'name', entry.name, 80);
    const target = text(ctx, where, 'target', entry.target, 200);
    if (typeof entry.kind !== 'string' || !KINDS.has(entry.kind))
      ctx.errors.push(`${where}: "kind" must be page, action or event.`);
    else if (name && target) spec.goals.push({ name, kind: entry.kind as EntityKind, target });
  }

  const decisionIds = new Set<string>();
  for (const [index, entry] of list(ctx, 'decisions', raw.decisions, LIMITS.decisions).entries()) {
    const where = `decisions[${index}]`;
    const did = id(ctx, where, entry.id, decisionIds);
    const reason = text(ctx, where, 'reason', entry.reason, 200, false);
    const decided = entry.decided === undefined ? undefined : String(entry.decided);
    if (decided !== undefined && !DATE.test(decided))
      ctx.errors.push(`${where}: "decided" must be YYYY-MM-DD.`);
    const review = entry['review-after'] === undefined ? undefined : String(entry['review-after']);
    if (review !== undefined && !DATE.test(review))
      ctx.errors.push(`${where}: "review-after" must be YYYY-MM-DD.`);
    const tail = {
      ...(reason ? { reason } : {}),
      ...(decided ? { decided } : {}),
      ...(review ? { 'review-after': review } : {})
    };
    if (entry.type === 'gap') {
      strictKeys(ctx, where, entry, [
        'id',
        'type',
        'decision',
        'match',
        'value',
        'reason',
        'decided',
        'review-after'
      ]);
      if (
        entry.decision !== 'label' &&
        entry.decision !== 'accept' &&
        entry.decision !== 'ignore'
      ) {
        ctx.errors.push(`${where}: "decision" must be label, accept or ignore.`);
        continue;
      }
      if (!isObject(entry.match)) {
        ctx.errors.push(`${where}: "match" must be an object.`);
        continue;
      }
      strictKeys(ctx, `${where}.match`, entry.match, ['page', 'role', 'landmark', 'name', 'index']);
      const match: GapMatch = {};
      for (const field of ['page', 'role', 'landmark', 'name'] as const) {
        const value = entry.match[field];
        if (value === undefined) continue;
        if (value === '' && field === 'name') match.name = '';
        else {
          const clean = text(ctx, `${where}.match`, field, value, 80);
          if (clean) match[field] = clean;
        }
      }
      if (entry.match.index !== undefined) {
        if (Number.isInteger(entry.match.index) && (entry.match.index as number) >= 0)
          match.index = entry.match.index as number;
        else ctx.errors.push(`${where}.match: "index" must be a whole number.`);
      }
      if (Object.keys(match).length === 0) ctx.errors.push(`${where}: "match" is empty.`);
      let value: string | undefined;
      if (entry.decision === 'label') {
        value = text(ctx, where, 'value', entry.value, 80);
      } else if (entry.value !== undefined)
        ctx.errors.push(`${where}: "value" is only for label decisions.`);
      if (did)
        spec.decisions.push({
          id: did,
          type: 'gap',
          decision: entry.decision,
          match,
          ...(value ? { value } : {}),
          ...tail
        });
    } else if (entry.type === 'conflict') {
      strictKeys(ctx, where, entry, [
        'id',
        'type',
        'decision',
        'subject',
        'options',
        'chosen',
        'reason',
        'decided',
        'review-after'
      ]);
      if (entry.decision !== 'option' && entry.decision !== 'custom') {
        ctx.errors.push(`${where}: "decision" must be option or custom.`);
        continue;
      }
      const subject = entry.subject;
      if (
        !isObject(subject) ||
        typeof subject.kind !== 'string' ||
        !KINDS.has(subject.kind) ||
        typeof subject.ref !== 'string' ||
        subject.ref.length > 200 ||
        looksPersonal(subject.ref)
      ) {
        ctx.errors.push(
          `${where}: "subject" needs "kind" and a "ref" of at most 200 characters without personal data.`
        );
        continue;
      }
      const chosen = text(ctx, where, 'chosen', entry.chosen, 200);
      let options: string[] | undefined;
      if (entry.options !== undefined) {
        if (!Array.isArray(entry.options) || entry.options.length < 2 || entry.options.length > 5)
          ctx.errors.push(`${where}: "options" must list 2 to 5 options.`);
        else
          options = entry.options
            .map((option) => text(ctx, where, 'options', option, 200))
            .filter((option): option is string => option !== undefined);
      }
      if (entry.decision === 'option' && chosen && options && !options.includes(chosen))
        ctx.errors.push(`${where}: "chosen" must be one of "options".`);
      if (did && chosen)
        spec.decisions.push({
          id: did,
          type: 'conflict',
          decision: entry.decision,
          subject: { kind: subject.kind as EntityKind, ref: subject.ref },
          ...(options ? { options } : {}),
          chosen,
          ...tail
        });
    } else ctx.errors.push(`${where}: "type" must be gap or conflict.`);
  }

  if (ctx.errors.length === 0 && JSON.stringify(spec).length > MAX_SPEC_BYTES)
    ctx.errors.push(`The spec is larger than ${MAX_SPEC_BYTES / 1024} KB.`);
  return ctx.errors.length ? { ok: false, errors: ctx.errors } : { ok: true, spec };
}

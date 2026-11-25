import type { CloudEvent } from '@vizoalica/event-contracts';

/**
 * A bounded summary of raw events, built for learning a site's structure. It holds counts of
 * pages, labels, actions, events, transitions and short journeys; session and visitor ids are
 * used to order events and are never kept. Sketches of different slices merge by adding counts.
 */
export type PageStruct = {
  samples: number;
  titles: Record<string, number>;
  headings: Record<string, number>;
  landmarks: Record<string, number>;
  controls: Record<string, number>;
  forms: Record<string, number>;
  a11y: { controls: number; unlabeled: number; imagesWithoutAlt: number };
};

export type Sketch = {
  v: 1;
  events: number;
  sessions: number;
  days: string[];
  pages: Record<string, number>;
  structure: Record<string, PageStruct>;
  actions: Record<string, number>;
  customEvents: Record<string, { count: number; pages: Record<string, number> }>;
  referrers: Record<string, number>;
  campaigns: Record<string, number>;
  transitions: Record<string, number>;
  journeys: Record<string, number>;
};

export const SEP = '\u0001';
export const STEP = '\u0002';
const MAX_JOURNEY_STEPS = 12;
export const CAPS = {
  pages: 500,
  structurePages: 300,
  perPage: 40,
  actions: 500,
  events: 200,
  referrers: 50,
  campaigns: 100,
  transitions: 500,
  journeys: 500
} as const;

export function emptySketch(): Sketch {
  return {
    v: 1,
    events: 0,
    sessions: 0,
    days: [],
    pages: {},
    structure: {},
    actions: {},
    customEvents: {},
    referrers: {},
    campaigns: {},
    transitions: {},
    journeys: {}
  };
}

const bump = (map: Record<string, number>, key: string, by = 1): void => {
  map[key] = (map[key] ?? 0) + by;
};

type Data = Record<string, any>;

/** Builds a sketch from raw events (as stored: CloudEvents). */
export function sketchEvents(events: CloudEvent[]): Sketch {
  const sketch = emptySketch();
  const days = new Set<string>();
  const bySession = new Map<string, Array<{ time: number; token: string; page?: string }>>();
  for (const event of events) {
    sketch.events += 1;
    const data = event.data as Data;
    const time = Date.parse(event.time);
    if (Number.isFinite(time)) days.add(new Date(time).toISOString().slice(0, 10));
    const session = String(data.session?.id ?? '');
    const push = (token: string, page?: string) => {
      if (!session) return;
      const list = bySession.get(session) ?? [];
      list.push({ time: Number.isFinite(time) ? time : 0, token, ...(page ? { page } : {}) });
      bySession.set(session, list);
    };
    if (event.type === 'com.vizoalica.page_view.v1') {
      const key = String(data.page?.url_path ?? '');
      if (!key) continue;
      bump(sketch.pages, key);
      push(`p:${key}`, key);
      const referrer = data.referrer?.origin;
      if (typeof referrer === 'string') bump(sketch.referrers, referrer);
      const campaign = data.campaign;
      if (campaign)
        bump(sketch.campaigns, [campaign.source ?? '', campaign.medium ?? '', campaign.campaign ?? ''].join(SEP));
    } else if (event.type === 'com.vizoalica.action.v1') {
      if (data.action?.rage) continue;
      const page = String(data.page?.url_path ?? '');
      const name = String(data.action?.name ?? '');
      bump(sketch.actions, [page, name, data.action?.kind ?? 'other'].join(SEP));
      push(`a:${page}${SEP}${name}`);
    } else if (event.type === 'com.vizoalica.custom_event.v1') {
      const name = String(data.name ?? '');
      if (!name) continue;
      const entry = (sketch.customEvents[name] ??= { count: 0, pages: {} });
      entry.count += 1;
      if (data.page?.url_path) bump(entry.pages, String(data.page.url_path));
      push(`e:${name}`);
    } else if (event.type === 'com.vizoalica.page_structure.v1') {
      const key = String(data.page?.url_path ?? '');
      if (!key) continue;
      const s = (sketch.structure[key] ??= {
        samples: 0,
        titles: {},
        headings: {},
        landmarks: {},
        controls: {},
        forms: {},
        a11y: { controls: 0, unlabeled: 0, imagesWithoutAlt: 0 }
      });
      const structure = data.structure ?? {};
      s.samples += 1;
      if (structure.title) bump(s.titles, String(structure.title));
      for (const heading of structure.headings ?? []) bump(s.headings, `${heading.level}${SEP}${heading.text}`);
      for (const landmark of structure.landmarks ?? []) bump(s.landmarks, `${landmark.role}${SEP}${landmark.label ?? ''}`);
      for (const control of structure.controls ?? [])
        bump(s.controls, [control.role, control.landmark ?? '', control.name ?? ''].join(SEP));
      for (const form of structure.forms ?? [])
        for (const field of form.fields ?? [])
          bump(s.forms, [form.name ?? '', field.type, field.label ?? ''].join(SEP));
      s.a11y.controls += structure.a11y?.controls ?? 0;
      s.a11y.unlabeled += structure.a11y?.unlabeledControls ?? 0;
      s.a11y.imagesWithoutAlt += structure.a11y?.imagesWithoutAlt ?? 0;
    }
  }
  for (const steps of bySession.values()) {
    steps.sort((a, b) => a.time - b.time);
    const tokens: string[] = [];
    let lastPage: string | undefined;
    for (const step of steps) {
      if (tokens[tokens.length - 1] === step.token) continue;
      tokens.push(step.token);
      if (step.page !== undefined) {
        if (lastPage !== undefined && lastPage !== step.page) bump(sketch.transitions, `${lastPage}${SEP}${step.page}`);
        lastPage = step.page;
      }
    }
    sketch.sessions += 1;
    if (tokens.length > 0) bump(sketch.journeys, tokens.slice(0, MAX_JOURNEY_STEPS).join(STEP));
  }
  sketch.days = [...days].sort();
  return trimSketch(sketch);
}

const top = <T>(map: Record<string, T>, cap: number, weight: (value: T) => number): Record<string, T> =>
  Object.fromEntries(
    Object.entries(map)
      .sort((a, b) => weight(b[1]) - weight(a[1]) || (a[0] < b[0] ? -1 : 1))
      .slice(0, cap)
  );

/** Keeps the most frequent entries of every map, so a sketch stays small however long the run. */
export function trimSketch(sketch: Sketch): Sketch {
  const structure = top(sketch.structure, CAPS.structurePages, (s) => s.samples);
  for (const s of Object.values(structure)) {
    s.titles = top(s.titles, 10, (n) => n);
    s.headings = top(s.headings, CAPS.perPage, (n) => n);
    s.landmarks = top(s.landmarks, CAPS.perPage, (n) => n);
    s.controls = top(s.controls, CAPS.perPage * 2, (n) => n);
    s.forms = top(s.forms, CAPS.perPage, (n) => n);
  }
  return {
    ...sketch,
    pages: top(sketch.pages, CAPS.pages, (n) => n),
    structure,
    actions: top(sketch.actions, CAPS.actions, (n) => n),
    customEvents: top(sketch.customEvents, CAPS.events, (e) => e.count),
    referrers: top(sketch.referrers, CAPS.referrers, (n) => n),
    campaigns: top(sketch.campaigns, CAPS.campaigns, (n) => n),
    transitions: top(sketch.transitions, CAPS.transitions, (n) => n),
    journeys: top(sketch.journeys, CAPS.journeys, (n) => n)
  };
}

const addMaps = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) bump(out, key, value);
  return out;
};

export function mergeSketches(a: Sketch, b: Sketch): Sketch {
  const structure: Record<string, PageStruct> = { ...a.structure };
  for (const [key, s] of Object.entries(b.structure)) {
    const mine = structure[key];
    structure[key] = mine
      ? {
          samples: mine.samples + s.samples,
          titles: addMaps(mine.titles, s.titles),
          headings: addMaps(mine.headings, s.headings),
          landmarks: addMaps(mine.landmarks, s.landmarks),
          controls: addMaps(mine.controls, s.controls),
          forms: addMaps(mine.forms, s.forms),
          a11y: {
            controls: mine.a11y.controls + s.a11y.controls,
            unlabeled: mine.a11y.unlabeled + s.a11y.unlabeled,
            imagesWithoutAlt: mine.a11y.imagesWithoutAlt + s.a11y.imagesWithoutAlt
          }
        }
      : s;
  }
  const customEvents = { ...a.customEvents };
  for (const [name, entry] of Object.entries(b.customEvents)) {
    const mine = customEvents[name];
    customEvents[name] = mine
      ? { count: mine.count + entry.count, pages: addMaps(mine.pages, entry.pages) }
      : entry;
  }
  return trimSketch({
    v: 1,
    events: a.events + b.events,
    sessions: a.sessions + b.sessions,
    days: [...new Set([...a.days, ...b.days])].sort(),
    pages: addMaps(a.pages, b.pages),
    structure,
    actions: addMaps(a.actions, b.actions),
    customEvents,
    referrers: addMaps(a.referrers, b.referrers),
    campaigns: addMaps(a.campaigns, b.campaigns),
    transitions: addMaps(a.transitions, b.transitions),
    journeys: addMaps(a.journeys, b.journeys)
  });
}

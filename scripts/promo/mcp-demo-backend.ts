/**
 * A local Vizoalica backend for the MCP demo video: the real Worker code and schema on an in-memory
 * SQLite D1, served over HTTP on 127.0.0.1, with 30 days of fictional, deterministic traffic for a
 * made-up organization (Paperkite, on reserved `.example` domains). No network, no Cloudflare
 * account, no real website. Also writes a throwaway HOME whose ~/.config/vizoalica/environments.json
 * names this backend as the environment `demo`, so `vizoalica mcp` can be pointed at it.
 *
 * The story in the data, relative to the day it runs (day 0 = today, UTC):
 * - Marketing site: steady, slowly growing; on day -4 from 14:00 UTC a Hacker News post
 *   (news.ycombinator.com) brings a spike to the home page and pricing that fades over a day.
 * - Documentation: steady, quieter at weekends.
 * - Blog: a sidebar link on the (fictional) Inkwell Weekly newsletter site sent about 40% of its
 *   visits, mostly to one post, until day -9; from day -8 on, that referrer is gone.
 *
 * Days older than 24 hours cannot be sent through ingest (events must be recent), so every day is
 * written straight into the Worker's per-minute aggregate tables, the same rows ingest produces; the
 * analytics the MCP tools read are the Worker's own queries over them.
 *
 * Run: node --import tsx scripts/promo/mcp-demo-backend.ts [--port 8799] [--home <dir>]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import worker from '../../apps/ingest-worker/src/index.js';
import type { Env, R2Bucket } from '../../apps/ingest-worker/src/env.js';
import { d1, freshDatabase } from '../../apps/ingest-worker/tests/support/sqlite-d1.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VERSION = (
  JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }
).version;
/** Throwaway secrets for a backend that lives only in this process. */
const ADMIN_SECRET = 'demo-admin-secret-paperkite-0123456789abcdef';
const PROJECT_ID = 'paperkite';
const DAYS = 30;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Weighted = Array<[string, number]>;

interface Site {
  id: string;
  name: string;
  origin: string;
  /** Page views on an ordinary weekday at the start of the 30 days. */
  base: number;
  growthPerDay: number;
  weekend: number;
  pagesPerVisitor: number;
  pages: Weighted;
  referrers: Weighted;
}

const SITES: Site[] = [
  {
    id: 'site-marketing',
    name: 'Marketing site',
    origin: 'https://paperkite.example',
    base: 1150,
    growthPerDay: 0.004,
    weekend: 0.72,
    pagesPerVisitor: 1.8,
    pages: [
      ['/', 38],
      ['/pricing', 18],
      ['/features', 14],
      ['/customers', 8],
      ['/signup', 9],
      ['/about', 5],
      ['/contact', 4],
      ['/security', 4]
    ],
    referrers: [
      ['Unknown', 36],
      ['https://www.google.com', 37],
      ['https://duckduckgo.com', 7],
      ['https://www.bing.com', 5],
      ['https://github.com', 6],
      ['https://www.linkedin.com', 5],
      ['https://docs.paperkite.example', 4]
    ]
  },
  {
    id: 'site-docs',
    name: 'Documentation',
    origin: 'https://docs.paperkite.example',
    base: 820,
    growthPerDay: 0.002,
    weekend: 0.52,
    pagesPerVisitor: 2.6,
    pages: [
      ['/getting-started', 24],
      ['/install', 18],
      ['/api', 15],
      ['/guides/embedding', 11],
      ['/guides/webhooks', 9],
      ['/reference/cli', 9],
      ['/faq', 7],
      ['/changelog', 7]
    ],
    referrers: [
      ['Unknown', 44],
      ['https://www.google.com', 33],
      ['https://github.com', 12],
      ['https://paperkite.example', 8],
      ['https://duckduckgo.com', 3]
    ]
  },
  {
    id: 'site-blog',
    name: 'Blog',
    origin: 'https://blog.paperkite.example',
    base: 330,
    growthPerDay: 0.001,
    weekend: 0.85,
    pagesPerVisitor: 1.4,
    pages: [
      ['/', 26],
      ['/posts/kite-design-notes', 18],
      ['/posts/shipping-offline-first', 16],
      ['/posts/our-2026-roadmap', 14],
      ['/posts/paper-sizes-explained', 12],
      ['/posts/hiring-a-designer', 8],
      ['/about', 6]
    ],
    referrers: [
      ['Unknown', 46],
      ['https://www.google.com', 34],
      ['https://duckduckgo.com', 7],
      ['https://www.bing.com', 4],
      ['https://paperkite.example', 9]
    ]
  }
];

/** The blog's lost referrer: its visits per ordinary day, and where they landed. */
const NEWSLETTER = {
  origin: 'https://inkwell-weekly.example',
  perDay: 235,
  lastDay: -9,
  pages: [
    ['/posts/shipping-offline-first', 58],
    ['/', 24],
    ['/posts/kite-design-notes', 18]
  ] as Weighted
};

/** The marketing site's Hacker News spike: extra page views by hour since it started. */
const HN = {
  origin: 'https://news.ycombinator.com',
  day: -4,
  startHour: 14,
  total: 8600,
  pages: [
    ['/', 52],
    ['/pricing', 21],
    ['/features', 16],
    ['/signup', 7],
    ['/about', 4]
  ] as Weighted
};

const COUNTRIES: Weighted = [
  ['US', 28],
  ['DE', 11],
  ['GB', 9],
  ['FR', 6],
  ['IN', 6],
  ['CA', 5],
  ['NL', 4],
  ['BR', 4],
  ['AU', 3.5],
  ['ES', 3],
  ['SE', 2.5],
  ['PL', 2],
  ['JP', 2],
  ['Unknown', 1]
];
const BROWSERS: Array<[string, string, string, string, number]> = [
  // browser, user-agent family, os, device, weight
  ['Chrome', 'Chrome 140', 'Windows', 'desktop', 24],
  ['Chrome', 'Chrome 140', 'macOS', 'desktop', 12],
  ['Chrome', 'Chrome 140', 'Android', 'mobile', 15],
  ['Safari', 'Safari 26', 'iOS', 'mobile', 16],
  ['Safari', 'Safari 26', 'macOS', 'desktop', 8],
  ['Safari', 'Safari 26', 'iOS', 'tablet', 2.5],
  ['Firefox', 'Firefox 143', 'Windows', 'desktop', 5],
  ['Firefox', 'Firefox 143', 'Linux', 'desktop', 4],
  ['Edge', 'Edge 140', 'Windows', 'desktop', 7],
  ['Samsung Internet', 'Samsung Internet 28', 'Android', 'mobile', 1.5],
  ['Other', 'Googlebot', 'Other', 'desktop', 2],
  ['Other', 'Other bot', 'Other', 'desktop', 1]
];

// A small seeded generator, so every run writes the same numbers.
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Splits `total` across weighted labels (with a little noise) so the counts add up exactly. */
function split(total: number, weighted: Weighted, rand: () => number): Map<string, number> {
  const jittered = weighted.map(
    ([label, weight]) => [label, weight * (0.8 + 0.4 * rand())] as const
  );
  const sum = jittered.reduce((all, [, weight]) => all + weight, 0);
  const exact = jittered.map(([label, weight]) => [label, (weight / sum) * total] as const);
  const counts = new Map(exact.map(([label, value]) => [label, Math.floor(value)]));
  let left = total - [...counts.values()].reduce((all, value) => all + value, 0);
  for (const [label] of [...exact].sort((a, b) => (b[1] % 1) - (a[1] % 1))) {
    if (left <= 0) break;
    counts.set(label, counts.get(label)! + 1);
    left -= 1;
  }
  return counts;
}

/** Share of a day's traffic in each UTC hour: quiet at night, busiest in the European afternoon. */
const HOURLY = Array.from(
  { length: 24 },
  (_, hour) =>
    0.25 +
    Math.max(0, Math.sin(((hour - 5) / 24) * 2 * Math.PI)) +
    (hour >= 13 && hour <= 18 ? 0.25 : 0)
);
const HOURLY_SUM = HOURLY.reduce((all, value) => all + value, 0);

/** Share of the Hacker News spike in each hour since it started: a fast rise, a long tail. */
function hnShare(hoursSince: number): number {
  if (hoursSince < 0 || hoursSince > 34) return 0;
  const weights = Array.from({ length: 35 }, (_, h) =>
    h < 3 ? (h + 1) / 3 : Math.exp(-(h - 3) / 6)
  );
  return weights[hoursSince]! / weights.reduce((all, value) => all + value, 0);
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

type Hour = { pageViews: number; dims: Map<string, Map<string, number>>; visitors: string[] };

/** Seeds the Paperkite project, its websites, and 30 days of hourly aggregates ending now. */
export function seed(sqlite: DatabaseSync, now = new Date()): { pageViews: number } {
  const created = new Date(now.getTime() - 40 * DAY).toISOString();
  sqlite.exec(
    `INSERT INTO quota_policies VALUES ('q-demo', 131072, 50, 50, 200, 500000, 25, 256, 90);
     INSERT INTO projects VALUES ('${PROJECT_ID}', 'Paperkite', 'demo', 90, 'q-demo', 'active');`
  );
  const addSource = sqlite.prepare(
    "INSERT INTO sources VALUES (?, ?, ?, ?, ?, 'active', 'q-demo', ?, ?)"
  );
  for (const site of SITES)
    addSource.run(
      site.id,
      PROJECT_ID,
      site.name,
      `pk_demo_${site.id.slice(5)}`,
      JSON.stringify([site.origin]),
      created,
      created
    );

  const totals = sqlite.prepare(
    'INSERT INTO dashboard_minute_totals (project_id, source_id, minute_utc, page_view_count) VALUES (?, ?, ?, ?)'
  );
  const dimension = sqlite.prepare(
    'INSERT INTO dashboard_minute_dimensions (project_id, source_id, minute_utc, dimension_kind, dimension_value, taxonomy_version, event_count) VALUES (?, ?, ?, ?, ?, 1, ?)'
  );
  const visitor = sqlite.prepare(
    "INSERT OR IGNORE INTO dashboard_minute_visitors (project_id, source_id, minute_utc, visitor_digest, digest_version, identity_kind) VALUES (?, ?, ?, ?, 1, 'source-local')"
  );

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const firstHour = today - (DAYS - 1) * DAY;
  const lastHour = Math.floor(now.getTime() / HOUR) * HOUR - HOUR; // the last complete hour
  let pageViews = 0;
  sqlite.exec('BEGIN');
  for (const [index, site] of SITES.entries()) {
    const rand = random(1009 * (index + 1));
    let fresh = 0;
    const regulars = Array.from({ length: Math.round(site.base * 1.2) }, (_, n) => `r${n}`);
    for (let hour = firstHour; hour <= lastHour; hour += HOUR) {
      const day = Math.floor((hour - today) / DAY); // 0 = today, -1 = yesterday, ...
      const date = new Date(hour);
      const weekday = date.getUTCDay();
      const weekend = weekday === 0 || weekday === 6 ? site.weekend : 1;
      const share = HOURLY[date.getUTCHours()]! / HOURLY_SUM;
      const organic = Math.round(
        site.base * (1 + site.growthPerDay * (day + DAYS)) * weekend * share * (0.85 + 0.3 * rand())
      );
      const parts: Array<{
        pv: number;
        pages: Weighted;
        referrer?: string;
        ppv: number;
        returning: number;
      }> = [{ pv: organic, pages: site.pages, ppv: site.pagesPerVisitor, returning: 0.4 }];
      if (site.id === 'site-blog' && day <= NEWSLETTER.lastDay)
        parts.push({
          pv: Math.round(NEWSLETTER.perDay * weekend * share * (0.85 + 0.3 * rand())),
          pages: NEWSLETTER.pages,
          referrer: NEWSLETTER.origin,
          ppv: 1.3,
          returning: 0.3
        });
      if (site.id === 'site-marketing') {
        const since = Math.round((hour - (today + HN.day * DAY + HN.startHour * HOUR)) / HOUR);
        const extra = Math.round(HN.total * hnShare(since) * (0.9 + 0.2 * rand()));
        if (extra > 0)
          parts.push({
            pv: extra,
            pages: HN.pages,
            referrer: HN.origin,
            ppv: 1.45,
            returning: 0.02
          });
      }

      const at: Hour = { pageViews: 0, dims: new Map(), visitors: [] };
      const add = (kind: string, counts: Map<string, number>) => {
        const into = at.dims.get(kind) ?? new Map<string, number>();
        for (const [label, count] of counts)
          if (count > 0) into.set(label, (into.get(label) ?? 0) + count);
        at.dims.set(kind, into);
      };
      for (const part of parts) {
        if (part.pv <= 0) continue;
        at.pageViews += part.pv;
        add('page_path', split(part.pv, part.pages, rand));
        add(
          'referrer',
          part.referrer ? new Map([[part.referrer, part.pv]]) : split(part.pv, site.referrers, rand)
        );
        add(
          'country',
          split(
            part.pv,
            part.referrer === HN.origin ? [['US', 40], ...COUNTRIES.slice(1)] : COUNTRIES,
            rand
          )
        );
        const agents = split(
          part.pv,
          BROWSERS.map((row, n) => [String(n), row[4]]),
          rand
        );
        const by = (column: 0 | 1 | 2 | 3) => {
          const out = new Map<string, number>();
          for (const [n, count] of agents) {
            const label = BROWSERS[Number(n)]![column];
            out.set(label, (out.get(label) ?? 0) + count);
          }
          return out;
        };
        add('browser', by(0));
        add('user_agent', by(1));
        add('os', by(2));
        add('device', by(3));
        const bots = (agents.get('10') ?? 0) + (agents.get('11') ?? 0);
        add(
          'traffic',
          new Map([
            ['human', part.pv - bots],
            ['bot', bots]
          ])
        );
        const people = Math.max(1, Math.round(part.pv / part.ppv));
        for (let n = 0; n < people; n += 1)
          at.visitors.push(
            rand() < part.returning
              ? regulars[Math.floor(rand() * regulars.length)]!
              : `n${(fresh += 1)}`
          );
      }
      if (at.pageViews === 0) continue;
      const minute = new Date(hour + Math.floor(rand() * 60) * 60_000).toISOString();
      totals.run(PROJECT_ID, site.id, minute, at.pageViews);
      for (const [kind, counts] of at.dims)
        for (const [label, count] of counts)
          dimension.run(PROJECT_ID, site.id, minute, kind, label, count);
      for (const id of at.visitors)
        visitor.run(PROJECT_ID, site.id, minute, digest(`${site.id}:${id}`));
      pageViews += at.pageViews;
    }
  }
  sqlite.exec('COMMIT');
  return { pageViews };
}

/** The Worker's environment around a seeded in-memory database; R2 is an empty stand-in. */
export function demoEnv(now = new Date()): { env: Env; pageViews: number } {
  const sqlite = freshDatabase();
  const { pageViews } = seed(sqlite, now);
  const bucket = {
    async put() {},
    async list() {
      return { objects: [], truncated: false };
    },
    async delete() {}
  } as unknown as R2Bucket;
  return {
    env: {
      VIZOALICA_DB: d1(sqlite),
      VIZOALICA_EVENTS: bucket,
      VIZOALICA_TOKEN_SECRET: 'demo-token-secret-0123456789abcdefghij',
      VIZOALICA_ADMIN_SECRET: ADMIN_SECRET,
      VIZOALICA_ANALYTICS_DIGEST_SECRET: 'demo-digest-secret-0123456789abcdefgh',
      VIZOALICA_DEMO_MODE: 'true',
      VIZOALICA_WORKER_VERSION: VERSION
    },
    pageViews
  };
}

/** Serves `worker.fetch` over HTTP on 127.0.0.1. */
export function serve(env: Env, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (typeof value === 'string') headers.set(key, value);
      const request = new Request(`http://127.0.0.1:${port}${req.url ?? '/'}`, {
        method: req.method ?? 'GET',
        headers,
        ...(body && req.method !== 'GET' && req.method !== 'HEAD' ? { body } : {})
      });
      worker
        .fetch(request, env)
        .then(async (response) => {
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(Buffer.from(await response.arrayBuffer()));
        })
        .catch((error: unknown) => {
          console.error(error);
          res.writeHead(500).end();
        });
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

/** A throwaway HOME whose Vizoalica settings name this backend as the environment `demo`. */
export function writeDemoHome(port: number, home?: string): string {
  const dir = home ?? mkdtempSync(join(tmpdir(), 'vizoalica-mcp-demo-'));
  const config = join(dir, '.config', 'vizoalica');
  mkdirSync(config, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(config, 'environments.json'),
    `${JSON.stringify(
      {
        version: 1,
        environments: {
          demo: { url: `http://127.0.0.1:${port}`, role: 'admin', secret: ADMIN_SECRET }
        }
      },
      null,
      2
    )}\n`,
    { mode: 0o600 }
  );
  return dir;
}

export async function startDemoBackend(options: { port?: number; home?: string } = {}) {
  const port = options.port ?? 8799;
  const { env, pageViews } = demoEnv();
  const server = await serve(env, port);
  const home = writeDemoHome(port, options.home);
  return { server, port, home, pageViews };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (name: string) => {
    const index = process.argv.indexOf(name);
    return index > 0 ? process.argv[index + 1] : undefined;
  };
  const { port, home, pageViews } = await startDemoBackend({
    port: Number(arg('--port') ?? 8799),
    home: arg('--home')
  });
  console.log(
    `Demo backend on http://127.0.0.1:${port} (${pageViews} page views). HOME for vizoalica mcp: ${home}`
  );
}

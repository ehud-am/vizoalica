#!/usr/bin/env node
// Reproduces the evidence in specs/007-dashboard-visual-refresh/{cost-model,performance-report}.md.
//
// Reproduces the dashboard portion of the current fresh D1 baseline in an in-memory SQLite
// database (Node's built-in experimental `node:sqlite`), populates a synthetic 30-day fixture,
// then runs the real queries
// from apps/ingest-worker/src/storage/d1-repositories.ts (getAnalyticsOverview) with
// EXPLAIN QUERY PLAN and repeated timing, plus an empirical duplicate-event-delivery check
// against the real recordDashboardRollups write sequence.
//
// This is not a live D1 benchmark - see the caveats in performance-report.md. It requires
// Node >= 22 (node:sqlite is experimental; a warning on stderr is expected and harmless).
//
// Usage: node scripts/dashboard-performance-fixture.mjs

import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec(`
CREATE TABLE sources (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, status TEXT NOT NULL);
CREATE TABLE dashboard_minute_totals (
  project_id TEXT NOT NULL, source_id TEXT NOT NULL, minute_utc TEXT NOT NULL,
  page_view_count INTEGER NOT NULL DEFAULT 0 CHECK (page_view_count >= 0),
  PRIMARY KEY (project_id, source_id, minute_utc)
);
CREATE TABLE dashboard_minute_dimensions (
  project_id TEXT NOT NULL, source_id TEXT NOT NULL, minute_utc TEXT NOT NULL,
  dimension_kind TEXT NOT NULL CHECK (dimension_kind IN ('page_path','country','user_agent','browser','os','device','traffic','referrer')),
  dimension_value TEXT NOT NULL, taxonomy_version INTEGER NOT NULL DEFAULT 1 CHECK (taxonomy_version >= 1),
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  PRIMARY KEY (project_id, source_id, minute_utc, dimension_kind, dimension_value, taxonomy_version)
);
CREATE TABLE dashboard_minute_visitors (
  project_id TEXT NOT NULL, source_id TEXT NOT NULL, minute_utc TEXT NOT NULL,
  visitor_digest TEXT NOT NULL, digest_version INTEGER NOT NULL DEFAULT 1,
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('source-local','project-supplied')),
  PRIMARY KEY (project_id, source_id, minute_utc, visitor_digest, digest_version, identity_kind)
);
CREATE TABLE dashboard_seen_events (
  project_id TEXT NOT NULL, event_digest TEXT NOT NULL, received_at TEXT NOT NULL,
  request_nonce TEXT, digest_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (project_id, event_digest, digest_version)
);
CREATE TABLE dashboard_aggregate_watermarks (
  project_id TEXT NOT NULL, source_id TEXT NOT NULL, expanded_from_utc TEXT NOT NULL,
  last_completed_at TEXT NOT NULL, taxonomy_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (project_id, source_id)
);
CREATE INDEX dashboard_minute_totals_source_range ON dashboard_minute_totals(project_id, source_id, minute_utc);
CREATE INDEX dashboard_minute_totals_project_range ON dashboard_minute_totals(project_id, minute_utc, source_id);
CREATE INDEX dashboard_minute_dimensions_source_range ON dashboard_minute_dimensions(project_id, source_id, dimension_kind, minute_utc, dimension_value);
CREATE INDEX dashboard_minute_dimensions_project_range ON dashboard_minute_dimensions(project_id, dimension_kind, minute_utc, source_id, dimension_value);
CREATE INDEX dashboard_minute_visitors_source_range ON dashboard_minute_visitors(project_id, source_id, minute_utc, visitor_digest);
CREATE INDEX dashboard_minute_visitors_project_range ON dashboard_minute_visitors(project_id, minute_utc, source_id, visitor_digest);
CREATE INDEX dashboard_seen_events_retention ON dashboard_seen_events(received_at);
`);

db.exec(
  "INSERT INTO sources (id, project_id, status) VALUES ('s1','p1','active'), ('s2','p1','active')"
);

const DAYS = 30;
const MINUTES = DAYS * 24 * 60;
const DIM_KINDS = [
  'page_path',
  'country',
  'user_agent',
  'browser',
  'os',
  'device',
  'traffic',
  'referrer'
];

const t0 = Date.now();
const insTotal = db.prepare(
  'INSERT INTO dashboard_minute_totals (project_id, source_id, minute_utc, page_view_count) VALUES (?,?,?,?)'
);
const insDim = db.prepare(
  'INSERT INTO dashboard_minute_dimensions (project_id, source_id, minute_utc, dimension_kind, dimension_value, taxonomy_version, event_count) VALUES (?,?,?,?,?,1,?)'
);
const insVis = db.prepare(
  'INSERT INTO dashboard_minute_visitors (project_id, source_id, minute_utc, visitor_digest, identity_kind) VALUES (?,?,?,?,?)'
);

db.exec('BEGIN');
const start = new Date('2026-08-10T00:00:00.000Z').getTime();
for (const sourceId of ['s1', 's2']) {
  for (let m = 0; m < MINUTES; m++) {
    const minuteUtc = new Date(start + m * 60000).toISOString();
    const views = 1 + (m % 5);
    insTotal.run('p1', sourceId, minuteUtc, views);
    for (const kind of DIM_KINDS) {
      const distinctValues = 1 + (m % 2);
      for (let v = 0; v < distinctValues; v++) {
        insDim.run('p1', sourceId, minuteUtc, kind, `${kind}-${v}`, 1 + (m % 3));
      }
    }
    const distinctVisitors = 1 + (m % 2);
    for (let v = 0; v < distinctVisitors; v++) {
      insVis.run('p1', sourceId, minuteUtc, `digest-${sourceId}-${m}-${v}`, 'source-local');
    }
  }
}
db.exec('COMMIT');
const insertMs = Date.now() - t0;

function count(table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}
console.log('Fixture insert time (ms):', insertMs);
console.log('dashboard_minute_totals rows:', count('dashboard_minute_totals'));
console.log('dashboard_minute_dimensions rows:', count('dashboard_minute_dimensions'));
console.log('dashboard_minute_visitors rows:', count('dashboard_minute_visitors'));

const rangeStart = new Date(start).toISOString();
const rangeEnd = new Date(start + MINUTES * 60000).toISOString();

function timeQuery(label, sql, params) {
  const t = Date.now();
  const stmt = db.prepare(sql);
  const rows = stmt.all(...params);
  const ms = Date.now() - t;
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params);
  console.log(`\n--- ${label} ---`);
  console.log('rows returned:', rows.length, 'time(ms):', ms);
  console.log('query plan:', plan.map((p) => p.detail).join(' | '));
  return { rows, ms, plan };
}

const allSitesTotal = `SELECT COALESCE(SUM(page_view_count), 0) AS pageViews FROM dashboard_minute_totals WHERE project_id = ? AND minute_utc >= ? AND minute_utc < ? AND source_id IN (SELECT id FROM sources WHERE project_id = ? AND status != 'deleted')`;
const oneSiteTotal = `SELECT COALESCE(SUM(page_view_count), 0) AS pageViews FROM dashboard_minute_totals WHERE project_id = ? AND minute_utc >= ? AND minute_utc < ? AND source_id = ?`;
const allSitesVisitors = `SELECT COUNT(DISTINCT visitor_digest) AS uniqueUsers FROM dashboard_minute_visitors WHERE project_id = ? AND minute_utc >= ? AND minute_utc < ? AND source_id IN (SELECT id FROM sources WHERE project_id = ? AND status != 'deleted')`;
const dailyTrend = `SELECT substr(minute_utc, 1, 10) || 'T00:00:00.000Z' AS startUtc, SUM(page_view_count) AS pageViews FROM dashboard_minute_totals WHERE project_id = ? AND minute_utc >= ? AND minute_utc < ? AND source_id IN (SELECT id FROM sources WHERE project_id = ? AND status != 'deleted') GROUP BY startUtc ORDER BY startUtc`;
const browserRanking = `SELECT dimension_value AS label, SUM(event_count) AS count FROM dashboard_minute_dimensions WHERE project_id = ? AND minute_utc >= ? AND minute_utc < ? AND source_id IN (SELECT id FROM sources WHERE project_id = ? AND status != 'deleted') AND dimension_kind = ? GROUP BY dimension_value ORDER BY count DESC, label ASC`;

timeQuery('all-sites total pageViews (30d)', allSitesTotal, ['p1', rangeStart, rangeEnd, 'p1']);
timeQuery('one-site total pageViews (30d)', oneSiteTotal, ['p1', rangeStart, rangeEnd, 's1']);
timeQuery('all-sites distinct visitors (30d)', allSitesVisitors, [
  'p1',
  rangeStart,
  rangeEnd,
  'p1'
]);
timeQuery('daily trend, all-sites (30d)', dailyTrend, ['p1', rangeStart, rangeEnd, 'p1']);
timeQuery('dimension ranking: browser, all-sites (30d)', browserRanking, [
  'p1',
  rangeStart,
  rangeEnd,
  'p1',
  'browser'
]);

const shortEnd = new Date(start + MINUTES * 60000).toISOString();
const shortStart = new Date(start + (MINUTES - 24 * 60) * 60000).toISOString();
timeQuery('total pageViews, one-site, 24h (typical default range)', oneSiteTotal, [
  'p1',
  shortStart,
  shortEnd,
  's1'
]);
const hourlyTrend = `SELECT substr(minute_utc, 1, 13) || ':00:00.000Z' AS startUtc, SUM(page_view_count) AS pageViews FROM dashboard_minute_totals WHERE project_id = ? AND minute_utc >= ? AND minute_utc < ? AND source_id = ? GROUP BY startUtc ORDER BY startUtc`;
timeQuery('hourly trend, one-site, 24h', hourlyTrend, ['p1', shortStart, shortEnd, 's1']);

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}
function benchmark(label, sql, params, iterations = 30) {
  const stmt = db.prepare(sql);
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t = process.hrtime.bigint();
    stmt.all(...params);
    times.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  console.log(
    `\n[bench] ${label}: p50=${percentile(times, 0.5).toFixed(2)}ms p95=${percentile(times, 0.95).toFixed(2)}ms max=${Math.max(...times).toFixed(2)}ms (n=${iterations}, in-process, no network RTT)`
  );
}

benchmark('all-sites total, 30d', allSitesTotal, ['p1', rangeStart, rangeEnd, 'p1']);
benchmark('all-sites distinct visitors, 30d', allSitesVisitors, ['p1', rangeStart, rangeEnd, 'p1']);
benchmark('daily trend, all-sites, 30d', dailyTrend, ['p1', rangeStart, rangeEnd, 'p1']);
benchmark('dimension ranking (browser), all-sites, 30d', browserRanking, [
  'p1',
  rangeStart,
  rangeEnd,
  'p1',
  'browser'
]);
benchmark('one-site total, 24h (default range)', oneSiteTotal, ['p1', shortStart, shortEnd, 's1']);
benchmark('hourly trend, one-site, 24h', hourlyTrend, ['p1', shortStart, shortEnd, 's1']);

// --- Empirical duplicate-delivery check, replaying recordDashboardRollups' real write sequence ---
console.log('\n--- duplicate delivery check ---');
const dupDb = new DatabaseSync(':memory:');
dupDb.exec(`
  CREATE TABLE dashboard_seen_events (
    project_id TEXT NOT NULL, event_digest TEXT NOT NULL, received_at TEXT NOT NULL,
    request_nonce TEXT, digest_version INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (project_id, event_digest, digest_version)
  );
  CREATE TABLE dashboard_minute_totals (
    project_id TEXT NOT NULL, source_id TEXT NOT NULL, minute_utc TEXT NOT NULL,
    page_view_count INTEGER NOT NULL DEFAULT 0 CHECK (page_view_count >= 0),
    PRIMARY KEY (project_id, source_id, minute_utc)
  );
`);
function deliverBatch(nonce, eventDigests) {
  const insSeen = dupDb.prepare(
    'INSERT OR IGNORE INTO dashboard_seen_events (project_id, event_digest, received_at, request_nonce) VALUES (?,?,?,?)'
  );
  for (const digest of eventDigests) insSeen.run('p1', digest, new Date().toISOString(), nonce);
  const placeholders = eventDigests.map(() => '?').join(', ');
  const upsert = dupDb.prepare(`
    INSERT INTO dashboard_minute_totals (project_id, source_id, minute_utc, page_view_count)
    SELECT ?, ?, ?, COUNT(*) FROM dashboard_seen_events
    WHERE project_id = ? AND request_nonce = ? AND event_digest IN (${placeholders})
    HAVING COUNT(*) > 0
    ON CONFLICT(project_id, source_id, minute_utc) DO UPDATE SET page_view_count = page_view_count + excluded.page_view_count
  `);
  upsert.run('p1', 's1', '2026-08-10T00:00:00.000Z', 'p1', nonce, ...eventDigests);
  dupDb
    .prepare('UPDATE dashboard_seen_events SET request_nonce = NULL WHERE request_nonce = ?')
    .run(nonce);
}
function currentCount() {
  return (
    dupDb.prepare('SELECT page_view_count FROM dashboard_minute_totals').get()?.page_view_count ?? 0
  );
}
deliverBatch('nonce-A', ['evt-1', 'evt-2']);
console.log('After first delivery, page_view_count =', currentCount());
deliverBatch('nonce-B', ['evt-1', 'evt-2']);
console.log(
  'After duplicate redelivery (same 2 events, new nonce), page_view_count =',
  currentCount()
);
deliverBatch('nonce-C', ['evt-1', 'evt-3']);
console.log('After redelivery + one new event, page_view_count =', currentCount());

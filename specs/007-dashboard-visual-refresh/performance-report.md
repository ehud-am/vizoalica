# Performance report: dashboard visual refresh

## Method and its limits

Migration `0005`'s exact DDL was applied to an in-memory SQLite database via Node 22's built-in
`node:sqlite` driver, then populated with a synthetic 30-day fixture (method and fixture size in
[cost-model.md](../../docs/operations/cost-model.md#method)). Every `getAnalyticsOverview` query
was extracted verbatim from `apps/ingest-worker/src/storage/d1-repositories.ts` and run against
this fixture with `EXPLAIN QUERY PLAN` and 30-iteration timing.

**This is not a live D1 benchmark.** D1 is Cloudflare's managed SQLite, so the query planner's
index choice (what `EXPLAIN QUERY PLAN` reports) is representative - D1 uses the same planner.
Absolute latency is not representative: this benchmark has zero network round-trip time, runs
single-threaded with no concurrent load, and SQLite-in-process is not identical to D1's storage
layer. Read every millisecond figure below as "index seek vs. table scan," not as a production SLA.
No live Cloudflare account was used to produce this report.

## Fixture

| Table                        | Rows      |
| ------------------------------ | --------- |
| `dashboard_minute_totals`     | 86,400    |
| `dashboard_minute_dimensions` | 1,036,800 |
| `dashboard_minute_visitors`   | 129,600   |

2 active sources, 1 project, 30 days of continuous minute-granularity traffic (1-5 page
views/minute, 1-2 distinct values per dimension/minute, 1-2 distinct visitors/minute).

## p95 response time (query execution only, not end-to-end HTTP)

| Query                                          | p50     | p95     | max     |
| ------------------------------------------------ | ------- | ------- | ------- |
| All-sites total, 30d range                       | 6.31 ms | 6.73 ms | 6.82 ms |
| All-sites distinct visitors, 30d range           | 61.67 ms| 62.28 ms| 62.96 ms|
| Daily trend, all-sites, 30d range                | 40.92 ms| 43.47 ms| 83.80 ms|
| One dimension ranking (browser), all-sites, 30d  | 57.03 ms| 60.99 ms| 61.27 ms|
| One-site total, 24h range (the default)          | 0.10 ms | 0.12 ms | 0.13 ms |
| Hourly trend, one-site, 24h range (the default)  | 0.46 ms | 0.46 ms | 0.47 ms |

The default 24-hour range - what every dashboard load actually uses unless an operator opens a
custom 30-day range - is two to three orders of magnitude cheaper than the worst-case 30-day
all-sites queries, because it touches roughly 1,440 rows of a 30-day table's 86,400 instead of the
whole range. A full `getAnalyticsOverview` response issues 15 such queries (2 totals, 2 trend
buckets, 8 dimension queries, 1 watermark, 1 taxonomy-version, 1 identity-kind); at 24h/one-site
range, all 15 finish in low single-digit milliseconds combined in this benchmark. At worst-case
30d/all-sites range, the 4 heaviest queries alone (distinct visitors + trend + 2 dimension queries
shown above; the product issues 8 dimension queries total, so the real worst case is higher) sum
to roughly 160 ms of the measured budget.

## Output bounds

Every ranked result (`pagePaths`, `countries`, `userAgents`, `referrers`) is capped at 10 explicit
items plus one summed "Other" remainder; every distribution (`operatingSystems`, `browsers`,
`devices`, `traffic`) at 11 items plus one "Other". The trend array is bounded by the range: at
most 720 hourly buckets (30 days) or 30 daily buckets, matching the OpenAPI contract's
`AnalyticsOverview.trend` `maxItems: 720`. No query result is unbounded by construction - the caps
are applied in application code (`d1-repositories.ts`'s `ranked`/`distribution` helpers), not left
to the client to truncate.

## D1 EXPLAIN QUERY PLAN

Every query above resolves through an index seek, never a table scan, against any dashboard table:

```
all-sites total (30d):
  SEARCH dashboard_minute_totals USING INDEX dashboard_minute_totals_source_range
    (project_id=? AND source_id=? AND minute_utc>? AND minute_utc<?)
  LIST SUBQUERY 1 | SCAN sources

one-site total (30d):
  SEARCH dashboard_minute_totals USING INDEX dashboard_minute_totals_source_range
    (project_id=? AND source_id=? AND minute_utc>? AND minute_utc<?)

all-sites distinct visitors (30d):
  USE TEMP B-TREE FOR count(DISTINCT)
  SEARCH dashboard_minute_visitors USING COVERING INDEX dashboard_minute_visitors_source_range
    (project_id=? AND source_id=? AND minute_utc>? AND minute_utc<?)
  LIST SUBQUERY 1 | SCAN sources

daily trend, all-sites (30d):
  SEARCH dashboard_minute_totals USING INDEX dashboard_minute_totals_source_range (...)
  LIST SUBQUERY 1 | SCAN sources | USE TEMP B-TREE FOR GROUP BY

dimension ranking: browser, all-sites (30d):
  SEARCH dashboard_minute_dimensions USING INDEX dashboard_minute_dimensions_source_range
    (project_id=? AND source_id=? AND dimension_kind=? AND minute_utc>? AND minute_utc<?)
  LIST SUBQUERY 1 | SCAN sources | USE TEMP B-TREE FOR GROUP BY | USE TEMP B-TREE FOR ORDER BY
```

The `LIST SUBQUERY 1 | SCAN sources` step is the all-sites scope's `source_id IN (SELECT id FROM
sources WHERE project_id = ? AND status != 'deleted')` subquery - a full scan, but of `sources`
(bounded by a project's website count), not of any dashboard aggregate table. Temp B-trees appear
only for `COUNT(DISTINCT ...)`, `GROUP BY`, and `ORDER BY` - operations SQLite cannot serve
directly from a B-tree index regardless of which index exists; this is expected, not a sign of a
missing index.

## Rows read/written

See [cost-model.md](../../docs/operations/cost-model.md) for the full per-write-statement and
per-query breakdown. Summary: **16 row-writes per accepted page-view event** in a single-event
batch (14 in larger batches, since 2 of the 9 statements coalesce per batch rather than per
event); **15 D1 statement executions per dashboard request**, each resolving through an index seek.

## Duplicate handling

Verified empirically by replaying the exact three-statement write sequence
`recordDashboardRollups` uses (`INSERT OR IGNORE` into `dashboard_seen_events` with the batch's
nonce, a `page_view_count` upsert gated on `COUNT(*) ... HAVING COUNT(*) > 0` against rows actually
stamped with that nonce, then clearing the nonce) against the same in-memory database:

```
After first delivery, page_view_count = 2
After duplicate redelivery (same 2 events, new nonce), page_view_count = 2   <- unchanged
After redelivery + one new event, page_view_count = 3                        <- only the new one counted
```

Mechanism: a duplicate event's digest already exists in `dashboard_seen_events` from its first
delivery, so the second delivery's `INSERT OR IGNORE` is a no-op - the row keeps its original
(already-cleared) `request_nonce`, not the retry's nonce. The aggregate upsert only counts rows
matching the *current* batch's nonce, so `COUNT(*)` for an all-duplicate batch is `0`, the `HAVING`
clause suppresses the insert entirely, and `page_view_count` does not move. A batch mixing
duplicates with genuinely new events counts only the new ones, as shown above.

This confirms the design is idempotent under at-least-once redelivery. It is evidence from
replaying the real SQL against a real SQLite engine, not from the project's own test suite: no
`vitest` test currently exercises this scenario against a real database (the existing
`dashboard-rollups.integration.test.ts` suite uses a hand-rolled fake `D1Database` that always
reports success and does not implement `INSERT OR IGNORE`/`ON CONFLICT`/`HAVING` semantics, so it
cannot itself prove this outcome). This is a known, tracked gap - see the T011 note in
[tasks.md](./tasks.md).

## Cleanup behavior

`deleteExpiredDashboardData` (`d1-repositories.ts`, exercised by
`apps/ingest-worker/tests/dashboard-retention.test.ts`) deletes rows older than a 32-day boundary
from all four growing tables in one transactional `batch()`, each table's delete bounded to 1,000
rows per invocation (`... WHERE rowid IN (SELECT rowid FROM ... WHERE <column> < ? LIMIT 1000)`),
run daily by the Worker's Cron Trigger. `dashboard_aggregate_watermarks` is never touched by
cleanup, so a source's completeness boundary survives retention pruning. At this report's fixture
traffic shape (2 sources, ~1,440 new minute-total rows/day/source), a single daily run comfortably
clears a day's expired rows in one pass per table; a much higher-traffic deployment could need more
than one day's cron cycle to fully catch up on a given table if its single-day growth exceeds 1,000
rows and the table is not yet caught up from a backlog - by design, since an unbounded delete in one
statement risks a long-running write lock. This was not stress-tested against a backlog scenario in
this report.

# Dashboard cost model

This documents the D1 read/write footprint of the dashboard visual refresh (migration `0005`),
measured against an in-memory SQLite database built from the migration's exact DDL and a
synthetic 30-day fixture, plus a per-write-statement count read directly from
`apps/ingest-worker/src/storage/d1-repositories.ts`. D1 is Cloudflare's managed SQLite, so the
query planner's index choice (what `EXPLAIN QUERY PLAN` reports below) transfers directly; absolute
latency does not - D1 adds network round-trip time this benchmark cannot reproduce locally. Treat
the row counts and query plans as evidence, and the latency numbers as a same-index-vs-no-index
sanity check, not a production SLA.

## Method

Reproduce this report's numbers directly: `node scripts/dashboard-performance-fixture.mjs`
(requires Node >= 22; `node:sqlite` is experimental and prints a harmless warning to stderr).
`deploy/cloudflare/migrations/0005_dashboard_visual_refresh.sql` was applied verbatim to a
`node:sqlite` in-memory database (Node 22's built-in driver). The fixture models 2 active sources
in 1 project, 30 days of continuous traffic at minute granularity, with 1-5 page views/minute,
1-2 distinct values per classification dimension/minute, and 1-2 distinct visitors/minute -
deliberately not a sparse or bursty traffic shape, so the row counts below are a reasonable
upper-middle estimate for a small-to-medium site rather than a best case.

Resulting fixture size:

| Table                         | Rows      |
| ----------------------------- | --------- |
| `dashboard_minute_totals`     | 86,400    |
| `dashboard_minute_dimensions` | 1,036,800 |
| `dashboard_minute_visitors`   | 129,600   |

(`dashboard_seen_events` and `dashboard_aggregate_watermarks` were not populated in this fixture -
the former is retention-pruned daily and bounded by the last 32 days of _distinct_ accepted event
IDs, not by minute granularity; the latter has exactly one row per source.)

## Writes per accepted page-view event

Read directly from `recordDashboardRollups` in `d1-repositories.ts`, one accepted
`com.vizoalica.page_view.v1` event, worst case (a project-supplied identity present, so both the
source-local legacy visitor table and the new minute-visitors table get a row):

| Statement                                                      | Rows written                                                         |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `dashboard_rollups` upsert (legacy, kept as compatibility)     | 1                                                                    |
| `dashboard_hourly_page_views` upsert (legacy)                  | 1                                                                    |
| `dashboard_hourly_visitors` insert-or-ignore (legacy)          | 1                                                                    |
| `dashboard_seen_events` insert-or-ignore (idempotency ledger)  | 1                                                                    |
| `dashboard_minute_totals` upsert                               | 1                                                                    |
| `dashboard_minute_dimensions` upsert × 8 fixed dimension kinds | 8                                                                    |
| `dashboard_minute_visitors` insert-or-ignore                   | 1                                                                    |
| `dashboard_aggregate_watermarks` upsert                        | 1 (coalesced per project/source per ingested _batch_, not per event) |
| `dashboard_seen_events` nonce-clear update                     | 1 (once per ingested _batch_, not per event)                         |
| **Total, single-event batch**                                  | **16**                                                               |

The last two rows are coalesced across an entire ingested batch (an ingest request can carry
multiple events): a batch of 25 page-view events writes roughly `14 × 25 + 2 = 352` rows, not
`16 × 25 = 400` - the watermark and nonce-clear statements do not scale with batch size.

## Reads per dashboard request

`getAnalyticsOverview` issues 15 D1 statement executions per request, regardless of range length
or all-sites vs. one-site scope: 2 total queries (page views, unique users), 2 trend queries
(page-view and visitor buckets), 8 dimension queries (4 rankings + 4 distributions, one query per
dimension kind), 1 watermark query, 1 taxonomy-version query, 1 identity-kind query. Every one of
them, measured against the fixture above:

| Query                                                                     | Rows returned | Time (in-memory, no network RTT) | Plan                                                                                                             |
| ------------------------------------------------------------------------- | ------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| All-sites total, 30d range (touches both sources)                         | 1             | 7 ms                             | `SEARCH ... USING INDEX dashboard_minute_totals_source_range`                                                    |
| One-site total, 30d range                                                 | 1             | 3 ms                             | `SEARCH ... USING INDEX dashboard_minute_totals_source_range`                                                    |
| All-sites distinct visitors, 30d (full fixture scan of the visitor index) | 1             | 63 ms                            | `SEARCH ... USING COVERING INDEX dashboard_minute_visitors_source_range` + temp B-tree for `COUNT(DISTINCT ...)` |
| Daily trend, all-sites, 30d                                               | 30            | 41 ms                            | indexed search + temp B-tree for `GROUP BY`                                                                      |
| One dimension ranking (browser), all-sites, 30d                           | 2             | 57 ms                            | indexed search + temp B-trees for `GROUP BY`/`ORDER BY`                                                          |
| One-site total, 24h (the default range)                                   | 1             | 0 ms                             | indexed search                                                                                                   |
| Hourly trend, one-site, 24h                                               | 24            | 0 ms                             | indexed search                                                                                                   |

No query plan reports a table `SCAN` against a dashboard table - every one resolves through an
index seek on the composite primary key or one of the six explicit indexes migration `0005`
creates. The only `SCAN` in any plan is against `sources` (2 rows in this fixture; still a full
scan in the query planner's eyes, but bounded by a project's website count, which this product
already caps operationally). The `COUNT(DISTINCT ...)` and `GROUP BY`/`ORDER BY` queries need a
temporary B-tree because SQLite/D1 cannot serve deduplication or aggregation ordering directly from
a B-tree index - that's expected, not a missing-index problem.

## Free-tier implications (verify current limits before relying on this for capacity planning -

Cloudflare's published D1 pricing has changed before and may change again)

Using Cloudflare's documented D1 free-tier daily budgets at the time of writing (see
[developers.cloudflare.com/d1/platform/pricing](https://developers.cloudflare.com/d1/platform/pricing)):

- **Writes**: at 16 rows/page-view event (single-event batches; fewer per-event at larger batch
  sizes, see above), a 100,000-rows/day write budget supports roughly **6,250 accepted page-view
  events/day** before the dashboard's rollup writes alone exhaust it - before counting the
  ingestion pipeline's own event-storage writes, which are separate from the rollup writes counted
  here.
- **Reads**: at 15 statement executions/dashboard request, each touching at most a few dozen rows
  for a typical single-day range (see the 24h row above) up to roughly 130k rows for a worst-case
  whole-account 30-day distinct-visitor count, a 5,000,000-rows/day read budget supports several
  thousand dashboard page loads/day even at the worst-case range, and effectively unlimited
  practical usage at the default 24h range.
- **Storage**: at roughly 1.25M total rows across the three growing tables for 30 days of 2
  active sources in this fixture, and D1's free-tier storage budget measured in gigabytes rather
  than row count, storage is very unlikely to bind before the write-rate budget does for a site at
  this traffic level. A much higher-traffic site should re-run
  [`scripts/dashboard-performance-fixture.mjs`](../../scripts/dashboard-performance-fixture.mjs)
  (`node scripts/dashboard-performance-fixture.mjs`, requires Node >= 22) at its own expected scale
  before relying on the free tier - edit its `DAYS`/traffic-shape constants rather than guessing.

## Retention cost

The daily cleanup Cron Trigger deletes rows older than 32 days from `dashboard_minute_totals`,
`dashboard_minute_dimensions`, `dashboard_minute_visitors`, and `dashboard_seen_events`, in
`LIMIT`-bounded batches per table (see `dashboard-retention.test.ts`). Steady-state storage is
therefore bounded by roughly 32 days of the write volume above, not unbounded growth - a site
generating this fixture's traffic shape indefinitely settles at roughly the 30-day row counts
shown above, plus two days of margin, rather than growing forever.

## Quota assumptions

This model assumes the existing per-source ingestion quotas (`maxEventsPerSecond`,
`maxEventsPerDay`) remain the actual limiting factor on write volume in practice - the dashboard
rollup writes are a fixed multiplier (roughly 14-16x, per the table above) on top of whatever
volume already passed those quotas and R2 storage. It does not model concurrent-write contention;
D1's transactional `batch()` (used for every write except the three retained legacy statements)
serializes a batch's writes, which bounds worst-case lock contention to one ingest batch at a time
per Worker isolate.

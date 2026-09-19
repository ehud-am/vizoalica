# Dashboard cost model

This documents the D1 read/write footprint of the dashboard tables in the current fresh schema
baseline, measured against an in-memory SQLite database built from the same dashboard DDL and a
synthetic 30-day fixture, plus a per-write-statement count read directly from
`apps/ingest-worker/src/storage/d1-repositories.ts`. D1 is Cloudflare's managed SQLite, so the
query planner's index choice (what `EXPLAIN QUERY PLAN` reports below) transfers directly; absolute
latency does not - D1 adds network round-trip time this benchmark cannot reproduce locally. Treat
the row counts and query plans as evidence, and the latency numbers as a same-index-vs-no-index
sanity check, not a production SLA.

## Method

Reproduce this report's numbers directly: `node scripts/dashboard-performance-fixture.mjs`
(requires Node >= 22; `node:sqlite` is experimental and prints a harmless warning to stderr).
The dashboard portion of `deploy/cloudflare/migrations/0001_initial.sql` is reproduced in a
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
| `dashboard_rollups` daily upsert                               | 1                                                                    |
| `dashboard_hourly_page_views` upsert                           | 1                                                                    |
| `dashboard_hourly_visitors` insert-or-ignore                   | 1                                                                    |
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
index seek on the composite primary key or one of the six explicit indexes in the fresh baseline.
The only `SCAN` in any plan is against `sources` (2 rows in this fixture; still a full
scan in the query planner's eyes, but bounded by a project's website count, which this product
already caps operationally). The `COUNT(DISTINCT ...)` and `GROUP BY`/`ORDER BY` queries need a
temporary B-tree because SQLite/D1 cannot serve deduplication or aggregation ordering directly from
a B-tree index - that's expected, not a missing-index problem.

## Capacity planning

Cloudflare pricing and included usage can change. Compare this report's measured row counts with
the current [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) instead of relying
on a copied free-tier number. Include ingestion storage and request costs as well as dashboard
rollups. For higher traffic, rerun
[`scripts/dashboard-performance-fixture.mjs`](../../scripts/dashboard-performance-fixture.mjs) at
the expected scale and configure Cloudflare usage alerts before increasing source quotas.

## Retention cost

The daily cleanup Cron Trigger deletes rows older than 32 days from `dashboard_minute_totals`,
`dashboard_minute_dimensions`, `dashboard_minute_visitors`, `dashboard_seen_events`,
`ingestion_decisions`, and `quota_windows`. Each table is deleted in `LIMIT 1000` batches, and the
job repeats those batches until every table returns a partial batch, up to 200 repeats per run
(about 200,000 rows per table per run; see `dashboard-retention.test.ts`). Steady-state storage is
therefore bounded by roughly 32 days of the write volume above, not unbounded growth - a site
generating this fixture's traffic shape indefinitely settles at roughly the 30-day row counts
shown above, plus two days of margin, rather than growing forever. A backlog beyond the per-run cap
(only reachable at well over the fixture's volume) drains over subsequent nights. The same daily
run also permanently removes the data of deleted websites and projects (R2 batches and all their
D1 rows) in bounded, resumable passes; see the
[backend guide](cloudflare.md#deleted-websites-and-projects).

## Release 0.5.2 platform review

Reviewed `apps/ingest-worker` and `apps/ingest-api` for performance, scale, and cost, without
changing the storage design. Findings and resolutions:

| Area                                   | Finding                                                                                                                                                                                                                                                    | Resolution                                                                                                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 growth (**material**)               | The retention job deleted at most 1,000 rows per table per day, while the fixture writes about 34,500 `dashboard_minute_dimensions` rows/day. The "bounded storage" claim above did not hold. `ingestion_decisions` and `quota_windows` were never pruned. | Cleanup now repeats until drained and also prunes `ingestion_decisions` and `quota_windows`. Fixed and tested.                               |
| Unauthenticated request cost           | A request with no or an invalid token still cost three D1 reads (source, project, quota policy) before being rejected.                                                                                                                                     | Rejected with 401 before any D1 access unless the unsigned-demo bypass is enabled. Fixed and tested.                                         |
| Abuse throttling                       | Only per-source accepted-event quotas existed.                                                                                                                                                                                                             | Optional Workers Rate Limiting binding (see the Cloudflare guide). Opt-in so existing deployments are unchanged.                             |
| R2 request volume                      | One R2 `put` (a Class A operation) per accepted batch, not per event. Up to 25 events (the batch cap) share one object.                                                                                                                                    | No change. The 7-day `events/` lifecycle rule bounds storage. Class A operations remain the R2 cost driver.                                  |
| Per-batch D1 work                      | An accepted batch costs 3 reads, 2 quota upserts, 1 decision insert, and the rollup batch in the table above.                                                                                                                                              | No change; already coalesced per batch.                                                                                                      |
| Retention indexes                      | `ingestion_decisions.received_at` and `quota_windows.window_start` have no index, so each nightly run scans those tables once.                                                                                                                             | Deliberate: an index adds a D1 write to every ingest batch, which costs more than one nightly scan. Revisit if those tables grow very large. |
| `quota_windows` per-second rows        | One row per source per active second (up to 86,400/day/source), now pruned at 32 days.                                                                                                                                                                     | Bounded by retention. A future release could prune second windows after one day to cut storage further.                                      |
| Dashboard reads                        | 15 statements per overview request, all indexed (see above).                                                                                                                                                                                               | No change.                                                                                                                                   |
| Unbounded fetch of an operator-set URL | The console's reachability check read whole response bodies.                                                                                                                                                                                               | Capped at 16 KiB. Fixed and tested.                                                                                                          |

Pricing is intentionally not copied here; compare the row counts and operation counts with current
Cloudflare pricing.

## Quota assumptions

This model assumes the existing per-source ingestion quotas (`maxEventsPerSecond`,
`maxEventsPerDay`) remain the actual limiting factor on write volume in practice - the dashboard
rollup writes are a fixed multiplier (roughly 14-16x, per the table above) on top of whatever
volume already passed those quotas and R2 storage. It does not model concurrent-write contention;
D1's transactional `batch()` (used for every write except the three retained legacy statements)
serializes a batch's writes, which bounds worst-case lock contention to one ingest batch at a time
per Worker isolate.

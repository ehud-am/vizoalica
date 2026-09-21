# Data Model: Page Breakdown and Actions Report

Phase 1 output for [plan.md](./plan.md). Entities come from the spec's Key Entities. Decisions and
rationale are in [research.md](./research.md).

## Page key (changed meaning, no schema change)

The string stored in `page_view` `data.page.url_path` and used as the `page_path` dimension.

| Part            | Rule                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Format          | `<normalized path>` or `<normalized path>#<normalized route>`                                       |
| Examples        | `/pricing`, `/#/pricing`, `/orders/:id`, `/app#/orders/:id/items`                                   |
| Route fragment  | Included only if it begins with `/`; its `?...` part is dropped; other fragments are ignored       |
| Normalization   | Trailing slash removed (not for `/`); identifier segments replaced by `:id`; max 1,024 characters   |
| Never contains  | `?`, query values, tokens, sign-in data, raw identifiers                                            |
| Equality        | Two views are the same page exactly when their page keys are equal                                  |

Older events keep the key they were recorded with (FR-005). Both forms can appear in one report
until old data expires.

## Action event (wire format)

CloudEvents type `com.vizoalica.action.v1`. Envelope fields are those of every event (`id`,
`source`, `time`, `vizoalicaconsent`, and so on). Data:

| Field                      | Type / limits                                  | Notes                                                       |
| -------------------------- | ---------------------------------------------- | ----------------------------------------------------------- |
| `page.url_origin`          | URI string, max 512                            | Origin of the page the action happened on                   |
| `page.url_path`            | string, max 1,024                              | A page key                                                  |
| `action.name`              | string, 1 to 80 characters                     | Redacted, whitespace-collapsed                              |
| `action.kind`              | `button` \| `link` \| `other`                  |                                                             |
| `action.destination`       | object, optional, links only                   | `{ url_origin, url_path }`; no query or fragment            |
| `visitor.anonymous_id`     | string, max 128                                | Same anonymous, consent-aware identity as page views        |
| `session.id`               | string, max 128                                |                                                             |

Schema: [contracts/action-event.v1.schema.json](./contracts/action-event.v1.schema.json).

**Validation at ingestion (fail closed).**

- Schema validation of the whole batch, as today.
- `page.url_path` and `destination.url_path` contain no `?`; both are re-normalized (idempotent).
- `action.name` is re-redacted and truncated; an empty result is replaced by the kind's fallback.
- Batches over the existing size, count, and quota limits are rejected before any storage.

## Storage: two new tables (added to the `0001_initial.sql` baseline)

### `dashboard_minute_actions`

One row per project, website, minute, page, action, kind, and destination.

| Column            | Type    | Notes                                                             |
| ----------------- | ------- | ----------------------------------------------------------------- |
| `project_id`      | TEXT    | Isolation boundary; every query filters on it                     |
| `source_id`       | TEXT    | The website                                                       |
| `minute_utc`      | TEXT    | `YYYY-MM-DDTHH:MM:00.000Z`                                        |
| `page_path`       | TEXT    | A page key                                                        |
| `action_name`     | TEXT    | 1 to 80 characters                                                |
| `action_kind`     | TEXT    | `CHECK` in (`button`, `link`, `other`)                            |
| `destination`     | TEXT    | `''` for non-links, otherwise `origin + path`                     |
| `event_count`     | INTEGER | `>= 0`; incremented by upsert                                     |

Primary key: all columns except `event_count` (it also serves per-website range reads).
Index: a project-wide variant `(project_id, minute_utc, source_id, page_path, action_name)`, matching the
existing dashboard tables.

### `dashboard_minute_action_visitors`

Distinct visitors per the same key, for the report's Visitors column.

| Column           | Type | Notes                                                                       |
| ---------------- | ---- | --------------------------------------------------------------------------- |
| `project_id`, `source_id`, `minute_utc`, `page_path`, `action_name`, `action_kind`, `destination` | as above | Same key columns |
| `visitor_digest` | TEXT | Keyed digest (existing `hmacDigest`); never the raw anonymous id            |
| `identity_kind`  | TEXT | `CHECK` in (`source-local`, `project-supplied`), as for page views          |

Primary key: all columns. `INSERT OR IGNORE`, so a visitor counts once per key per minute.
Index: `(project_id, source_id, page_path, action_name, minute_utc)` for the correlated distinct count.

### Existing tables reused, unchanged

- `dashboard_seen_events`: idempotency for action events (digest of project and event id, nonce, as
  now). Replayed or retried batches count once.
- `dashboard_minute_dimensions` (`dimension_kind = 'page_path'`): page views per page, used for the
  report's page-view column and the Rate.
- `dashboard_aggregate_watermarks`: availability state.

### Lifecycle

- **Retention:** rows older than 32 days are deleted by the existing daily job
  (`deleteExpiredDashboardData`), which gains both tables on `minute_utc`.
- **Deletion:** deleting a project or website removes its rows through the existing purge list
  (`dashboard_*` table list in `d1-repositories.ts`), which gains both tables.
- **Fresh-schema inspection:** both table names are added to `VIZOALICA_SCHEMA_TABLES` in
  `apps/deploy-cli/src/fresh-schema.ts`.

## Actions report (response of the admin endpoint)

Full contract: [contracts/actions-report-api.md](./contracts/actions-report-api.md).

| Field                | Meaning                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `scope`, `range`, `availability` | Same shapes as the overview                                                |
| `totals`             | `{ actions, uniqueUsers }` for the scope, range, and filters                             |
| `rows[]`             | Page-and-action rows: `page`, `action`, `kind`, `destination?`, `count`, `visitors`, `pageViews` |
| `other`              | `{ rows, count }` beyond the 100 shown; keeps totals exact                               |
| `actions[]`          | Per-action totals across pages: `action`, `kind`, `count`, `visitors`, `pages`           |
| `selection.page`     | When filtered by page: `{ path, views, actions }`                                        |

**Derived in the console (not stored):** Rate = `count / pageViews`, shown as "Actions per page
view"; it can exceed 100% because one view can produce several clicks.

## Console route (client state)

| Field       | Meaning                                                                              |
| ----------- | ------------------------------------------------------------------------------------ |
| `path`      | `analytics/actions`                                                                  |
| `websiteId` | Not used for this route (scope comes from the shared scope bar)                      |
| `params`    | `{ page?: string, action?: string }` parsed from `#/analytics/actions?page=...&action=...` |

Unknown params are ignored; malformed encodings fall back to no filter.

## Relationships

```text
Website (source) 1 ── * Page view ──> Page key (page_path dimension)
Website (source) 1 ── * Action event ──> dashboard_minute_actions (per minute, page key, action)
                                    └─> dashboard_minute_action_visitors (distinct visitors)
Report row = actions row joined to the page's views from the page_path dimension
```

There are no state transitions: all rows are append-and-increment aggregates that expire by
retention.

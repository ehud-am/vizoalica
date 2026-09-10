# Data Model: Dashboard Visual Refresh

## Model principles

- Dashboard data is derived only from accepted page-view events.
- Every row belongs to a project and source and is queryable only through the authenticated admin boundary.
- Time is stored as an ISO-8601 UTC minute such as `2026-09-09T12:34:00.000Z`; queries use `[start,end)`.
- Dimension counts are independent. No row stores a page, country, browser, and visitor together.
- Raw user-agent strings, IP addresses, Cloudflare bot fingerprints/scores, event IDs, visitor IDs, and request headers are never stored in dashboard tables.
- Aggregate, presence, and idempotency rows expire after 32 days: the supported 30-day range plus a two-day cleanup/clock-skew margin.

## D1 entities

### DashboardMinuteTotal

One total page-view counter for a project, source, and UTC minute.

| Field | Type | Rules | Purpose |
|-------|------|-------|---------|
| `project_id` | TEXT | Required; existing project | Authorization and all-sites scope |
| `source_id` | TEXT | Required; source in project | Website scope |
| `minute_utc` | TEXT | Required; UTC minute | Exact bounded range and trend grouping |
| `page_view_count` | INTEGER | Required; non-negative | Page-view total |

Primary key: `(project_id, source_id, minute_utc)`.

Indexes:

- `(project_id, source_id, minute_utc)` for one website.
- `(project_id, minute_utc, source_id)` for all websites.

Retention: delete when `minute_utc < current_complete_minute - 32 days`.

### DashboardMinuteDimension

One count for one independent normalized dimension value in a UTC minute.

| Field | Type | Rules | Purpose |
|-------|------|-------|---------|
| `project_id` | TEXT | Required | Authorization and scope |
| `source_id` | TEXT | Required | Website scope |
| `minute_utc` | TEXT | Required; UTC minute | Range selection |
| `dimension_kind` | TEXT | Required; enum | Selects requested ranking/distribution |
| `dimension_value` | TEXT | Required; bounded | Safe display/grouping value |
| `taxonomy_version` | INTEGER | Required; currently `1` | Makes classifier changes visible |
| `event_count` | INTEGER | Required; non-negative | Page-view count for this value |

Allowed `dimension_kind` values:

- `page_path`
- `country`
- `user_agent`
- `browser`
- `os`
- `device`
- `traffic`
- `referrer`

Primary key: `(project_id, source_id, minute_utc, dimension_kind, dimension_value, taxonomy_version)`.

Indexes:

- `(project_id, source_id, dimension_kind, minute_utc, dimension_value)` for one website.
- `(project_id, dimension_kind, minute_utc, source_id, dimension_value)` for all websites.

Validation:

- `page_path` is the existing query-free, fragment-free event path, capped by its event contract.
- `referrer` is the existing normalized origin or Unknown, capped by its event contract.
- `country` is ISO alpha-2, `T1`, or Unknown.
- `browser`, `os`, `device`, and `traffic` must match taxonomy v1.
- `user_agent` is a bounded family label with an optional major integer from 0 through 999.

Retention: 32 days. Access: Worker repository only; API returns grouped top values, never minute rows.

### DashboardMinuteVisitor

Presence of one project-scoped visitor digest for a source and minute. It supports exact distinct counts without exposing the identity.

| Field | Type | Rules | Purpose |
|-------|------|-------|---------|
| `project_id` | TEXT | Required | HMAC namespace and authorization |
| `source_id` | TEXT | Required | Website scope |
| `minute_utc` | TEXT | Required; UTC minute | Range selection/trend grouping |
| `visitor_digest` | TEXT | Required; fixed encoded HMAC length | Exact distinct count |
| `digest_version` | INTEGER | Required; currently `1` | Key/derivation evolution |
| `identity_kind` | TEXT | `source-local` or `project-supplied` | Explains the unique-user boundary without exposing identity |

Primary key: `(project_id, source_id, minute_utc, visitor_digest, digest_version, identity_kind)`.

Indexes:

- `(project_id, source_id, minute_utc, visitor_digest)` for one website.
- `(project_id, minute_utc, source_id, visitor_digest)` for all websites.

Derivation:

- Project supplied: `HMAC(VIZOALICA_ANALYTICS_DIGEST_SECRET, "project-v1\0" + project_id + "\0" + aggregation_identity)`.
- Source local: `HMAC(VIZOALICA_ANALYTICS_DIGEST_SECRET, "source-v1\0" + project_id + "\0" + source_id + "\0" + aggregation_identity)`.

The aggregation identity is the reviewed project `visitor_id` token claim when present; otherwise it is the SDK's source-local first-party anonymous ID. Separate HMAC domains prevent an accidental equality between the two modes. A digest is never returned, logged, or copied to R2.

Retention: 32 days.

### DashboardSeenEvent

Short-lived idempotency ledger used only while updating aggregates.

| Field | Type | Rules | Purpose |
|-------|------|-------|---------|
| `project_id` | TEXT | Required | Prevents cross-project equality |
| `event_digest` | TEXT | Required; HMAC | Detects a retried CloudEvent ID |
| `received_at` | TEXT | Required; UTC timestamp | Retention cleanup |
| `request_nonce` | TEXT | Nullable; must be null after committed batch | Selects rows newly inserted by the active transaction |
| `digest_version` | INTEGER | Required; currently `1` | Derivation evolution |

Primary key: `(project_id, event_digest, digest_version)`.

Index: `(received_at)` for bounded cleanup.

Derivation: `HMAC(VIZOALICA_ANALYTICS_DIGEST_SECRET, "event-v1\0" + project_id + "\0" + event.id)`.

State transition:

1. Unknown event digest -> insert with active request nonce.
2. Rows with active nonce -> contribute once to coalesced aggregate mutations.
3. Successful transaction -> set nonce to null.
4. Duplicate digest -> insert is ignored and it does not carry the active nonce, so it contributes zero.
5. Any statement failure -> D1 rolls back the whole batch.
6. Row older than 32 days -> delete; a retry outside the dashboard horizon may be accepted as new without changing any queryable range.

### DashboardAggregateWatermark

Describes expanded-dashboard coverage per source.

| Field | Type | Rules | Purpose |
|-------|------|-------|---------|
| `project_id` | TEXT | Required | Authorization |
| `source_id` | TEXT | Required; unique in project | Coverage owner |
| `expanded_from_utc` | TEXT | Required; UTC minute | Earliest minute with v1 expanded rollups |
| `last_completed_at` | TEXT | Required; UTC timestamp | Freshness/status display |
| `taxonomy_version` | INTEGER | Required | Classification provenance |

Primary key: `(project_id, source_id)`.

Migration `0005` creates a watermark at its effective minute for every existing source; source creation creates its watermark with the source timestamp. For a source that predates the migration, a request that reaches before `expanded_from_utc` is `incomplete`. A source created at or after its watermark has no earlier expected data. The implementation does not copy old hourly counts into minute rows and does not scan R2 to synthesize missing dimensions.

Retention: watermark remains while its source record remains.

## In-memory ingestion entity

### RequestAnalyticsContext

This object exists only between the Worker request adapter and aggregate repository. It is never serialized with `StoredEvent`.

| Field | Values |
|-------|--------|
| `country` | ISO alpha-2, `T1`, or `unknown` |
| `browser` | Taxonomy v1 browser enum |
| `os` | Taxonomy v1 OS enum |
| `device` | `desktop`, `mobile`, `tablet`, `other`, `unknown` |
| `traffic` | `bot`, `human`, `unknown` |
| `userAgentFamily` | Bounded normalized family and optional major |
| `taxonomyVersion` | `1` |
| `projectVisitorId` | Optional reviewed token claim; used only as HMAC input |

Raw inputs are read and discarded by the adapter. The object must not contain raw UA, IP, bot score, JA3/JA4, ASN, device model, or arbitrary headers.

## API entities

### AnalyticsRange

| Field | Type | Rules |
|-------|------|-------|
| `startUtc` | ISO timestamp | UTC minute, inclusive |
| `endUtc` | ISO timestamp | UTC minute, exclusive; no later than current complete minute |
| `interval` | enum | `hour` for duration <= 24 hours; otherwise `day` |
| `timezone` | enum | `UTC`; UI labels convert to operator local time |

Validation: `startUtc < endUtc`, duration <= 30 days, both minute-aligned.

### AnalyticsScope

| Field | Type | Rules |
|-------|------|-------|
| `projectId` | string | Existing authorized project |
| `sourceId` | string or null | Null means all non-deleted sources |
| `label` | string | Project or website display label |
| `identityMode` | enum | `source-local`, `project-supplied`, or `mixed` |

`identityMode` explains the unique-user boundary; it does not expose an identity.

### MetricPoint

`{ startUtc, pageViews, uniqueUsers }`. Points cover the requested interval in order. Missing buckets are returned as explicit zeros. Unique users are distinct within each point, so point values are not summed to obtain the range-wide unique total.

### RankedResult

`{ items: [{ label, count }], otherCount, total }`. Items are ordered by count descending then label ascending and limited to ten. Unknown is an ordinary explicit item and is never silently renamed Other.

### DistributionResult

`{ items: [{ label, count }], total }`. The server returns bounded categories plus Other/Unknown as applicable. Counts sum to `total`; the UI uses one shared largest-remainder formatter so displayed whole percentages sum to 100 when total is nonzero.

### AnalyticsAvailability

| Field | Type | Meaning |
|-------|------|---------|
| `state` | `complete`, `incomplete`, `processing`, `unavailable` | Overall document state |
| `lastCompletedAt` | ISO timestamp, optional | Latest successful expanded rollup observation |
| `availableFromUtc` | ISO timestamp, optional | Earliest complete expanded coverage when state is incomplete |
| `taxonomyVersions` | integer array | Versions included in the range |

The API returns one availability state for the coherent document. Empty complete data is `complete` with zero totals and empty rankings; it is not an error.

## Local preference entity

### ConsolePreferences

Stored at `preferences.json` beside the configured `local-operations.json`.

```json
{
  "schemaVersion": 1,
  "theme": "dark",
  "updatedAt": "2026-09-09T12:34:56.000Z"
}
```

Rules:

- `theme` is exactly `light` or `dark`; absence of the file means system preference.
- Unknown properties, invalid JSON, symlinks, and unsafe permissions are rejected.
- Writes use a new user-only temporary file, `chmod 0600`, and atomic rename.
- The preference file never contains remote URLs, credentials, session tokens, analytics values, or website data.
- A write failure does not revert the in-memory session choice or block analytics.

## Existing entity relationships

```text
Project 1 ── * Source
Project 1 ── * DashboardMinuteTotal * ── 1 Source
Project 1 ── * DashboardMinuteDimension * ── 1 Source
Project 1 ── * DashboardMinuteVisitor * ── 1 Source
Project 1 ── * DashboardSeenEvent
Source  1 ── 1 DashboardAggregateWatermark
```

All-sites analytics joins aggregate rows to `sources` and includes active and disabled sources while excluding deleted sources. A website-specific query first verifies `source.project_id == projectId` and `source.status != deleted`.

# Contract: Campaigns report

`GET /v1/admin/projects/:projectId/analytics/campaigns`

Authorization, range (`start`, `end`, 30-day cap, UTC), `source_id` and role/scope handling are identical to
`/analytics/actions` and `/analytics/custom-events`. Optional exact filters: `source`, `medium`, `campaign`
(each 1 to 64 characters; anything else, including an empty value, is `400 invalid_request`). Response is `no-store`.

```json
{
  "scope": { "projectId": "...", "sourceId": null, "label": "...", "identityMode": "source-local" },
  "range": { "startUtc": "...", "endUtc": "...", "interval": "day", "timezone": "UTC" },
  "totals": { "pageViews": 0, "uniqueUsers": 0, "allPageViews": 0 },
  "trend": [{ "startUtc": "...", "pageViews": 0 }],
  "sources":   { "items": [{ "label": "newsletter", "count": 0, "visitors": 0 }], "otherCount": 0 },
  "mediums":   { "items": [], "otherCount": 0 },
  "campaigns": { "items": [], "otherCount": 0 },
  "rows": [{ "source": "newsletter", "medium": "email", "campaign": "spring-sale", "count": 0, "visitors": 0 }],
  "other": { "rows": 0, "count": 0 },
  "availability": { "state": "complete", "taxonomyVersions": [1] }
}
```

- An empty label means "not set" (the console and tools write "(not set)").
- `totals.pageViews` is the campaign page views of the selection; `allPageViews` is all page views in the same
  range and scope, so a share can be shown. Filters narrow `totals`, `trend` and `rows`; the rankings are
  narrowed by the other two filters only, so choosing a source still lists all sources.
- Bounds: 20 items per ranking, 50 rows. `sum(items.count) + otherCount` equals the selection's total for each
  ranking; `sum(rows.count) + other.count` equals `totals.pageViews`.
- `availability.state` is `incomplete` with `availableFromUtc` when the range starts before campaign reporting
  began.
- `503 database_update_needed` from a Worker whose database has not had migration 0005 yet.
- 404 for a project or website outside the caller's scope; 404 from a Worker that predates the feature (the
  console and MCP translate that into "update the backend").

## Console proxy

`GET /api/projects/:projectId/analytics/campaigns?start&end&source_id&source&medium&campaign` returns the
same body.

## MCP tool

`get_campaigns({ range?, start?, end?, website?, source?, medium?, campaign?, environment? })`, read-only, output
first line `Environment: ...`, then totals, trend summary, rankings, rows, and availability.

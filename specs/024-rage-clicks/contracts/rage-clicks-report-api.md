# Contract: rage clicks report

`GET /v1/admin/projects/{project}/analytics/rage-clicks?start&end[&source_id][&page][&action]`

- Auth, scope and range rules as the actions report. `page` (at most 1024) and `action` (at most 80) are exact
  matches; an empty value, an over-limit value, or a control character is `400 invalid_request`. A bad range is
  `400 invalid_range`.
- `404 not_found` for an unknown project or website, or a repository without the report.
- `503 database_update_needed` when the database lacks migration 0007.
- `200`, `cache-control: no-store`:

```json
{
  "scope": { "projectId": "p1", "sourceId": null, "label": "All websites", "identityMode": "source-local" },
  "range": { "startUtc": "...", "endUtc": "...", "interval": "hour", "timezone": "UTC" },
  "totals": { "bursts": 14, "clicks": 120 },
  "trend": [{ "startUtc": "...", "bursts": 2 }],
  "rows": [{ "page": "/checkout", "action": "Pay now", "kind": "button", "destination": "https://...", "count": 9, "clicks": 60 }],
  "other": { "rows": 2, "count": 2 },
  "availability": { "state": "complete", "taxonomyVersions": [1] }
}
```

`rows` has at most 50 entries, most bursts first; `sum(rows.count) + other.count = totals.bursts`. `clicks` is the
sum of ordinary click events on the same page, control and destination in the range; `totals.clicks` is the sum
over the selection. `destination` is present for links only.

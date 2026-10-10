# Contract: Actions report API

Two hops, same shape, as the existing overview: the console calls the **local operations API**,
which calls the **Worker admin API** with the administrator credential. The browser never sees the
credential. Both hops are read-only (`GET`), return aggregates only, and are `Cache-Control: no-store`.

## Worker admin API

```text
GET /v1/admin/projects/{projectId}/analytics/actions
    ?start=<UTC minute>&end=<UTC minute>
    [&source_id=<website id>]
    [&page=<page key>]
    [&action=<action name>]
```

| Parameter    | Rules                                                                                                       |
| ------------ | ----------------------------------------------------------------------------------------------------------- |
| `start`, `end` | Required. Same parser and limits as the overview: UTC minute boundaries, at most 30 days, `start < end`. |
| `source_id`  | Optional. Limits to one website of the project; unknown or deleted website returns 404.                    |
| `page`       | Optional exact match on a page key. At most 1,024 characters, no control characters.                        |
| `action`     | Optional exact match on an action name. At most 80 characters, no control characters.                       |

Authorization and project isolation are those of every `/v1/admin/` route (existing admin
authentication). Every query is constrained by `project_id` first.

### Responses

`200`:

```json
{
  "scope": { "projectId": "p1", "sourceId": null, "label": "All websites", "identityMode": "source-local" },
  "range": { "startUtc": "2026-09-20T00:00:00.000Z", "endUtc": "2026-09-21T00:00:00.000Z", "interval": "hour", "timezone": "UTC" },
  "totals": { "actions": 1280, "uniqueUsers": 342 },
  "rows": [
    {
      "page": "/#/orders/:id",
      "action": "Download invoice",
      "kind": "button",
      "count": 214,
      "visitors": 97,
      "pageViews": 640
    },
    {
      "page": "/pricing",
      "action": "Start free trial",
      "kind": "link",
      "destination": "https://app.example.com/signup",
      "count": 190,
      "visitors": 151,
      "pageViews": 2100
    }
  ],
  "other": { "rows": 37, "count": 96 },
  "actions": [
    { "action": "Start free trial", "kind": "link", "count": 260, "visitors": 190, "pages": 3 }
  ],
  "selection": { "page": { "path": "/pricing", "views": 2100, "actions": 411 } },
  "availability": { "state": "complete", "lastCompletedAt": "2026-09-20T23:59:04.112Z", "taxonomyVersions": [1] }
}
```

Guarantees:

- `rows` has at most 100 entries, ordered by `count` descending, then `page`, then `action`.
  `other` is exact: `sum(rows.count) + other.count == totals.actions` for the applied filters.
- `actions` has at most 50 entries, ordered by `count` descending, across all pages in scope
  (ignores the `page` filter, honours the `action` filter).
- `selection.page` is present only when `page` is given; its `views` is the page's view count for the
  same range and scope; `actions` is the page's action total.
- `destination` is present only for `link` rows that have one; it never contains a query or fragment.
- No visitor identifier, digest, session id, event id, or raw event appears anywhere.
- `pageViews` is `0` when the page key has no page views in range (for example older data recorded
  under a different key); the console shows a dash for the Rate then.
- `availability` uses the overview's states.

Errors (same envelope as the overview):

| Status | Body                                                     | When                                          |
| ------ | -------------------------------------------------------- | --------------------------------------------- |
| 400    | `{ "error": "invalid_range", "field": "start"\|"end", "message": "..." }` | Range invalid                 |
| 400    | `{ "error": "invalid_request" }`                         | Bad `page` or `action` value                  |
| 401/403| Existing admin authentication errors                     | Missing or rejected credential                |
| 404    | `{ "error": "not_found" }`                               | Unknown project or website                    |

## Local operations API

```text
GET /api/projects/{projectId}/analytics/actions?start&end[&source_id][&page][&action]
```

Validates identifiers with the existing safe-id rules and the range with `parseAnalyticsRange`, then
proxies to the Worker and returns the body unchanged. Maps `401/403` to `unauthorized`, `404` to
`not_found`, `400` to the range or `invalid_request` error, anything else to `unavailable`, exactly
as `analyticsOverview` does. Requires the same browser session as every `/api/` route.

## Console client

```ts
getAnalyticsActions(projectId, sourceId, startUtc, endUtc, { page, action }, signal): Promise<ActionsReport>
```

Types mirror the JSON above. The console page URL carries the filters:
`#/analytics/actions?page=%2Fpricing&action=Start%20free%20trial`.

## Compatibility

New endpoint only; no existing endpoint or field changes. A console newer than its Worker receives
`404` for this route and shows the page's unavailable state rather than failing the other pages.

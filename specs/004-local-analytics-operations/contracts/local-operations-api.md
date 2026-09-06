# Local Operations API Contract

The local operations API binds only to loopback and serves the web console. It uses a local, short-lived session cookie, validates the request origin, sends no permissive CORS headers, and never returns the remote administrator credential, Cloudflare credentials, signing secrets, issued ingest tokens, visitor digests, raw events, or raw URL query values.

## Website operations

| Method and path | Request | Success | Rules |
| --- | --- | --- | --- |
| `GET /api/projects` | None | Projects with safe website counts | Safe metadata only. |
| `POST /api/projects` | `{ "name": string }` | Created project | Name is validated; remote audit is recorded. |
| `GET /api/projects/{projectId}/websites` | None | Website list | Project-scoped safe metadata. |
| `POST /api/projects/{projectId}/websites` | `{ "name": string, "allowedOrigins": string[] }` | Created website and integration snippet | Generates a public source key, not a secret token. |
| `PATCH /api/projects/{projectId}/websites/{websiteId}` | Partial `name`, `allowedOrigins`, or supported status | Updated website | Cannot weaken origin validation or cross project boundaries. |
| `DELETE /api/projects/{projectId}/websites/{websiteId}` | None | `{ "status": "deleted" }` | Soft delete: stops collection but preserves history and audit evidence. |
| `GET /api/projects/{projectId}/websites/{websiteId}/snippet` | None | Safe integration snippet and token-issuer guidance | No issued token or secret. |

## Analytics operation

`GET /api/projects/{projectId}/websites/{websiteId}/analytics?window=24h|7d|30d`

Returns project/website IDs, the requested window, `startUtc`, `endUtc`, `pageViews`, `uniqueUsers`, and `availability`. `availability` is `complete`, `processing`, or `unavailable`; a `processing` response includes `lastCompletedAggregateAt` and clearly labels its totals as incomplete, while an `unavailable` response returns no totals. The request rejects unknown windows, invalid IDs, unknown projects/websites, and cross-project website references before querying aggregates. It never falls back to raw R2 scanning.

## Remote Worker extensions

The local API calls protected Worker administrative operations with the existing remote admin credential. The Worker must add only fixed, parameterized, project-scoped operations required by the endpoints above: website update, soft deletion, safe snippet metadata, and three fixed analytics summaries. Every mutation records an administrative audit entry.

The shared local API is intentionally the future integration surface for the MCP client. No MCP endpoint, tool, or transport is implemented by this iteration.

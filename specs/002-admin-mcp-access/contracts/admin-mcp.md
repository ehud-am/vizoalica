# Admin and MCP Contract

All endpoints require HTTPS and `Authorization: Bearer <administrator credential>`. They accept
and return JSON, send no CORS headers, and return the same generic unauthorized response for a
missing or invalid credential.

## Administration Operations

| Operation | Request | Successful result |
| --- | --- | --- |
| Create project | Name and optional stricter limits | Project ID and safe metadata |
| List projects | None | Safe project metadata and source counts |
| Create source | Project ID, exact origins, optional stricter limits | Source ID, public source key, origins, status, effective limits |
| List sources | Project ID | Safe source metadata for that project |
| Disable source | Project and source IDs | Disabled source status |

Creation rejects invalid names, unknown projects, non-exact origins, duplicate keys, and weaker
than conservative limits. Disabling rejects sources outside the named project.

## MCP Endpoint

MCP uses standard stateless Streamable HTTP. It authenticates every request before initialization
or tool discovery and exposes no prompts, resources, raw data, or write tools.

### `list_projects_and_sources`

Takes no arguments. Returns configured projects and sources with IDs, names, allowed origins,
statuses, and effective safe limits. It excludes secrets, visitor/session data, raw events, and

### `get_page_view_counts`

| Input | Rule |
| --- | --- |
| `project_id` | Existing project ID. |
| `source_id` | Existing source belonging to that project. |
| `start_date` | ISO calendar date. |
| `end_date` | ISO calendar date, not before start and no more than 31 days later. |

Returns safe source metadata, date range, total page views, and counts by date/path. Invalid,
unknown, cross-project, or overlong requests fail without raw-event access or unbounded queries.

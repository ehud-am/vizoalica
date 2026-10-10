# Data Model: Secure Admin and MCP Access

## Administrator Credential

- Operator-managed Worker secret; bearer-authenticates non-browser admin and MCP clients.
- Never persisted, returned, logged, accepted by ingestion, or stored in audits.
- Rotation replaces the prior credential immediately.

## Project

Existing entity with controlled creation: system-generated stable ID, required bounded name,
production mode, conservative retention, and a default policy. One project has many sources.

## Website Source

Existing entity extended with a source-specific policy reference.

| Field | Rules |
| --- | --- |
| `id` | System-generated stable opaque identifier. |
| `project_id` | Must reference the requested project. |
| `public_source_key` | Cryptographically generated unique public routing identifier. |
| `allowed_origins` | One or more exact normalized `http`/`https` origins; no wildcards, paths, queries, fragments, or credentials. |
| `status` | Starts `active`; may transition to terminal `disabled`. |
| `quota_policy_id` | Conservative source policy, overriding the project fallback. |

## Aggregate Page-View Result

Transient source-scoped result: project/source IDs, inclusive ISO date range of at most 31 days,
total page views, and counts grouped by date and page path. It excludes raw events, visitor IDs,
sessions, tokens, referrers, and raw queries.

## Administrative Audit Entry

Append-only record with a server time, fixed operation, allowed/denied outcome, optional known
project/source scope, and a fixed safe reason code. It forbids auth values, bodies, raw URLs,
visitor/session IDs, and event data.

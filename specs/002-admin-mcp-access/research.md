# Research: Secure Admin and MCP Access

## Decision: Use a separate administrator secret

**Rationale**: Ingestion tokens are visitor-scoped. Reusing their signing secret for
administration would collapse unrelated authorization boundaries. A Worker-only secret, compared
in constant time, is the smallest secure operator model and fails closed when absent.

**Alternatives considered**: Browser credentials, user accounts, and role-based access add
unnecessary identity scope. Reusing the ingestion secret weakens separation of duties.

## Decision: Use protected fixed administration operations

**Rationale**: Project/source create, list, and disable operations are scriptable without a UI and
can validate, scope, and audit each action.

**Alternatives considered**: Manual D1 commands bypass validation and auditability. Generic
database administration cannot enforce product privacy, isolation, and quota limits.

## Decision: Use stateless authenticated MCP Streamable HTTP

**Rationale**: The standard MCP transport works with compatible clients without stateful sessions.
Bearer authentication on initialize, discovery, and every tool call protects capabilities and data.

**Alternatives considered**: A custom JSON endpoint is not MCP. Browser CORS and server-side MCP
sessions add attack surface without MVP value.

## Decision: Expose exactly two read-only MCP tools

**Rationale**: Listing websites and retrieving page-view aggregates demonstrates value with fixed,
bounded validation and query paths.

**Alternatives considered**: Raw search, arbitrary SQL, exports, funnels, and write tools increase
privacy risk, cost, and authorization complexity.

## Decision: Query existing D1 rollups with source policies

**Rationale**: Existing dashboard rollups contain project/source/date/type/path counts. A 31-day
cap and index bound reads. Per-source policies cap one website at 100 events/day and seven-day raw
retention by default.

**Alternatives considered**: R2 reads expose raw data and are unnecessary. Project-only quotas do
not isolate sources.

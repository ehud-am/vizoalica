# Research: Local Analytics Operations — Web Console Slice

## Decision: Keep the existing Worker, D1, and R2 production data plane

**Rationale**: The repository already uses the Worker for ingestion and administration, D1 for project/source configuration and page-view rollups, and R2 for immutable raw batches. Extending that topology avoids a continuously hosted console and additional services. D1 is suitable for small, indexed configuration and aggregate queries and scales to zero.

**Alternatives considered**:

- Query raw R2 batches from the operator's machine: rejected because cost and latency grow with retained data, raw visitor data would leave the backend boundary, and analytics would no longer be backend aggregation.
- Workers KV: rejected because its eventual consistency and per-key write constraints make it a poor counter store.
- Durable Objects: rejected for this slice because serializable counters do not justify another managed component at the current scale.
- R2 SQL/Data Catalog: rejected because the three bounded counters do not justify query scanning or catalog/compaction cost.

## Decision: Use hourly D1 aggregates for all three fixed rolling windows

**Rationale**: The requested windows are rolling 24-hour, 7-day, and 30-day periods. Store one hourly page-view counter per website and one opaque visitor-digest presence row per website/hour. For a query, sum counters and count distinct digests across the last 24, 168, or 720 UTC hourly buckets. This is exact for the defined window and bounded by a maximum of 720 buckets.

**Alternatives considered**:

- Daily aggregates: rejected because they cannot exactly express the requested rolling 24-hour window without either approximation or raw-event reads.
- Approximate cardinality: deferred; exact deduplication is simpler for the initial scale and avoids explaining approximation error to operators.

## Decision: Keep anonymous identity private through keyed digests

**Rationale**: At aggregation time, derive a non-reversible keyed digest from the accepted anonymous visitor identifier and store only the digest internally. The browser and local API return only `uniqueUsers` totals. A repeated view can therefore be counted once across the selected range without disclosing an identifier.

**Alternatives considered**:

- Return visitor/session IDs to the console: rejected by the privacy principle.
- Count daily totals without cross-day deduplication: rejected because it overstates unique users for 7-day and 30-day windows.

## Decision: Two local clients will share one local API; build only the web client now

**Rationale**: The React console is the direct human interface. A loopback Node API owns remote credentials, input validation, and the remote Worker client. The deferred MCP server will use the same API rather than recreate business logic or authorization. This satisfies the broader architecture while limiting this delivery to a useful human-operated console.

**Alternatives considered**:

- Browser directly calls the Worker: rejected because it would expose the administrator credential to browser code and require CORS.
- Build MCP first or alongside the console: deferred to keep the first slice small.

## Decision: "Token" in the console means public source key, not a durable browser secret

**Rationale**: Creating a website generates a public source key for the existing embed snippet. Ingest authorization remains a short-lived JWT issued by that website's own backend. The console will provide the snippet and token-issuer guidance, but will never place a signing secret or long-lived ingest token in client-side JavaScript.

**Alternatives considered**:

- Generate a static browser token in the console: rejected because browser-distributed credentials are public and a durable secret violates the existing security model.
- Have Vizoalica host each website's token issuer: out of scope and contrary to the minimal infrastructure goal.

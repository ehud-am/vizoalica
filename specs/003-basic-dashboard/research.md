# Research: Basic Analytics Dashboard

## Decision: Store daily anonymous-user aggregates

**Rationale**: Existing rollups count page views but cannot answer unique users. A daily,
project/source-scoped aggregate can support fixed range totals without returning or querying raw
visitor identities.

**Alternatives considered**: Reading R2 raw events was rejected for privacy and cost. Returning
anonymous IDs was rejected because dashboard users need totals, not identities.

## Decision: Serve a minimal authenticated HTML dashboard

**Rationale**: A server-delivered page and fixed data endpoint are the smallest usable dashboard
without a separate frontend application, account system, or public browser API.

**Alternatives considered**: A public dashboard or external UI was rejected because the existing
administrator credential already provides the required limited access control.

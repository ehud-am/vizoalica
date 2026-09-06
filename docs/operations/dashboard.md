# Local Analytics Console

The analytics console is a locally operated React application backed by the loopback operations
API. It shows only unique anonymous users and accepted page views for rolling 24-hour, seven-day,
or 30-day windows.

It never displays visitor IDs, session IDs, raw events, raw URL query values, or credentials. A
dashboard request is denied unless its project and source belong together and it includes the
administrator bearer credential. That credential stays in the loopback API process and is never
returned to browser code.

Page views count accepted page-view aggregates. Users count distinct anonymous visitors within the
selected half-open UTC period. Disabled and soft-deleted sources retain historic aggregates but
cannot ingest new data. Processing and unavailable states are visibly distinct, and unavailable
results never show stale totals as current.

See [Local analytics operations](./local-analytics.md) for setup, credential lifecycle, recovery,
portability, cost, teardown, and the future MCP boundary.

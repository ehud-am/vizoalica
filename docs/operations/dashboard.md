# Local Analytics Console

The analytics console is a locally operated React application backed by the loopback operations
API. Its Overview page shows one coherent, privacy-safe analytics result for one scope (all of a
project's websites, deduplicated, or exactly one website) and one time range at a time: five
rolling presets (last 6/12/24 hours, last 7/30 days) or a minute-aligned custom range up to 30
days, applied through one accessible time-range selector. It never displays visitor IDs, session
IDs, raw events, raw URL query values, or credentials.

A dashboard request is denied unless its project (and source, when scoped to one website) belong
together and it includes the administrator bearer credential. That credential stays in the
loopback API process and is never returned to browser code.

Totals, trend, top-ten rankings (with an explicit "Other" remainder), and OS/browser/device/bot
distributions are all read from indexed D1 aggregates for the applied scope and range - never a
raw-event scan. Disabled and soft-deleted sources retain historic aggregates but cannot ingest new
data; a disabled website's history remains selectable in the console. Processing and unavailable
states are visibly distinct, and unavailable results never show stale totals as current. A range
that starts before a project's data became available under this schema is marked explicitly
incomplete rather than presented as the whole picture.

The console follows the operating system's light/dark theme by default; an explicit choice from
its theme toggle is saved locally and takes priority afterward.

See the [dashboard tour](./local-analytics.md#dashboard-tour) for what each part of the screen
shows, and [Local analytics operations](./local-analytics.md) for setup, credential lifecycle,
recovery, portability, cost, teardown, and the future MCP boundary.

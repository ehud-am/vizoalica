# Release Readiness: Local Analytics Operations

**Review date**: 2026-09-06
**Decision owner**: Human maintainer (go/no-go not delegated to AI)

## Alignment review

| Area | Evidence | Result |
| --- | --- | --- |
| Scope | Web console and shared loopback API implemented; MCP transport remains deferred and documented | Aligned |
| Privacy | Browser responses expose totals and safe source metadata only; keyed visitor digests remain in D1 | Aligned |
| Authorization | Exact loopback host/origin, expiring HttpOnly session, protected Worker calls, project/source scoping | Aligned |
| Data model | Hourly page views, hourly visitor presence, and terminal soft deletion match the design | Aligned |
| API contract | Fixed windows, safe errors, lifecycle routes, snippet, and operational status are covered by contract tests | Aligned |
| Accessibility | Semantic controls, visible focus, live messaging, reduced motion, and responsive reflow are covered | Aligned, human screen-reader sign-off remains a release-owner gate |
| Operations | Setup, credential lifecycle, cost, backup/recovery, export, teardown, and MCP boundary documented | Aligned |

## Contrarian AI QA review

The review assumed hostile input and operator mistakes rather than a happy path.

1. **Could a browser steal the Worker credential?** No response or snippet includes it, the browser
   calls only relative `/api` paths, and the local API injects authorization server-side.
2. **Could another site on the machine call the loopback API?** Requests require the exact
   configured console origin and an unguessable, expiring, HttpOnly, SameSite session cookie.
3. **Could a manipulated project/source pair leak another tenant?** IDs are validated locally and
   every Worker lookup/query binds both project and source. Negative tests cover the mismatch.
4. **Could “delete” merely disable and later resurrect a source?** The migration expands the
   allowed state, the repository writes `deleted`, and update/status transitions reject deleted
   rows. Historic aggregates and audit evidence remain.
5. **Could analytics silently scan raw events or leak visitor identifiers?** The route has only the
   bounded aggregate repository dependency. Responses are reconstructed from explicit safe fields.
   Visitor presence is HMAC-keyed and tests reject digest/raw fields.
6. **Could an interrupted mutation be mistaken for success?** Only completed remote responses are
   reported as success. Transport/5xx failures produce `remote_unavailable` with `retry_safely`.
7. **Could stale totals appear current?** The unavailable UI removes totals and explicitly says no
   stale data is shown; processing is labeled incomplete with the last completed time when known.
8. **Could the layout become unusable at narrow widths or by keyboard?** Native controls, visible
   focus, status semantics, reduced motion, and a single-column responsive breakpoint are present
   and tested. A human release owner must still perform final assistive-technology validation.

## Release recommendation

The automated release gates are satisfied: functionality, formatting, type checking, all 111
tests, production builds, dependency audit, and the unchanged repository-wide coverage thresholds
pass. Coverage is 96.92% for lines and 90.5% for branches. The feature is ready for the human
maintainer's release review; final screen-reader acceptance and the go/no-go decision remain with
that maintainer.

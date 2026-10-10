# Quickstart: Secure Admin and MCP Access

## Prerequisites

- Deployed Vizoalica Worker with migrations applied.
- Administrator credential configured as a Worker secret.
- HTTPS administration or MCP client with bearer authentication.

## Validate Administration

1. Create a project with the protected operator operation; confirm it returns an ID, not a secret.
2. Create a source with only `https://analytics.example`; confirm IDs, public source key, active
   status, at most 100 events/day, and seven-day retention.
3. Create a second project/source and confirm identifiers are distinct and source listing is
   project-scoped.
4. Retry an operation with no or incorrect credential; confirm generic denial and no change.
5. Disable a source; confirm its ingestion is rejected while another source remains active.

## Validate MCP

1. Connect with the administrator credential and confirm only the two documented tools are listed.
2. Confirm listing returns safe configuration but no secrets, visitor data, sessions, raw events,
   or audit records.
3. Send accepted page views for one source, then query a seven-day range and confirm totals and
   date/path counts.
4. Try cross-project, 32-day, and unauthenticated requests; confirm all are denied.

## Validate Audit and Cost Bounds

1. Inspect one allowed and one denied audit entry; confirm only safe fixed fields are stored.
2. Confirm source limits and the 31-day MCP cap remain active before exposing operator tooling.

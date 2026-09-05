# Changelog

All notable changes to Vizoalica are documented in this file.

## [0.1.2] - 2026-09-03

### Added

- Protected non-UI administration for creating, listing, and disabling isolated analytics sources.
- Read-only MCP tools for listing configured sources and querying bounded page-view aggregates.
- Source-level conservative quota defaults, privacy-safe administrative audit records, and the
  required administrator-secret deployment checks.

### Security

- Administrative and MCP access require a separate Worker-managed administrator credential.
- MCP access is read-only, has no browser CORS, accepts no arbitrary queries, and limits aggregate
  page-view queries to a single source and 31 calendar days.

## [0.1.0] - 2026-08-31

### Added

- Self-hosted Cloudflare ingestion Worker with D1 configuration and rollups, R2 raw-event storage,
  signed ingestion tokens, quotas, and privacy filtering.
- Browser SDK for asynchronous page-view and custom-event collection.
- Shared CloudEvents and JSON Schema contracts, plus privacy utilities.
- Explicit operator-owned deployment commands: `deploy:check`, `deploy:apply`, and
  `deploy:verify`. Releases never deploy to Cloudflare automatically.

### Security

- Production ingestion requires short-lived server-issued tokens; demo mode is disabled by default.
- URL/query redaction, sensitive-data filtering, and bounded event/property limits are enforced
  before storage.

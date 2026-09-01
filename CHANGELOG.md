# Changelog

All notable changes to Vizoalica are documented in this file.

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

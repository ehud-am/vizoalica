# Changelog

All notable changes to Vizoalica are documented in this file.

## [0.3.0] - 2026-09-07

### Added

- Native OneCLI credential-provider integration for Cloudflare deployments, with explicit
  OneCLI project, agent, connection, account, and environment selection.
- A typed deployment CLI covering configuration, offline planning, non-mutating preflight,
  explicitly approved apply, bounded health verification, and local status reporting.
- Short-lived preflight receipts, canonical plan and configuration digests, private deployment
  artifacts, and allowlisted 90-day deployment audit evidence.
- A versioned Vizoalica Cloudflare deployment skill that preserves the human approval boundary.
- Separate client-machine setup paths for local analytics and administration with OneCLI gateway
  injection or a direct operator-owned credential file.

### Changed

- Existing `deploy:check`, `deploy:apply`, and `deploy:verify` entry points now route explicit
  deployment profiles through the typed CLI while retaining the no-profile Cloudflare-native path.
- Expanded automated coverage to 165 tests with 96.48% line and 90.24% branch coverage.
- Clarified that Cloudflare infrastructure deployment, website JavaScript integration, and local
  analytics/admin client authentication are independent operational concerns.

### Security

- OneCLI deployments strip ambient Cloudflare authentication, never fall back to another provider,
  validate connection grants and account identity before mutation, and redact bounded upstream
  output.
- Apply requires the exact reviewed plan ID and a current receipt bound to the actor, provider,
  connection, account, profile, and Wrangler configuration.
- OneCLI-backed client machines can retain only a `onecli-managed` placeholder locally while the
  gateway injects the Worker administrator credential at request time.

### Migration

- No D1 schema or browser snippet migration is required. Existing Cloudflare-native deployments
  remain supported. OneCLI adoption is opt-in through a new non-secret deployment profile or the
  documented local-client setup path.

## [0.2.0] - 2026-09-06

### Added

- On-demand React analytics console with 24-hour, 7-day, and 30-day page-view and unique-user
  summaries.
- Loopback-only operations API for secure project and website management without exposing remote
  administrator credentials to the browser.
- Hourly D1 page-view and privacy-safe visitor-presence aggregates, website lifecycle operations,
  integration snippets, operational status, and audit evidence.
- Local operations, backup, recovery, export, migration, cost, accessibility, and teardown
  documentation.

### Changed

- Expanded automated coverage to 111 tests and enforced repository-wide minimums of 90% for line
  and branch coverage.
- Updated the test toolchain to patched releases and added browser interaction coverage.

### Security

- Restricted the local operations service to exact loopback host and origin checks with expiring,
  HttpOnly, SameSite sessions.
- Kept visitor identifiers out of analytics responses by storing only keyed presence digests and
  returning bounded aggregate fields.

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

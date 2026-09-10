# Changelog

All notable changes to Vizoalica are documented in this file.

## [0.4.0] - 2026-09-09

### Added

- A full analytics dashboard on the Overview page: one coherent, privacy-safe result per scope
  (all of a project's websites, deduplicated, or one website) and time range, with page-view/
  unique-user totals, an hourly/daily trend chart with an exact-value table alongside it, top-ten
  rankings with an explicit "Other" remainder for pages/countries/user agents/referrers, and
  operating-system/browser/device/human-or-bot distributions.
- A time-range selector: five rolling presets (last 6/12/24 hours, last 7/30 days) plus a custom,
  minute-aligned range up to 30 days, applied through one accessible popover with inline
  validation and no request issued for an invalid or unapplied draft.
- Light/dark theme, following the operating system by default; an explicit choice from the new
  theme toggle persists to a local, permission-locked preferences file and takes priority on every
  later launch.
- An original Vizoalica brand identity (a magnifying-glass mark, in icon/lockup/monochrome/favicon
  variants) replacing the placeholder letter mark, and a footer showing the current year, product
  name, and release version on every console page.

### Changed

- Classification of country, browser, operating system, device, and bot/human traffic now happens
  once at ingest, from trusted Worker-provided signals only, and is stored as bounded taxonomy
  values - never the raw User-Agent, IP, or other request metadata that produced them.
- The browser SDK's default anonymous ID now persists in consent-eligible first-party storage,
  namespaced per website, instead of being regenerated every session; an explicitly configured ID
  still always takes precedence, and storage failures fall back to a safe ephemeral ID.

### Database

- Migration `0005_dashboard_visual_refresh.sql`: adds minute-granularity totals, eight independent
  classification dimensions, visitor-presence tracking, an event-digest idempotency ledger, and a
  per-source completeness watermark, plus their supporting indexes. Purely additive - no existing
  table is modified or dropped. See
  [the deployment guide](docs/operations/cloudflare.md#4-apply-all-migrations-and-deploy) for the
  secret it introduces, the daily cleanup it enables, and rollback limits.

### Security

- Every classification value is drawn from a fixed, non-reversible taxonomy before it ever reaches
  storage; end-to-end tests prove a spoofed `CF-IPCountry`, a raw or oversized User-Agent, and
  forwarded-IP-style headers never reach D1, R2, logs, or the response body.
- Visitor presence uses a keyed HMAC digest with separate project-wide and per-source-domains, so a
  reviewed project-wide pseudonym and a source-local pseudonym for the same visitor are
  unrelatable. The new local theme-preference store enforces the same allowlisted-schema,
  `0600`-permission, symlink-refusing pattern as the existing credential file, and structurally
  cannot carry a credential.

### Upgrade

- Apply every migration through `0005_dashboard_visual_refresh.sql`; it is additive only. The
  existing per-source `24h`/`7d`/`30d` analytics endpoint is retained unchanged as a one-release
  compatibility adapter.
- A time range that starts before your deployment's migration-`0005` watermark is reported as
  explicitly incomplete rather than silently partial; this is expected immediately after upgrading
  and resolves on its own as new data accumulates.
- No operator action is needed for the new analytics digest secret or the daily cleanup Cron
  Trigger - both are provisioned automatically by the existing `deploy:configure`/`deploy:apply`
  flow.

## [0.3.1] - 2026-09-09

### Fixed

- Reworked first-run Cloudflare installation into ordered steps with success checks, exact token
  permission labels, both Worker secrets before preflight, live resource comparison, all four
  migrations, and current-schema SQL.
- Added a complete Pages website recipe and copyable token Function, standalone browser SDK build,
  consent-before-load demo, and content-aware website verification.
- Local console snippets now include the configured Worker endpoint, hosted SDK origin, project,
  public source key, token URL and consent state, with source ID visible for token issuer setup.
- Local API accepts normal same-origin browser GETs via Referer when Origin is absent while
  rejecting foreign, missing and malformed provenance.
- OneCLI-wrapped Wrangler receives a non-secret initialization placeholder after ambient credential
  removal; provider operations now allow 60-second reads, 120-second dry runs and 300-second
  migrations/deployments.
- Documented exact generic vault fields, supported local gateway override, Pages deployment modes,
  the external upload-JWT collision, inexpensive operation and all 18 first-run findings.

### Security

- Patched vulnerable development dependency resolutions for sharp and js-yaml while retaining the
  tested Wrangler version.

### Upgrade

- No new database migration. Apply every existing migration through `0004_local_operations.sql`.
- Restart the local API and console, rebuild/copy the SDK for your website, and redeploy its Function
  if adopting the example. Preserve operator-owned configuration and secrets.
- OneCLI Pages JWT rewriting remains an external limitation; use the explicitly documented native
  Pages route or obtain a verified gateway fix. No automatic credential fallback is introduced.

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

# Changelog

All notable changes to Vizoalica are documented in this file.

## [Unreleased]

### Added

- `pnpm ops purge-deleted` (dry run) and `--apply` permanently remove every trace of soft-deleted
  websites and projects: raw event batches in R2 and all D1 rows, including audit entries and the
  project rows. Backed by `POST /v1/admin/purge-deleted`, which requires an explicit `dryRun`.

## [0.5.2] - 2026-09-18

### Added

- A reusable GitHub Actions workflow that deploys a customer website and the Vizoalica
  configuration and token Functions to Cloudflare Pages on push, with every per-deployment value
  supplied from repository variables and secrets and none committed to the website's source.
  Missing or malformed values fail the run before anything is deployed.
- The console's website integration panel now leads with the required variables and secrets and a
  starter workflow, and shows whether the website's configuration endpoint is reachable.
- Project deletion from the console and API, using the same soft-delete and audit conventions as
  website deletion, with a confirmation that explains the effect.
- An optional Workers Rate Limiting binding that throttles ingest per client address. It ships commented out in `wrangler.example.toml`.

### Changed

- The Cloudflare guide has a short command reference, and the Pages guide leads with the CI/CD
  path. Direct Upload and Git-connected Pages remain documented as the manual alternative; the
  static snippet path is unchanged.
- Ingest requests without a valid signed token are rejected with 401 before any database read.
  An unknown source key without a token now reports 401 instead of 403.

### Fixed

- Soft-deleted websites and projects no longer accept events. Authorization now allows only
  `active` sources and projects.
- The daily retention job could not keep up with steady traffic (1,000 rows per table per day) and
  never pruned `ingestion_decisions` or `quota_windows`, so D1 grew without bound. It now repeats
  until each table is drained, up to a per-run cap, and prunes both tables.
- The config-overwrite guard no longer depends on hard-link support, so it works on network and
  FAT-family filesystems.
- The token issuer accepts multiple site origins.

### Security

- Findings, resolutions, and accepted risks are recorded in
  `specs/011-quality-simplicity-release/security-findings.md`. No critical or high finding is open
  without a written rationale.
- **Accepted risk:** `VIZOALICA_TOKEN_SECRET` is one backend-wide secret shared by every website, so
  a leak from one website allows forging tokens for any project on that backend. Treat it like the
  administrator secret and rotate it everywhere on suspicion of exposure. Per-website signing
  secrets are deferred to a future release.
- The console's reachability check caps the response it reads at 16 KiB.

### Validation

- Formatting of source and docs, lint, type checking, production builds, the deploy-workflow
  generation check, and 480 unit and integration tests pass. Repository coverage is 95.86% for
  lines and 90.54% for branches. A production dependency audit reports no known vulnerabilities.
- A real end-to-end deployment through the new workflow completed in 21-32 seconds of Actions
  runtime and recorded a page view in the backend.
- Not re-run for this release: a from-scratch, timed backend deployment on a fresh Cloudflare
  account (SC-001), and the Chromium accessibility suite after the final retention and ingest
  changes (no console code changed after its last passing run).

### Upgrade

- **Existing 0.5.1 databases need one manual statement.** The baseline schema gained a
  `projects.status` column for project deletion. This release still supports fresh deployments
  only and adds no migration file. To keep an existing 0.5.1 database, run this once before
  deploying the 0.5.2 Worker:
  `ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted'));`
  The backend preflight (`pnpm deploy:check`) still refuses a non-empty database, so this path
  means deploying the Worker with Wrangler directly. Otherwise deploy to a new, empty D1 database
  as usual.
- Existing static snippets remain compatible. The rate limiter is opt-in.
- Publishing the source release does not deploy or alter Cloudflare resources.

## [0.5.1] - 2026-09-13

### Added

- Projects are now a primary console destination with explicit project selection and direct
  Overview and Websites actions.
- Website creation starts with a required, empty Project selector and safely retains draft values
  when project access changes or creation fails.
- Installation guidance now offers two choices: the compatible static snippet and a generic
  dynamic loader backed by a versioned six-field public configuration document.
- A Cloudflare Pages configuration Function, generic loader asset, provider-neutral hosting
  contract, ordered deployment guidance, and dynamic website verification mode.
- An accessible Local workspace explanation and a centered footer with the Vizoalica website,
  GitHub repository, current year, and release version.

### Security

- Dynamic configuration validates HTTP(S) locations, same-origin token routing, version, project,
  source, and consent before loading the SDK, and fails closed without disrupting the host page.
- Public browser configuration is separated from token-signing and deployment secrets throughout
  the API, console, generated commands, examples, tests, and documentation.
- Website creation remains authenticated, explicitly project-scoped, and atomic when the selected
  project is invalid or no longer available.
- Production dependencies report no known high-severity vulnerabilities. Automated accessibility
  checks report no serious or critical findings on the primary console destinations.

### Validation

- Formatting, lint, type checking, production builds, browser bundle generation, 445 unit and
  integration tests, and 11 Chromium scenarios pass.
- Repository coverage is 95.83% for lines and 90.07% for branches. The Cloudflare Pages Functions
  compile successfully and the local dynamic configuration endpoint returns the expected secure
  response headers and public contract.

### Upgrade

- No database migration or breaking ingestion contract is introduced. Existing static snippets
  remain compatible; operators may continue using them or adopt dynamic configuration per site.
- This release remains fresh-deployment-only and does not deploy or alter Cloudflare resources when
  the source release, tag, or GitHub Release is published.

## [0.5.0] - 2026-09-11

### Added

- A production-ready V-and-rising-analytics brand system with a compact mark, favicon,
  monochrome asset, and dedicated light- and dark-mode lockups.
- A responsive browser-validation suite covering 320, 768, 1024, and 1440-pixel layouts,
  touch-sized controls, resize-state preservation, contained overflow, both themes, and automated
  accessibility checks.
- A guided `pnpm ops` workflow for non-secret setup, diagnostics, one-terminal local console
  startup, and confirmation-gated Direct Upload Pages deployment.

### Changed

- Redesigned the local console as a compact developer tool with graphite neutral surfaces,
  system sans and monospace typography, tabular data, restrained cyan/blue/violet accents,
  consistent SVG iconography, flatter panels, and clearer analytics hierarchy.
- Overview, Websites, filters, charts, tables, code snippets, forms, notices, and access states now
  adapt across compact, medium, standard, and wide viewports without changing application state.
- Consolidated setup and deployment documentation around three explicit credential lanes:
  Worker/D1/R2 infrastructure, native Wrangler Pages uploads, and OneCLI-held local-console access.

### Security

- Guided setup rejects secret-bearing options, writes private non-secret configuration and a
  literal OneCLI placeholder, rejects Docker-only gateway hostnames, and protects existing client
  credential files from accidental replacement.
- Pages uploads show the resolved site, Functions directory, project, branch, and native-Wrangler
  authentication path before requiring the exact project name as confirmation.
- The complete publishable tree and all reachable Git history were scanned with Gitleaks 8.30.1;
  no credentials or private deployment configuration were found. Production dependencies report
  no known vulnerabilities.

### Upgrade

- No new D1 migration or analytics API change. Existing installations remain on migrations through
  `0005_dashboard_visual_refresh.sql`.
- Run `pnpm install --frozen-lockfile`, then `pnpm ops setup`, `pnpm ops doctor`, and
  `pnpm ops run` to adopt the guided OneCLI console workflow.
- Rebuild and redeploy the admin console to receive the new visual system. Rebuild/copy
  `vizoalica.js` only when updating the browser SDK asset distributed with the release.

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

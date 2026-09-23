# Changelog

All notable changes to Vizoalica are documented in this file.

## [Unreleased]

## [0.7.0] - 2026-09-23

### Added

- **Install and run the console from npm, with no source checkout.** `npm install -g vizoalica` then
  `vizoalica console` starts a console that carries everything it needs, including a pre-bundled Worker
  and its migrations, so deploying a brand-new backend no longer needs a repository checkout or
  `pnpm build`.
- **Deploy and update a backend from the console.** An admin approves a plan before anything is
  created (or before an update runs), watches ordered step-by-step progress, resumes a failed run, and
  sees generated secrets exactly once. Updating an existing backend backs up the database, applies
  pending additive migrations, and redeploys the Worker, with a plan shown first and a backup that can
  only be declined when every pending change is purely additive.
- **Multiple backend environments.** One console installation now manages several independent
  backends side by side — for example `dev`, `stage`, and `prod`, or any names an admin chooses. Each
  environment has its own Worker, D1 database, R2 bucket, Cloudflare credential (a plain token or
  OneCLI, chosen independently per environment), administrator secret, access keys, and list of
  projects and websites. Every resource an environment creates is named `<environment>-something`, so
  environments never collide even inside one Cloudflare account. An environment switcher appears once
  more than one is saved; a website owner's or analyst's access key always fixes their one environment,
  so they never see it.
- A pre-0.7.0 single-backend setup is offered, once, to become the first named environment (its
  address, credential, and role hint move across unchanged); the old connection file is never deleted.

### Changed

- This is a minor release: the environment model is a genuine redesign of the console's connection and
  deploy machinery, with no backward-compatibility constraint, since nothing built on the previous
  in-development shape had shipped.

## [0.6.2] - 2026-09-21

### Changed

- Dependency updates: TypeScript 6, ESLint 10, Vite 8, a group of minor and patch updates (React 19.3,
  Wrangler 4.134, and others), and a newer actionlint action. TypeScript 6 needed two small settings
  (`types: ["node"]` in the shared tsconfig, and `--ignoreConfig --types node` for the examples check).
  `@types/node` stays on 22, the oldest supported Node, and Dependabot is told not to propose newer
  major versions.

### Fixed

- Starting the console (or running `pnpm vizoalica verify` or `purge`) through OneCLI no longer prints
  `UNDICI-EHPA: EnvHttpProxyAgent is experimental` on every start. OneCLI injects proxy settings, which
  makes Node's built-in fetch switch on that agent and warn; exactly that one warning is now silenced in
  the processes launched through OneCLI, and your own `NODE_OPTIONS` is kept.

## [0.6.1] - 2026-09-21

### Fixed

- **Actions are attributed to the page they were clicked on.** In 0.6.0, on a site whose router handles
  link clicks itself (VitePress and many single-page frameworks do), the router had already navigated
  when the SDK read the address, so a click on a link was recorded on the page it opened. The SDK now
  reads the page when the press begins (pointer down, or a key press), before any router acts. Update a
  website's SDK file to get the fix; no backend change is needed. Page views were not affected.

## [0.6.0] - 2026-09-21

This release also contains everything in 0.5.3 below, which was never published on its own.

### Added

- **Actions.** A new Analytics view, Actions, shows what visitors click, page by page: each row is a
  page and an action (a button or link) with its count, distinct visitors, and how often it is used
  per view of that page. Choose a page or an action to narrow the report; the selection is kept in
  the address. The SDK records an action for a click or Enter or Space on a button, link, or control
  that behaves like one. It is always on for a website that runs the new SDK file, and it begins only
  when that file is deployed. It records a short redacted name (at most 80 characters), the page, the
  kind, and for links the destination's origin and path, and never anything typed, a field value, a
  link query, a click position, or a cookie. Developers exclude a control or area with
  `data-vizoalica-ignore` and name a control with `data-vizoalica-action`. New event type
  `com.vizoalica.action.v1`, two new tables, and `GET /v1/admin/projects/:id/analytics/actions`. See
  the [action collection review](docs/privacy/action-collection-review.md).
- **Identifiers in paths are grouped.** `/orders/8841` and `/orders/8842` are one page,
  `/orders/:id`. Numbers, UUIDs, long hexadecimal values, ULIDs, random tokens, and email-shaped
  segments become `:id` in the browser and again at the backend, so the identifier is never stored.
  Readable slugs, versions, and dates are kept. See
  [How pages are grouped](docs/operations/browser-sdk.md#how-pages-are-grouped).
- **In-page navigation.** The SDK reports a page view when a visitor moves to a different page by
  `pushState`, `replaceState`, back or forward, or a fragment change.
- **Get involved.** A community page on vizoalica.dev, a "Get involved" section in the README, and a
  rewritten contributing guide invite ideas, questions, bug reports, and contributions, with GitHub
  Discussions and Issues as the place for them. Issue forms for bugs, feature requests, and
  documentation problems, a code of conduct, and a support guide.
- **A copy of the documentation site on GitHub Pages** (`https://ehud-am.github.io/vizoalica/`),
  built from the same files, with every page naming vizoalica.dev as its canonical address. It has
  its own workflow, with no secrets, and is off until the maintainer turns it on
  ([Publishing this site](docs/operations/docs-site.md#a-copy-on-github-pages)).

### Changed

- **Every page is reported, not just "/".** A page's path now includes the route after `#` for
  fragment-routed sites (`/#/pricing`), which used to be dropped so that all screens appeared as
  `/`. Anchors and sign-in data in a fragment are still never recorded. Pages recorded before this
  release keep the paths they were recorded with.
- The SDK sends actions in their own requests, and drops a batch the backend rejects as invalid or
  too large (HTTP 400 or 413) instead of retrying it forever, which could stall later events.
- `client.stop()` ends the SDK's observation of navigation and clicks.
- The generated website-workflow reference points at `v0.6.0`.

### Upgrade notes

- **The D1 schema changed** (two tables for actions in `0001_initial.sql`), so this is a
  fresh-install release: install it on a new, empty database. `pnpm vizoalica backend --update`
  cannot add the tables to a running installation.
- **Backend first, then websites.** An older SDK file keeps working with the new backend. A newer SDK
  file with an older backend loses no page views, because action requests are separate and a
  rejected request is dropped.
- **Actions and route-level pages start when a website's SDK file is updated** (rebuild with
  `pnpm browser-sdk:build` and copy `vizoalica.js`). Update your privacy notice if it lists what
  your analytics record.

## [0.5.3] - 2026-09-19

Not published on its own: included in [0.6.0](#060---2026-09-21).

### Added

- **Geography.** A new Analytics view shows visitor countries by full name on a world map, a
  sortable table of every country, and totals by continent. Tor traffic and unknown locations are
  labelled ("Tor network", "Unknown location") instead of showing `T1` or `XX`. Only country and
  continent are shown; the [audience attributes review](docs/privacy/audience-attributes-review.md)
  records why nothing finer is collected. The map is bundled with the console and makes no network
  requests.
- **Overview with comparison.** Page views and unique users now show the change against the
  previous period of equal length, with a small trend.
- Sources, Pages, Technology, and Traffic quality are separate Analytics views. Long lists have a
  "Show all" control, and distributions use bars with a table view instead of pie charts.
- A Manage > Health screen showing every website's status and reachability, with the next step;
  each website's name links to its own page.
- **A page for each website.** It shows the website's origins, identifiers with copy controls, live
  status, and the actions Edit, Install, and View analytics, with enable, disable, and delete
  apart from the routine ones.
- **The documentation is now a website.** `docs/` builds into a static site for vizoalica.dev with a
  home page, a quick start, a product tour, search, and every existing guide in grouped navigation.
  It loads nothing from another origin, has no tracking, is checked for accessibility (light and
  dark) and for its security headers, and has a sitemap, `robots.txt`, and an `llms.txt`. Preview it
  with `pnpm docs:dev`; build it with `pnpm docs:build`.
- **A pipeline to Cloudflare Pages.** `.github/workflows/docs-site.yml` builds and checks the site on
  every change to `docs/`, and publishes it from the main branch once the maintainer has done the
  one-time setup in [Publishing this site](docs/operations/docs-site.md). Until then it only builds
  and checks. Nothing is deployed or created in Cloudflare by the repository itself.
- Six product snapshots in `docs/assets/promo-src/` and a 13-second intro video (typed key messages
  over the console, with the official logo), all generated from fictional demo data by
  `pnpm promo:snapshots` and `pnpm promo:video`.

- Repository hygiene for going public: a `.gitleaks.toml` for secret scanning, Dependabot for npm
  and GitHub Actions, a pull-request template, and an issue-template chooser that sends
  vulnerability reports to private advisories.

### Changed

- **The console is reorganized into Analytics (viewing) and Manage (setup) areas.** Nothing under
  Analytics can create, change, disable, or delete anything, which prepares the ground for
  role-based access. The project and website are chosen once, in the shell, and are remembered
  across screens and reloads.
- Deleting or disabling a project or website now happens in a "danger zone" with an in-console
  confirmation that names the target (a project also asks you to type its name), replacing the
  browser's native dialog.
- **Websites are now a list, a page per website, and separate add and edit pages.** The Websites
  screen no longer mixes a list, two forms, and a detail pane. It lists websites as cards, each one
  a link to that website's page. **Edit** and **Add website** are pages of their own with a back
  link, field-level validation, Save available only when something changed, and a prompt before
  leaving with unsaved changes. Adding a website now ends on its Install page.
- **The Install page is rebuilt.** Instead of a "Static snippet / Dynamic configuration" radio
  group and one long block of code, it asks how the website is deployed (GitHub → Cloudflare Pages,
  recommended, or Paste a snippet), then shows numbered steps with one action and at most one code
  block each. The two ways of adding settings are a toggle inside one step, variables and secrets
  are named in a small list, the token endpoint requirement is stated, and the generic loader for
  other hosts is in a disclosure. Each code block has its own copy control that confirms in place.
  The step list ends with **Check now**, which reads the last 24 hours of page views and, on the
  GitHub path, whether the configuration file is reachable. The chosen path is remembered per
  website in the browser.
- **Installation is no longer a separate item in the Manage navigation** (it asked which website
  you meant). Manage is Projects, Websites, and Health; installing is done from a website. An old
  `#/manage/installation` link opens Overview.
- Filled buttons use a darker blue so their white text meets the 4.5:1 contrast requirement.
- The Worker's overview response now returns up to 300 countries and up to 100 pages, sources, and
  user agents (was 10). **Redeploy the Worker to get the complete lists**; an older Worker still
  works and the console shows its top ten.
- The console's header no longer has the "Local workspace" indicator. What it explained (the console
  and its credential-holding service run on your computer; your data may be remote) is in the
  operator guides.
- The time range picker's options are ordinary radio buttons with the label after them on one line
  (the scope bar's label style had been stacking them).
- On wide screens the Technology view shows two bar lists to a row so their values no longer wrap,
  and website cards show each website's full origin, with its status beside the name.
- The README screenshot is regenerated for the current console.
- The analytics overview reads its fifteen queries in one D1 round trip instead of fifteen.
- The console asks for the previous period (for the change indicators) only on the Overview, not on
  every Analytics view.
- Removed code nothing used: the pre-0.5.3 summary card and its client call, unused icons and
  exports, and dependencies no package imported (`ajv` from the console service,
  `@vizoalica/privacy` from the Worker, the MCP SDK, and the Workers test pool).

### Security

- The Worker now refuses to start when the token, admin, or digest secret is shorter than 32
  characters or contains characters other than printable ASCII (`weak_secret:<NAME>`). Secrets made
  by `pnpm vizoalica` were already 256-bit; this stops a hand-typed weak one.
- Ingest tokens must declare `alg: HS256` in their header; anything else is `malformed_token`.
- Repeated denied admin and MCP requests write at most one audit row per minute per Worker
  instance, so a flood of bad credentials cannot fill the audit log. Denials are still refused.
- CORS preflight responses carry `Access-Control-Max-Age: 86400`, so browsers stop repeating them.
- The local console service prunes expired sessions and keeps at most 32; the session lifetime
  (`VIZOALICA_SESSION_TTL_MS`, default 30 minutes) is validated and rejected outside 1 minute to 24
  hours.
- The reusable deploy workflow passes every input and repository variable through environment
  variables instead of pasting them into shell scripts, validates them (no whitespace, quotes,
  backslashes, `$`, backticks, or `..` paths), and pins Wrangler to an exact version.

### Removed

- The Overview "principles" panel and the sidebar privacy note. Their text moved into the help
  popover under "Local workspace".
- The separate Installation destination and its Static/Dynamic radio chooser (replaced by the
  website's Install page).

## [0.5.2] - 2026-09-18

### Added

- **Guided setup.** `pnpm vizoalica install` takes an empty Cloudflare account to a connected console
  with sample data: it creates the D1 database and R2 bucket, writes the production Wrangler config
  from the example, deploys, generates the three secrets, shows them once (then clears the screen),
  saves the administrator secret for this computer, and sends signed sample events through the real
  ingestion path. `backend` installs or updates (it detects which and asks), `connect` sets up another
  operator computer, `demo` adds or removes the sample, and `rotate` replaces one or all secrets after
  explaining what each rotation breaks. Secrets travel to Wrangler over stdin only and are never
  arguments; a first install never adopts an existing database and, on failure, offers to remove only
  the empty resources it created.
- `pnpm vizoalica console` starts the private API and the web console together in either credential
  mode (a local secret file, or OneCLI). `run` remains as an alias.
- A reusable GitHub Actions workflow that deploys a customer website and the Vizoalica
  configuration and token Functions to Cloudflare Pages on push, with every per-deployment value
  supplied from repository variables and secrets and none committed to the website's source.
  Missing or malformed values fail the run before anything is deployed.
- The console's website integration panel now leads with the required variables and secrets and a
  starter workflow, and shows whether the website's configuration endpoint is reachable.
- Project deletion from the console and API. Like website deletion it is permanent (see Changed).
- `pnpm vizoalica purge-deleted` (a dry run, or `--apply`) and the daily Cron run permanently remove every
  trace of deleted websites and projects: raw event batches in R2 and all their D1 rows, including
  audit entries, quota policies, and the website and project rows. Backed by
  `POST /v1/admin/purge-deleted`, which requires an explicit `dryRun`.
- An optional Workers Rate Limiting binding that throttles ingest per client address. It ships commented out in `wrangler.example.toml`.

### Changed

- **Breaking: the command line is now `vizoalica`.** `pnpm ops <command>` (introduced in 0.5.0) is
  `pnpm vizoalica <command>`; `pnpm ops run` is `pnpm vizoalica console` (`run` still works). There is no
  `pnpm ops` alias. The package declares a `vizoalica` bin, so `pnpm link --global` makes
  `vizoalica <command>` work from any directory; it always operates on the checkout it was linked
  from. An existing OneCLI settings file (`~/.config/vizoalica/ops.json`) keeps its name and keeps
  working. The OneCLI guide moved to `docs/operations/onecli.md`.
- **Breaking: deleting a website or project is now permanent.** In 0.5.1 a delete was soft and kept
  aggregate history and audit evidence. Now new events are rejected at once and the next daily run
  removes all of its data. The console's wording says so, and its button reads "Delete" rather than
  "Soft delete".
- The README opens with a logo, badges, a one-command path, and a screenshot, then explains the
  three parts in deployment order (backend, console, website); it renders in GitHub and gitlocal.
  The operations guides were reorganised to remove contradictions: one console start command for both
  modes, a documented procedure for updating a running backend (the install commands refuse a
  non-empty database), consistent placeholders, and a website guide that puts shared steps before its
  GitHub Actions and manual paths. `scripts/capture-console-screenshot.ts` regenerates the screenshots
  (with `--live`, from a real console against a real backend that has the sample data).
- Ingest requests without a valid signed token are rejected with 401 before any database read.
  An unknown source key without a token now reports 401 instead of 403.

### Fixed

- `pnpm build` failed on a fresh clone (`TS6305` in `local-ops-api`): the per-package `tsc -p` build
  does not build referenced projects, and the failure was hidden wherever an earlier `tsc -b` had
  left `dist` behind, including CI, which type-checked before it built. The root build now runs
  `tsc -b` first, and CI builds on a clean tree.
- Soft-deleted websites and projects no longer accept events. Authorization now allows only
  `active` sources and projects.
- The daily retention job could not keep up with steady traffic (1,000 rows per table per day) and
  never pruned `ingestion_decisions` or `quota_windows`, so D1 grew without bound. It now repeats
  until each table is drained, up to a per-run cap, and prunes both tables.
- `pnpm vizoalica console` says so when the console ports are already in use, instead of failing with a raw
  `EADDRINUSE` trace. `demo --remove` no longer needs an interactive terminal (it asks nothing).
- The config-overwrite guard no longer depends on hard-link support, so it works on network and
  FAT-family filesystems.
- The token issuer accepts multiple site origins.

### Security

- Findings, resolutions, and accepted risks are recorded in
  `specs/011-quality-simplicity-release/security-findings.md`. No critical or high finding is open
  without a written rationale.
- **Accepted risk:** `VIZOALICA_TOKEN_SECRET` is one backend-wide secret shared by every website, so
  a leak from one website allows forging tokens for any project on that backend. Treat it like the
  administrator secret and rotate it everywhere on suspicion of exposure (`pnpm vizoalica rotate token`).
  Per-website signing secrets are deferred to a future release.
- The console's reachability check caps the response it reads at 16 KiB.

### Validation

- Formatting of source and docs, lint, type checking, a production build from a clean tree, the
  deploy-workflow generation check, the standalone SDK build, and 589 unit and integration tests
  pass. Repository coverage is 94.60% for lines and 90.70% for branches. All 11 Chromium responsive
  and accessibility scenarios pass. A production dependency audit reports no known vulnerabilities.
- Two from-scratch `pnpm vizoalica install` runs on a real Cloudflare account (signed in) took 113 s and
  102 s, each ending with sample events read back from analytics (96 page views, 29 visitors); update,
  connect-again, admin-secret rotation, the refuse-to-adopt guard, and sample removal were also run
  there, and the scratch resources were deleted afterwards. A real end-to-end deployment through the
  new workflow completed in 21-32 seconds of Actions runtime and recorded a page view in the backend.
- Not verified: Windows (not supported: the console's file-permission checks and the deploy scripts
  assume macOS or Linux), and the interactive Cloudflare sign-in and R2-activation error paths
  (covered by tests with doubles only).

### Upgrade

- **Existing 0.5.1 databases need one manual statement.** The baseline schema gained a
  `projects.status` column for project deletion. This release still supports fresh deployments
  only and adds no migration file. To keep an existing 0.5.1 database, run this once before
  deploying the 0.5.2 Worker:
  `ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted'));`
  Then deploy with `pnpm vizoalica backend --update` (or Wrangler directly); `pnpm deploy:check` and
  `pnpm deploy:apply` still refuse a non-empty database. Otherwise deploy to a new, empty D1
  database as usual.
- **Anything already soft-deleted is removed at the first daily run after you deploy.** If you want
  to keep that history, export it first.
- Replace `pnpm ops …` with `pnpm vizoalica …` in your notes and scripts.
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
  [the deployment guide](docs/operations/cloudflare.md#6-apply-and-deploy) for the
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

---
description: "Task list for Install from npm and a Console-First Setup"
---

# Tasks: Install from npm and a Console-First Setup

**Input**: Design documents from `/specs/018-npm-console-first-setup/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included and written first in every story. The constitution requires automated unit,
integration, contract, end-to-end, and negative tests for new behavior, and coverage must stay above 90%
for lines and branches. Write each test task before its implementation tasks and confirm it fails for the
right reason.

**Organization**: Tasks are grouped by user story. The work ships in **two releases** (plan, R18):

- **Slice 1 (0.6.3), no backend or schema change**: Phases 1 to 5 (footer, npm package, console-first
  start, first run, journey and availability) and Phase 11 part A (existing setups, npm documentation).
  `vizoalica install` keeps working in this slice.
- **Slice 2 (0.6.4), schema and Worker change**: Phases 6 to 10 (migrations and versions, access keys and
  roles, console deployment, versions and updates, the owner and analyst experiences) and Phase 11 part B
  (retire `install`, publishing workflow), then Phase 12.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 to US9, matching the user stories in [spec.md](./spec.md)
- Every task names the file or files it changes

## Path conventions

pnpm monorepo. Paths are from the repository root:
`apps/{cli,local-ops-api,ingest-worker,ingest-api,admin-web,deploy-cli}`, `packages/{ops-core,...}`, `scripts/`,
`deploy/cloudflare/`, `docs/`, `.github/`.

## Rules that apply to every task

- Never run `git clean -x` (or delete ignored files) in the main checkout: it holds the git-ignored
  production Wrangler config. Use a throwaway `git worktree` for clean-tree experiments.
- No secrets in the repository, logs, run records, or the tarball. Anything that touches Cloudflare uses
  scratch resources named `vizoalica-rehearsal-*` and a separate `HOME`, never the production account files.
- A new repository method used by an admin route must be added to the explicit list in
  `apps/ingest-worker/src/index.ts` and tested through `worker.fetch` (see the memory note), not only with mocks.
- Database changes are numbered, additive migrations from now on (research R21); never edit a shipped
  migration file.
- Comments explain non-obvious intent only. Keep `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` green
  at every commit.

---

## Phase 1: Setup

- [X] T001 Confirm the branch is green before any change (`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm coverage`, `pnpm test:e2e`) and record the date, results, and coverage figures under "Baseline" in `specs/018-npm-console-first-setup/verification-log.md` (create it)
- [X] T002 [P] Rename the root package to `vizoalica-workspace` in `package.json` (still `private`), keep its `vizoalica` script, update every reference to the old root name (search `--filter vizoalica`, `pnpm-lock.yaml`, `.github/workflows/*`, docs), and run `pnpm install` so the lockfile updates
- [X] T003 [P] Create the package skeleton `apps/cli`: `apps/cli/package.json` (workspace member, private), `apps/cli/tsconfig.json` (extends `tsconfig.base.json`, added to the root `tsconfig.json` references), `apps/cli/package.json.template` (the publishable manifest: name `vizoalica`, `bin`, `engines.node >=22`, `license MIT`, `repository`, `files` allowlist from [contracts/package-and-cli.md](./contracts/package-and-cli.md), `publishConfig` with `access public` and `provenance true`, no `dependencies`), and add `apps/cli/package` to `.gitignore`, `.prettierignore`, and the eslint ignores

---

## Phase 2: Foundational (blocks every story)

**Purpose**: The local service must start with no backend, serve the console itself, and know who the backend
says the caller is. Everything in slice 1 builds on this.

**⚠️ CRITICAL**: No story work can begin until this phase is complete.

- [X] T004 [P] Write failing tests in `apps/local-ops-api/tests/connection-store.test.ts`: an empty store; a valid file with `VIZOALICA_ADMIN_SECRET`; a valid file with `VIZOALICA_READ_KEY`; a file with both credentials, or neither, is invalid; a file readable by group or others is rejected with a message that offers repair (`config_permissions_must_be_0600`); writes are atomic and mode 0600; `onecli-managed` is only valid under `VIZOALICA_ONECLI_WRAPPED=1`; `VIZOALICA_ROLE_HINT` accepts only `admin`, `website-owner`, `analyst`; disconnect writes the existing revoked marker; concurrent saves never leave a partial file; an existing file from the checkout-based commands loads unchanged
- [X] T005 Implement `apps/local-ops-api/src/connection-store.ts` (a mutable, file-backed connection with `load`, `save`, `disconnect`, `current`) and split `apps/local-ops-api/src/config.ts` so `loadConfig` yields settings (port, allowed origins, session lifetime) separately from the connection; keep `loadConfigFile`, `writeConfigFile`, and their tests working; add `VIZOALICA_READ_KEY` and `VIZOALICA_ROLE_HINT` per [data-model.md](./data-model.md)
- [X] T006 [P] Write failing tests in `apps/local-ops-api/tests/static.test.ts`: `/` returns the console `index.html`; an unknown non-`/api` path falls back to `index.html`; hashed assets under `/assets/` and images under `/brand/` are served with correct content types and long-lived caching; `..`, `%2e%2e`, `%2f`, backslash, absolute paths, and NUL bytes all return 404; a symlink that leaves the console directory is refused; `POST`, `PUT`, and `DELETE` return 405; `HEAD` works; no directory listing; exact headers per [contracts/local-service-api.md](./contracts/local-service-api.md) (`content-security-policy`, `x-content-type-options`, `cache-control: no-store` for `index.html`); `/api/sdk/vizoalica.js` and `/api/sdk/vizoalica-loader.js` are served from the SDK directory as `text/javascript`
- [X] T007 Implement `apps/local-ops-api/src/static.ts`: resolve every path against the console directory and reject any that leaves it (compare the real path), set the headers, serve the SDK files from a second directory, no listing, only `GET` and `HEAD`
- [X] T008 [P] Write failing tests in `apps/local-ops-api/tests/server-unconfigured.test.ts`: the server starts with an empty connection store; `POST /api/session` works; routes that need a backend answer `409 backend_not_connected` with `recovery: "connect_backend"`; the `Origin` allowlist accepts exactly `http://127.0.0.1:4318` and `http://127.0.0.1:5173` and refuses any other origin, including `http://localhost:4318`, a look-alike host, and a missing origin on a write; the `Host` check still refuses non-loopback hosts; saving a connection makes the next request use the new client without a restart; the existing `apps/local-ops-api/tests` suites still pass unchanged
- [X] T009 Modify `apps/local-ops-api/src/server.ts` and `apps/local-ops-api/src/cli.ts`: create the service from settings plus a connection store (client rebuilt when the connection changes), route non-`/api` requests to `static.ts` before the origin check, accept the two allowlisted origins, return `409 backend_not_connected` where a client is needed and none exists, and let `serve` start with no configuration file
- [X] T010 [P] Write failing tests and implement `apps/local-ops-api/src/compat.ts` in `apps/local-ops-api/tests/compat.test.ts`: `versionStatus(consoleVersions, backend)` returning, for the Worker and for the database schema separately, `current`, `update-available`, `console-older`, `unknown`, or `unsupported` per the table in [data-model.md](./data-model.md) (Worker compared by major and minor; schema by applied against expected; a missing version or a missing `d1_migrations` table is `unknown`; a schema below 1 is `unsupported`), each with a plain message and which side to update
- [X] T011 [P] Add `whoami()` and `backendInfo()` to `apps/local-ops-api/src/remote-client/worker-client.ts` with tests in `apps/local-ops-api/tests/worker-client-whoami.test.ts`: `whoami` calls `GET /v1/admin/whoami` and returns role (`admin`, `analyst`, or `owner`), scope, key label, Worker version, and features; on `404` (a backend older than this release) it falls back to `GET /v1/admin/projects` with the same credential and, if that succeeds, reports `{ role: "admin", workerVersion: null, features: { accessKeys: false, versions: false } }`; `backendInfo` calls `GET /v1/admin/backend` and reports unknown versions on `404`; `401` and `403` map to `unauthorized`; a network error maps to `unreachable`; no response body or credential is ever logged

**Checkpoint**: `pnpm vitest run apps/local-ops-api` passes. The service starts with no backend and serves the console.

---

## Phase 3: User Story 1 - A Footer That Points Home and to the Project (Priority: P1) 🎯 (0.6.3)

**Goal**: A structured footer on every screen: brand and tagline, two link groups, and a bottom line.

**Independent Test**: Open every console screen, including error screens, at phone and desktop widths in both
themes; the footer shows brand, tagline, both groups, and version; each link goes to the right place; axe is clean.

### Tests for User Story 1 (write first, confirm they fail)

- [X] T012 [P] [US1] Write `apps/admin-web/tests/footer.test.tsx`: the brand mark and name with the tagline "Privacy-first analytics that runs in your own Cloudflare account."; a labeled **Vizoalica** group with Website (`https://vizoalica.dev`), Documentation, Get started, Privacy; a labeled **Project** group with GitHub (`https://github.com/ehud-am/vizoalica`), Discussions, Issues, Release notes, License; the bottom line with `© <year> Vizoalica` and `Version x.y.z` (and "Version unavailable" for an invalid injected version, as today); every external link has `target="_blank"` and `rel="noopener noreferrer"` and a distinct accessible name; the footer performs no `fetch` when rendered
- [X] T013 [P] [US1] Write `apps/admin-web/e2e/footer.spec.ts` (mock console): the footer is present on the Overview, Manage, and connection-error screens; at 320, 768, and 1440 px in light and dark the groups reflow to one column at phone width with no horizontal overflow; `@axe-core/playwright` reports no violations; keyboard tabbing reaches every link with a visible focus; the page makes no request outside the local console (the existing "never contacts anything outside the local console" check still passes)

### Implementation for User Story 1

- [X] T014 [US1] Rebuild `apps/admin-web/src/components/AppFooter.tsx` per [contracts/console-availability.md](./contracts/console-availability.md) "Footer" (local `BrandLogo`, two labeled groups as lists, bottom line) and add its styles to `apps/admin-web/src/styles.css` (tokens only, `flex-wrap` to one column at phone width, focus ring, AA contrast in both themes); keep it rendered in both the connected shell and the access-state branch of `apps/admin-web/src/App.tsx`
- [X] T015 [P] [US1] Put the link targets in one constant module `apps/admin-web/src/footer-links.ts` and confirm each target exists (`curl -I` for the website, documentation, get started, privacy pages, Discussions, Issues, the releases page, and the license) and record the check in `specs/018-npm-console-first-setup/verification-log.md`; the npm link is added by T080

**Checkpoint**: Story 1 works alone and can be shown immediately.

---

## Phase 4: User Story 2 - Install from npm and Start with One Command (Priority: P1) (0.6.3)

**Goal**: `npm install -g vizoalica` then `vizoalica console` gives a running console with no checkout and no
backend.

**Independent Test**: In a clean prefix and a clean `HOME`, install the packed tarball and start the console;
the console page is served, first run is reported, and the tarball contains only the allowlisted files.

### Tests for User Story 2 (write first, confirm they fail)

- [X] T016 [P] [US2] Write `apps/cli/tests/main.test.ts`: `--version` prints the version; `help` lists the commands from [contracts/package-and-cli.md](./contracts/package-and-cli.md); Node older than 22 prints one plain message naming the requirement and exits 1 with no stack; Windows and other unsupported platforms print a plain message and exit 1; an unknown command prints a hint and exits 1; `console` on a busy port prints "A console is probably running already…" with the address and exits 1; one interrupt stops the service (injected process)
- [X] T017 [P] [US2] Write `apps/cli/tests/console-command.test.ts` for the packaged start: with no saved connection it starts the service unconfigured and prints `http://127.0.0.1:4318`; with a saved file-mode connection it starts with it; with a saved OneCLI-mode `ops.json` it spawns `onecli run … -- node <cli> serve` with `NODE_OPTIONS` carrying the existing warning suppression; `--no-open` never opens a browser; a browser that cannot be opened prints the address; the existing `apps/deploy-cli/tests/unit/cli-console.test.ts` cases still pass for checkout mode
- [X] T018 [P] [US2] Write tests for the pure parts of the package check in `apps/cli/tests/package-check.test.ts`: the allowlist comparison (fails on any extra or missing file), the secret and local-path scanner (fails on `*.production.toml`, `.env*`, `local-operations.json`, a `vzk_` key, a Cloudflare account id, `/Users/` or `/home/` absolute paths), and the manifest checks (no `dependencies`, `engines.node`, `bin`, `files`, `publishConfig`)

### Implementation for User Story 2

- [X] T019 [US2] Implement `apps/cli/src/main.ts` (argument parsing, `--version`, the Node and platform checks with plain messages) and `apps/cli/src/console-command.ts` (start the service in one process with the connection store and the packaged console and SDK directories, print the address, open the browser unless `--no-open`, handle one-interrupt shutdown), and add an internal `serve` command used by the OneCLI wrapper (the checkout's `pnpm vizoalica console` is left as it is; the package has its own entry, and its other commands point to the console or the checkout in this release)
- [X] T020 [US2] Write `scripts/build-package.mjs` (esbuild, target node22, ESM, define the version from the root `package.json` and a `__PACKAGED__` flag): bundle the CLI and local service to `apps/cli/package/cli.mjs`; run the console build and copy it to `dist/console`; run the SDK build and copy `vizoalica.js` and `vizoalica-loader.js` to `dist/sdk`; copy every `deploy/cloudflare/migrations/*.sql` to `dist/schema`; generate `dist/package.json` from the template with the version; copy `README.md`, `LICENSE`, and `CHANGELOG.md`
- [X] T021 [US2] Write `scripts/check-package.mjs`: run `npm pack`, compare the file list to the allowlist, run the scanner from T018, install the tarball into a temporary prefix with a temporary `HOME`, start `vizoalica console --no-open` on a spare port, and assert `--version`, `GET /` returns the console, the setup state reports `needsFirstRun` (after the session call), `/api/sdk/vizoalica.js` is served, traversal requests are refused, and the process stops on interrupt
- [X] T022 [US2] Add `package:build` and `package:check` scripts to the root `package.json` and a CI job step in `.github/workflows/ci.yml` (after `pnpm build` and `pnpm browser-sdk:build`) that runs `pnpm package:build && pnpm package:check` on every pull request; keep the job's `HOME` isolated
- [X] T023 [P] [US2] Document the update and uninstall paths (`npm update -g vizoalica`, `npm uninstall -g vizoalica`, where saved settings live and that they survive updates) in `apps/cli/README.template.md`, copied into the package by T020

**Checkpoint**: `pnpm package:build && pnpm package:check` passes. Story 2 works alone: the console runs from the package with no backend.

---

## Phase 5: User Stories 3 and 4 - First Run, and What Is Possible Now (Priority: P1) (0.6.3)

**Goal**: The console asks at most three questions on first run, shows the four-stage journey, and shows
anything that cannot work yet as unavailable with a reason and a next step, sending nothing.

**Independent Test**: With no saved settings, answer for each role and situation and confirm the next step;
with no backend, every create and change control is unavailable with a reason and sends no request; the journey
shows the right stage at each of the four states.

### Tests for User Stories 3 and 4 (write first, confirm they fail)

- [X] T024 [P] [US3] Write `apps/local-ops-api/tests/setup-state.test.ts`: state for no connection (`needsFirstRun`), connected, unreachable, revoked, and incompatible; the principal (role admin, analyst, or owner) and versions come from `whoami` and `backendInfo`; a backend without them reports unknown versions and stays usable for the admin; the stage rules in [data-model.md](./data-model.md) (console running always done; backend connected; website configured when the principal can see a website; data arriving when a visible website reports accepted data; `blocked` and `current` assignment; next actions per role and state from [contracts/console-availability.md](./contracts/console-availability.md))
- [X] T025 [P] [US3] Write `apps/local-ops-api/tests/setup-routes.contract.test.ts`: `GET /api/setup/state`; `POST /api/setup/connect` success with an administrator secret, `401` for a rejected credential, `503` for an unreachable backend, `400` for a non-https address (loopback http allowed), the address normalized to its origin, `409 wrong_credential_kind` behavior and the `administrator_secret_used` notice, `422 incompatible`, an older backend accepted for the admin; `POST /api/setup/disconnect`; `POST /api/setup/role` changes only the hint; the saved file is mode 0600; the credential never appears in any response, log line, or the setup state
- [X] T026 [P] [US3] Write `apps/admin-web/tests/first-run.test.tsx`: shown before anything else when `needsFirstRun`; at most three questions on every path; each role choice (admin, website owner, analyst) carries one sentence on what it allows and does not; an admin with no backend goes to the deploy step (a step in this slice that explains deploying from the console comes in the next release and points at the getting started guide, then continues to connect); an admin with an existing backend asks only for the address and administrator secret and connects; website owner and analyst paths ask for the address and their access key (or setup details); it is skipped when a connection exists; role and connection can be reviewed and changed from a settings screen; the role group is a labeled radio group, errors are announced in a live region, and every step is keyboard operable
- [X] T027 [P] [US4] Write `apps/admin-web/tests/journey.test.tsx`: the four stages render with the current one marked and one next action for each role and state in the contract's table; it hides once data is arriving; status is text and icon, never color alone
- [X] T028 [P] [US4] Write `apps/admin-web/tests/availability.test.ts`: `availability(role, stage, capability)` matches the capability table and the reason and next-step table in [contracts/console-availability.md](./contracts/console-availability.md) for every role, stage, and capability (admin, analyst, website owner; `view`, `operate`, and `backend` classes), including the analyst reason "Your access is read-only." and the owner reasons "Only an admin can change the backend." and "Your access does not allow creating this here."; screens a role can never use are reported as absent
- [X] T029 [P] [US4] Extend `apps/admin-web/tests/area-separation.test.tsx` so its walk of every screen runs for each role and stage: with no backend connected no control creates or changes anything and each unavailable control is `aria-disabled`, has a reason referenced by `aria-describedby`, links to its next step, and triggers none of the mutation mocks (create project, delete project, create, update, delete website); analytics screens with no backend or no data explain what is missing (FR-024); a backend that stops answering shows a notice, marks the affected stages, and shows no stale results (FR-025)
- [X] T030 [P] [US3] Write `apps/admin-web/e2e/first-run.spec.ts` and `apps/admin-web/e2e/journey.spec.ts` against the mock console: each first-run path, the settings screen, the journey at all four states, no request sent by an unavailable control (route spy), axe in both themes, keyboard-only walk of the first-run flow, and the footer present on the first-run screen (extends T013)

### Implementation for User Stories 3 and 4

- [X] T031 [US3] Implement `apps/local-ops-api/src/setup/state.ts` and `apps/local-ops-api/src/setup/stages.ts` (state from the connection store, `whoami`, `backendInfo`, `compat.ts`, and the visible websites and their status) and `apps/local-ops-api/src/routes/setup.ts` (`state`, `connect`, `disconnect`, `role`) wired into `apps/local-ops-api/src/server.ts`; verify a credential with `whoami` before saving, normalize the address, save atomically at 0600, never log or echo the credential
- [X] T032 [US3] Add the client calls (`getSetupState`, `connectBackend`, `disconnectBackend`, `setRoleHint`) and types to `apps/admin-web/src/api/local-operations.ts` with tests in `apps/admin-web/tests/local-operations.api.test.ts`
- [X] T033 [US3] Implement `apps/admin-web/src/setup/SetupProvider.tsx` (loads and refreshes the setup state, exposes stage, principal, connection, and version statuses), `apps/admin-web/src/setup/roles.ts` (role copy), `apps/admin-web/src/setup/FirstRun.tsx`, and `apps/admin-web/src/setup/ConnectForm.tsx`; integrate in `apps/admin-web/src/App.tsx` so first run replaces the shell (footer still shown) and add a `setup` settings route in `apps/admin-web/src/router.ts`
- [X] T034 [US4] Extend `apps/admin-web/src/capabilities.ts` per [contracts/console-availability.md](./contracts/console-availability.md): rename the `administer` class to `backend`, move `delete-website` and `delete-project` to `operate`, and add `view-configuration`, `view-backend`, `download-sdk`, `deploy-backend`, `update-backend`, `rotate-secret`, `purge-deleted`, `manage-demo`, `manage-access-keys`, and `share-website-setup`; update the tests that reference the old class; implement `apps/admin-web/src/setup/useAvailability.ts`; update `apps/admin-web/src/components/ActionButton.tsx` so an unavailable control renders `aria-disabled`, its reason, and a next-step link and never invokes its handler
- [X] T035 [US4] Implement `apps/admin-web/src/setup/Journey.tsx` and mount it above the Analytics and Manage content in `apps/admin-web/src/App.tsx` until data is arriving
- [X] T036 [US4] Apply availability to the existing screens: project creation in `apps/admin-web/src/manage/ProjectsPage.tsx`, adding a website in `WebsiteAddPage.tsx` and `WebsitesPage.tsx`, and edit, toggle, and delete in `WebsitePage.tsx` and `WebsiteEditPage.tsx`; add the empty-state notices to `apps/admin-web/src/analytics/AnalyticsFrame.tsx` and `ActionsPage.tsx` for no backend and no data, and the unreachable-backend banner
- [X] T037 [US3] Update the existing mock console and fixtures for the new endpoints: `apps/admin-web/e2e/mock-console.ts` and `apps/admin-web/tests/fixtures/console.ts` (setup state variants: first run, connected admin, unreachable, older backend)
- [X] T038 [US3] Verify the slice: run `pnpm vitest run apps/local-ops-api apps/admin-web` and `pnpm --filter @vizoalica/admin-web test:e2e`; fix failures; run quickstart sections 3 and 4

**Checkpoint**: Stories 1 to 4 work together. Slice 1 is code-complete apart from Phase 11 part A.

---

## Phase 6: Migrations, Versions, and Access Keys on the Worker (blocks US5, US6, US7, and US9) (0.6.4)

**Purpose**: The database becomes versioned and updatable, the Worker reports its versions, and the backend,
not the console, enforces what an analyst or website owner may do.

### Migrations and versions

- [X] T039 [P] Write failing tests in `apps/ingest-worker/tests/migrations.test.ts` (real SQLite): migration files are named `NNNN_description.sql` and numbered contiguously from 0001; every file after `0001` contains only additive statements (`CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE … ADD COLUMN`, `INSERT OR IGNORE`) unless it carries the line `-- vizoalica:non-additive`, and a test file with a `DROP`, `RENAME`, `DELETE`, or `UPDATE` and no annotation fails the check; applying `0001` then `0002` to an empty database and applying `0002` to a fixture of the 0.5.2 schema (`apps/ingest-worker/tests/fixtures/schema-0.5.2.sql`, taken from `git show v0.5.2:deploy/cloudflare/migrations/0001_initial.sql`) give identical schemas; a database that already has the two action tables added by hand adopts `0002` without error or duplicates; `0001_initial.sql` is unchanged from its released content
- [X] T040 Add `deploy/cloudflare/migrations/0002_access_keys.sql` exactly per [data-model.md](./data-model.md): `access_keys` (`id TEXT PRIMARY KEY`, `label TEXT NOT NULL`, `role TEXT NOT NULL CHECK (role IN ('analyst', 'owner'))`, `secret_hash TEXT NOT NULL`, `project_id TEXT`, `source_id TEXT` with `CHECK (source_id IS NULL OR project_id IS NOT NULL)`, `created_at TEXT NOT NULL`, `revoked_at TEXT`) and an index on `project_id`, `ALTER TABLE administrative_audit ADD COLUMN actor TEXT`, and `CREATE TABLE IF NOT EXISTS` for `dashboard_minute_actions` and `dashboard_minute_action_visitors` copied from `0001`; add the fixture from T039; add the table name to `VIZOALICA_SCHEMA_TABLES` in `apps/deploy-cli/src/fresh-schema.ts` and its contract test `apps/deploy-cli/tests/contract/fresh-schema.contract.test.ts`; add `access_keys` to the purge lists in `apps/ingest-worker/src/storage/d1-repositories.ts`; the existing real-SQLite harness `apps/ingest-worker/tests/support/sqlite-d1.ts` must apply every migration in order
- [X] T041 [P] Write failing tests in `apps/ingest-worker/tests/schema-version.test.ts`: the applied version is the highest number among the names in `d1_migrations` and is unknown when that table is absent; the expected version is the highest migration number built in; the status is `current`, `behind`, `ahead`, or `unknown`; `health` reports `ok` or `unavailable` for the database and the storage bucket (each failing independently); nothing returned contains a secret
- [X] T042 Implement `apps/ingest-worker/src/schema-version.ts` (applied, expected, status, health), `apps/ingest-worker/src/version.ts` (build-time Worker version with a `dev` fallback), and the `GET /v1/admin/backend` route and the `workerVersion` and `features.versions` fields of `GET /v1/admin/whoami` in `apps/ingest-worker/src/http/admin-adapter.ts`; bind every new repository method in `apps/ingest-worker/src/index.ts`; test through `worker.fetch` on the real schema in `apps/ingest-worker/tests/backend-info.test.ts`

### Access keys, roles, and scope

- [X] T043 [P] Write failing tests in `apps/ingest-worker/tests/access-keys.test.ts` for key handling: the format `vzk_<12 [a-z0-9]>_<43 base64url>` is generated and parsed; the secret has 256 bits of entropy from a cryptographic source; only `sha256(secret)` is derived for storage; verification is constant-time and rejects a wrong secret, a wrong id, a truncated key, and a key with trailing characters
- [X] T044 Implement `apps/ingest-worker/src/auth/access-keys.ts` (generate, parse, hash, verify) and `apps/ingest-worker/src/auth/principal.ts` (resolve a bearer token to an admin, or a key holder with role and scope, or nothing, with the administrator path unchanged and first)
- [X] T045 [P] Write failing tests in `apps/ingest-worker/tests/access-key-authorization.test.ts` (real SQLite, through `worker.fetch`): every admin route in [contracts/worker-access-keys.md](./contracts/worker-access-keys.md) against an administrator secret, an analyst key (no scope, one project, one website), owner keys with each scope (everything, one project, one website), a revoked key, a key for another project or website, and malformed keys; analysts read analytics and configuration and every write is refused `403`; owners can create projects only with scope everything, websites only with scope everything or that project, and edit, enable, disable, or delete only resources in scope; out-of-scope resources return `404` not `403`; a website-scoped key is forced to its website when `source_id` is absent and gets `404` for another; `purge-deleted`, key management, and the automation interface refuse every key with `403`; owner writes are recorded in the audit table with the key id in `actor` and never a key or hash; a Worker whose `access_keys` table is missing still serves the administrator and answers `401` to keys and `501 access_keys_unavailable` on key routes; denied attempts go through the existing denial audit gate
- [X] T046 [P] Write failing tests in `apps/ingest-worker/tests/access-key-management.test.ts`: issue (label 1 to 64 characters with no control characters, `role` is `analyst` or `owner`, `sourceId` requires `projectId`, both must exist and be active, at most 200 active keys with `409 too_many_keys`), the key is returned once and never again, list never includes secrets or hashes, revoke is idempotent and takes effect on the next request, `404` for an unknown id, only the admin may do any of it, audit entries carry the key id and no secret, deleting a project removes its keys
- [X] T047 Implement the Worker side: `apps/ingest-api/src/domain/types.ts` (access key, role, scope, and principal types), `apps/ingest-api/src/storage/repositories.ts` (methods), `apps/ingest-worker/src/storage/d1-repositories.ts` (key storage, scope checks, audit `actor`), and `apps/ingest-worker/src/http/admin-adapter.ts` (principal resolution, the per-role route matrix and scope rules applied to the existing project and website handlers, the three key routes, and the audit actor), keeping the administrator behavior unchanged, and **bind every new repository method in `apps/ingest-worker/src/index.ts`**
- [ ] T048 [P] Write failing tests and implement the local guards and key routes in `apps/local-ops-api/src/routes/access-keys.ts` and `apps/local-ops-api/src/server.ts`: `GET/POST/DELETE /api/access-keys[/:id]` proxy the Worker for the admin only (`POST` takes `{ label, role, projectId?, sourceId? }` and returns the key once, never logged); an analyst connection is refused locally with `403` on every write; an owner connection is refused locally on every backend-level route and forwarded on project and website writes with its own key; reads are forwarded for every role (`apps/local-ops-api/tests/role-guards.test.ts`, `access-keys-routes.test.ts`)

**Checkpoint**: The authorization matrix passes on the real schema through the real Worker entry point, and the Worker reports its versions.

---

## Phase 7: User Story 5 - The Admin Deploys and Maintains the Backend from the Console (Priority: P2) (0.6.4)

**Goal**: Deploy, connect, rotate, purge, and add or remove sample data from the console, with a reviewed
plan, approval, resumable steps, and secrets shown once.

**Independent Test**: With a Cloudflare account and no backend, deploy entirely from the console; the plan was
shown first and nothing was created before approval; secrets were shown once; the backend is healthy and
connected. Repeat as a connection to an existing backend.

### Tests for User Story 5 (write first, confirm they fail)

- [ ] T049 [P] [US5] Create `packages/ops-core` (package, tsconfig, references) and move the pure helpers out of `scripts/cli/backend.ts` and `scripts/cli/secrets.ts` into `packages/ops-core/src/{names,parsers,config-render,secrets}.ts` (`assertResourceName`, `DEFAULT_NAMES`, `renderProductionConfig`, `readConfigNames`, `parseAccounts`, `parseDatabases`, `parseBuckets`, `parseWorkerUrl`, `SECRETS`, `generateSecrets`, `formatSecretBlock`); make the CLI import from it; the existing tests in `apps/deploy-cli/tests` must pass unchanged, and add `packages/ops-core/tests` for the moved helpers
- [ ] T050 [P] [US5] Write `apps/local-ops-api/tests/deploy-engine.test.ts` against a fake Wrangler: the plan lists every resource with name, purpose, and the cost note and creates nothing; a run cannot start without approval of that exact plan (a changed name needs a new plan); first-install steps run in the order in [data-model.md](./data-model.md); a failed step stops with what failed and what already exists; a resumed run repeats no finished step and creates no duplicate; a resource this run did not create blocks the flow with the choice to pick new names or connect; cleanup requires `confirm: true` and removes only what the run created; the run record contains names and statuses and never a secret; generated secrets are held in memory, revealed once by a single-use call, then `410`, and wiped after 10 minutes if unrevealed; only the administrator secret is written, to the 0600 connection file, when the run connects; Wrangler is spawned with an argument array and no shell; a resource name or account id failing validation is refused; `CLOUDFLARE_API_TOKEN` in the environment is passed through; a missing R2 activation is reported before anything is created
- [ ] T051 [P] [US5] Write `apps/local-ops-api/tests/deploy-routes.contract.test.ts` for [contracts/local-service-api.md](./contracts/local-service-api.md) "Deployment and updates" and "Backend, versions, and maintenance": admin only (`403` for an analyst or owner, `409 backend_not_connected` where a connection is required), input validation, `preflight` states (tool being prepared, ready, signed out, signed in with accounts, existing resources), `signin` returns the URL the tool prints, polling shows step progress, `rotate/:kind` for `admin`, `token`, and `digest` reveals the new value once, `purge-deleted` dry run versus apply, and `demo` add and remove
- [ ] T052 [P] [US5] Write `apps/local-ops-api/tests/wrangler-pin.test.ts`: the pinned Wrangler version constant equals the version in the root `package.json` devDependencies, so they move together; `VIZOALICA_WRANGLER` overrides the command; the default command is `npm exec --yes --package=wrangler@<pinned> -- wrangler`
- [ ] T053 [P] [US5] Write `apps/admin-web/tests/deploy-wizard.test.tsx` and `apps/admin-web/e2e/deploy.spec.ts` against the mock console: preflight states including the first-time tool download with progress, sign-in guidance that returns to the flow, the plan and the Approve control (disabled until the plan is shown), progress announced through a live region, a failed step with resume and the cleanup confirmation naming what will be removed, the secrets shown once with copy controls and a confirmation before they are wiped, success connecting the console, and the connect-existing path; the backend screen shows the address and health and the rotate, purge, and demo actions with confirmations that name what will happen; axe in both themes; keyboard-only

### Implementation for User Story 5

- [ ] T054 [US5] Implement `apps/local-ops-api/src/deploy/wrangler.ts` (the pinned runner, the override, output caps and timeouts, argument arrays only), `deploy/vault.ts` (in-memory single-use secret store with expiry), `deploy/runs.ts` (run records under `~/.config/vizoalica/deployments/`, atomic writes, no secrets), `deploy/steps.ts`, and `deploy/engine.ts`, using `packages/ops-core`
- [ ] T055 [US5] Write the Worker prebundle in `scripts/build-package.mjs`: esbuild the Worker to `apps/cli/package/worker/index.mjs` with the same aliases as the tests and the Worker version and the expected schema version (the highest migration number) defined, write `dist/worker/wrangler.template.toml` derived from `deploy/cloudflare/wrangler.example.toml` with `no_bundle = true`, an absolute `migrations_dir` placeholder for the packaged `dist/schema`, and only placeholders, and add a check in `apps/cli/tests/worker-bundle.test.ts` that `wrangler deploy --dry-run` accepts the bundle and template (using the repository's own Wrangler)
- [ ] T056 [US5] Implement `apps/local-ops-api/src/routes/deploy.ts` and `apps/local-ops-api/src/routes/backend.ts` (`preflight`, `tool`, `signin`, `plan`, `runs`, `runs/:id`, `resume`, `cleanup`, `reveal`, `connect-existing`, and the maintenance routes), render the configuration into `~/.config/vizoalica/deploy/<worker>/` (never the package directory), verify health and administrator access before connecting, and write an audit line per admin action without secret values
- [ ] T057 [US5] Implement `apps/admin-web/src/manage/DeployWizard.tsx` and `apps/admin-web/src/manage/BackendPage.tsx` (address, health, and the rotate, purge, and demo actions with named confirmations), add the `setup/deploy` and `manage/backend` routes and navigation, replace the placeholder from T026 so the admin with no backend lands in the wizard, and add the client calls to `apps/admin-web/src/api/local-operations.ts`

**Checkpoint**: Story 5 works alone. Quickstart section 6 passes.

---

## Phase 8: User Story 9 - See the Worker and Database Versions and Update Them from the Console (Priority: P2) (0.6.4)

**Goal**: Every role sees the three versions and their status; an admin updates the database and then the Worker
with a plan, a backup, and verification, without interrupting data collection.

**Independent Test**: With a backend one release behind, open the versions panel, update from the console, and
confirm the plan was shown first, a backup was taken, the database changed before the Worker, the versions now
match, no accepted event was lost, and an audit record exists.

### Tests for User Story 9 (write first, confirm they fail)

- [ ] T058 [P] [US9] Write `apps/local-ops-api/tests/update-engine.test.ts` against a fake Wrangler whose `d1 migrations apply` applies the packaged migration files to a real SQLite database and records them in `d1_migrations`, and whose `d1 export` writes a real file: the update plan shows the Worker from and to, each pending migration with its plain description and whether it only adds, the non-additive flag, and the backup; nothing changes before approval; steps run `prepare-tool`, `check-signin`, `read-versions`, `backup`, `migrate`, `deploy-worker`, `verify`, `record`, with the backup before the first migration and the database before the Worker; only what is behind runs (schema current skips `migrate`, Worker current skips `deploy-worker`); a failed migration stops with what was applied, leaves the backend serving, and a resumed run repeats no finished step; declining the backup needs `skipBackup.confirm` and is recorded, and is refused when a non-additive change is pending; a backup that cannot be taken stops the flow; a Worker or schema newer than the package is refused with no downgrade; an unsupported schema is refused with guidance; an unknown version is treated as behind; a database with hand-added tables is adopted; ingestion requests sent through the real Worker between steps are all accepted; the run record lists versions before and after, the migrations applied, and the backup path, and never a secret
- [ ] T059 [P] [US9] Write `apps/local-ops-api/tests/backend-versions.contract.test.ts`: `GET /api/backend` returns the Worker and schema versions and their statuses for a current, a one-release-behind, a newer, an unknown (older Worker), and an unsupported backend, the versions this console carries, and the pending database changes; every role can read it; an older Worker without the version routes yields unknown and an offered update
- [ ] T060 [P] [US9] Write `apps/admin-web/tests/versions-panel.test.tsx` and `apps/admin-web/e2e/update.spec.ts` against the mock console: the three rows (Console, Worker, Database schema) with the current version, the version this console carries, and a status shown as text and an icon for each state (*Up to date*, *Update available*, *Console is older* with the npm update note, *Unknown*, *Unsupported*); every role sees it read-only; the admin sees **Update backend** when something is behind and other roles see it unavailable with their reason; the update plan and approval, the backup shown before migrating, progress announced through a live region, a failed step with resume, the declined-backup confirmation, and the result with matching versions; axe in both themes; keyboard-only

### Implementation for User Story 9

- [ ] T061 [US9] Implement `apps/local-ops-api/src/deploy/update.ts` (the `update-backend` mode: read versions from `backendInfo`, compute pending migrations from the packaged `dist/schema`, build the plan, the `backup` step with `wrangler d1 export --remote` to `~/.config/vizoalica/backups/<database>-<timestamp>.sql` at mode 0600, the `migrate` step with `wrangler d1 migrations apply <database> --remote --config <rendered>`, the `deploy-worker` step, the `verify` step for health, matching versions, and administrator access, and the record), reusing `deploy/engine.ts`, and wire the `update-backend` mode and the `skipBackup` confirmation into `apps/local-ops-api/src/routes/deploy.ts`
- [ ] T062 [US9] Implement `GET /api/backend` in `apps/local-ops-api/src/routes/backend.ts` (versions, statuses from `compat.ts`, the versions this console carries, pending changes) and carry the version statuses into the setup state in `apps/local-ops-api/src/setup/state.ts`
- [ ] T063 [US9] Implement `apps/admin-web/src/manage/VersionsPanel.tsx` on the backend screen and the update flow in `apps/admin-web/src/manage/DeployWizard.tsx` (plan, approval, backup, progress, failure and resume, result), with the messages for older, newer, unknown, and unsupported backends and the role reasons from [contracts/console-availability.md](./contracts/console-availability.md); make key management and sharing unavailable with "This backend needs an update before it can issue keys." when `features.accessKeys` is false
- [ ] T064 [P] [US9] Write the migration guide `docs/operations/schema-versions.md` (what the three versions mean, how updates work, the backup and where it is saved, how to restore it, the additive rule, the oldest updatable schema, and what to do with an unsupported one) and the authoring rules for contributors in `CONTRIBUTING.md` (numbered additive migrations, the annotation for anything else, the release-notes line, the tests that enforce it); rewrite the "Deployment boundary" section of `docs/operations/releases.md` to end the fresh-install-only rule, and update the update section of `docs/operations/cloudflare.md`

**Checkpoint**: Story 9 works alone. Quickstart section 7 passes.

---

## Phase 9: User Story 6 - A Website Owner Manages Their Projects and Websites (Priority: P2) (0.6.4)

**Goal**: An owner, with only an owner key, manages projects and websites within scope, installs and checks a
website, and sees analytics, and is never offered a backend-changing control.

**Independent Test**: As an owner, create or configure a website within scope, follow the console through
installing it until the check reports data, then try every backend-level and out-of-scope operation; each is
refused or absent.

### Tests for User Story 6 (write first, confirm they fail)

- [ ] T065 [P] [US6] Write `apps/local-ops-api/tests/share.test.ts`: `POST /api/websites/:id/share` (admin only) issues an owner key limited to that website (or an analyst key when `role` says so) and returns the setup details of [data-model.md](./data-model.md) (worker address, ids, public source key, allowed origins, guidance, key) with no administrator secret and no signing secret; the details are not stored by the service; `GET /api/sdk/*` is available to every role
- [ ] T066 [P] [US6] Write `apps/admin-web/tests/owner-role.test.tsx` and `apps/admin-web/e2e/owner.spec.ts`: entering setup details (paste or file) or an owner key connects and shows the owner experience; with scope everything the owner creates a project and adds a website; with scope one project the owner adds and manages websites in it, cannot create projects, and sees no other project; with scope one website the owner edits, enables, disables, and deletes it and cannot add websites or projects; the Websites page shows installation steps, health, the SDK download, and the "has data arrived" check; the backend screen is read-only for the owner with every backend-level control unavailable and the reason "Only an admin can change the backend."; no deploy, update, rotate, purge, sample data, or key control is ever active; a route the owner may not use redirects to the owner's home with a notice; a website the owner creates shows the note that the admin provides the signing secret; replacing changed setup details keeps other settings; the journey shows stages 3 and 4; axe in both themes

### Implementation for User Story 6

- [ ] T067 [US6] Implement `apps/local-ops-api/src/routes/share.ts` and wire the SDK routes from `apps/local-ops-api/src/static.ts`; add role and scope handling to `apps/admin-web/src/setup/roles.ts` and `apps/admin-web/src/router.ts` (routes carry the roles that may use them; a disallowed route redirects with a notice) and to `useAvailability.ts` (create controls enabled only inside the key's scope, with the reasons from the contract)
- [ ] T068 [US6] Implement the owner experience on `apps/admin-web/src/manage/ProjectsPage.tsx`, `WebsitesPage.tsx`, `WebsitePage.tsx`, and `InstallPage.tsx` (scope-aware create and manage controls, SDK download, the check, and the signing-secret note), `apps/admin-web/src/manage/SharePanel.tsx` on the admin's Website page (a copyable block and a downloadable JSON file of the setup details), and the owner variant of `apps/admin-web/src/setup/ConnectForm.tsx` that accepts pasted or uploaded details or a key

**Checkpoint**: Story 6 works alone.

---

## Phase 10: User Story 7 - An Analyst Sees the Data and the Configuration, and Changes Nothing (Priority: P2) (0.6.4)

**Goal**: An analyst with a read-only key sees the Analytics area and read-only configuration screens, and the
backend refuses any change.

**Independent Test**: As an analyst use every analytics and configuration screen, then attempt every
state-changing operation directly against the backend with the key; each is refused.

### Tests for User Story 7 (write first, confirm they fail)

- [ ] T069 [P] [US7] Write `apps/admin-web/tests/analyst-role.test.tsx` and `apps/admin-web/e2e/analyst.spec.ts`: entering an address and key shows the Analytics area and read-only Projects, Websites, Health, and Backend screens for the key's scope; every control that would change something is present, `aria-disabled`, and says "Your access is read-only."; no screen shows an administrator secret, a signing secret, or any access key; an administrator secret entered under "analyst" is recognized and the admin experience is shown with the `administrator_secret_used` notice; a revoked key shows "Your access was revoked. Ask your admin for a new key." and no stale data (FR-020); axe in both themes; keyboard-only
- [ ] T070 [P] [US7] Write `apps/admin-web/tests/access-page.test.tsx` and e2e cases: the admin's Access screen issues a key (label, role analyst or owner, optional project or website scope), shows it once with a copy control and a confirmation before it is wiped, lists keys without secrets, revokes with a confirmation that names the key, and replaces a key; the controls carry the `manage-access-keys` capability and the screen is absent for other roles
- [ ] T071 [P] [US7] Write `apps/ingest-worker/tests/key-holder-cannot-escalate.test.ts`: with an analyst key and with an owner key, every route that could reveal the administrator secret, the signing secret, another key, or any hash returns nothing of the kind; every backend-level route and the automation interface are refused; responses to key holders contain no secret material

### Implementation for User Story 7

- [ ] T072 [US7] Implement the analyst experience in `apps/admin-web/src/setup/roles.ts`, `apps/admin-web/src/App.tsx`, and `apps/admin-web/src/router.ts` (Analytics plus read-only Manage screens; read-only reasons through `useAvailability.ts`) and the revoked-key handling in `apps/admin-web/src/setup/SetupProvider.tsx`
- [ ] T073 [US7] Implement `apps/admin-web/src/manage/AccessPage.tsx` (issue with role and scope, list, revoke, replace) with the once-only display component shared with the deployment wizard (`apps/admin-web/src/components/SecretReveal.tsx`), and register the route and navigation entry for the admin

**Checkpoint**: Stories 6, 7, and 9 work; roles are enforced by the backend and reflected by the console.

---

## Phase 11: User Story 8 - Retire `install`, Keep Existing Setups Working (Priority: P3)

### Part A: existing setups and the npm documentation (0.6.3)

- [X] T074 [P] [US8] Write `apps/local-ops-api/tests/existing-setup.test.ts` and extend `apps/deploy-cli/tests/unit/cli-console.test.ts`: a file written by the checkout-based `connect` command in each credential mode is recognized by the packaged console with no first-run questions; a OneCLI-mode setup (`ops.json` plus the placeholder) starts through `onecli` and still writes no secret to a file; a damaged file or wrong permissions produces a plain message offering repair without printing contents
- [X] T075 [US8] Implement existing-setup detection in `apps/local-ops-api/src/connection-store.ts` and `apps/cli/src/console-command.ts` (default paths under `~/.config/vizoalica/`), and the repair offer for a damaged or over-permissive file
- [X] T076 [P] [US8] Update the documentation for the npm path (slice 1 wording: install, `vizoalica console`, first run, updating, uninstalling; `vizoalica install` and `pnpm vizoalica` still work in this slice and are marked as the checkout path): `README.md` quick start, `docs/get-started.md`, `docs/index.md`, `docs/operations/operator-local.md`, `docs/operations/local-analytics.md`, `docs/operations/troubleshooting.md`, `llms.txt`, and `CONTRIBUTING.md` (the checkout is for contributors); update the tests that assert documentation content (`docs/tests/site.spec.ts`, `apps/deploy-cli/tests/contract/deployment-docs.contract.test.ts`, `apps/admin-web/tests/docs-links.test.ts`) and correct the "source only" statement in `llms.txt`

### Part B: retire `install` and publish (0.6.4)

- [ ] T077 [P] [US8] Write failing tests in `apps/deploy-cli/tests/unit/cli-guided.test.ts` and `cli-bin.test.ts`: `vizoalica install` deploys and configures nothing, prints "vizoalica install was retired. Run `vizoalica console`; it guides setup.", and exits with code 2; `help` no longer lists it under "Get going" and lists `console` first; `backend`, `connect`, `rotate`, `purge-deleted`, `status`, `verify`, `demo`, `setup`, `doctor`, and `deploy-pages` are unchanged
- [ ] T078 [US8] Retire the command in `scripts/vizoalica.ts` (replace `installCommand` with the stub, update `help()` and `show()`), delete `scripts/cli/install.ts` and its now-unused helpers and tests, and update `apps/deploy-cli/tests/unit/cli-guided.test.ts`
- [ ] T079 [P] [US8] Add `.github/workflows/publish-npm.yml`: runs on a published release and on manual dispatch, `permissions: contents read, id-token write`, runs `pnpm package:build && pnpm package:check`, then `npm publish --provenance --access public` from `apps/cli/package`; guarded by `vars.VIZOALICA_NPM_PUBLISH == 'true'` and otherwise reports "publishing is not set up" and skips; add a workflow test in `apps/deploy-cli/tests/contract/` that the publish step is guarded and pinned actions use commit hashes like the others
- [ ] T080 [P] [US8] Document publishing as the owner's first action in `docs/operations/releases.md` (npm account, two-factor authentication, claiming the name, setting `VIZOALICA_NPM_PUBLISH`, the trusted-publishing or token option, how to verify provenance) and add the npm link to `apps/admin-web/src/footer-links.ts` and its test once the package exists
- [ ] T081 [US8] Update the documentation for the console flow (0.6.4 wording): deploying and updating from the console, the three roles and access keys, sharing setup with a website owner, the analyst and owner experiences, the known limit of the shared signing secret, and the retired command, in `README.md`, `docs/get-started.md`, `docs/operations/cloudflare.md`, `docs/operations/pages.md`, `docs/operations/onecli.md`, `docs/operations/operator-local.md`, `docs/operations/local-analytics.md`, `docs/operations/troubleshooting.md`, `llms.txt`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `docs/.vitepress/theme/IntroVideo.vue`, and `scripts/promo/video/index.html`; add a privacy note in `docs/operations/privacy.md` and the constitution-required entry for access keys in `docs/privacy/` (purpose, retention, access boundary, and what owners and analysts can and cannot see)

---

## Phase 12: Polish and Cross-Cutting Concerns

- [ ] T082 [P] Write the release notes and changelog for 0.6.3 (footer, npm package, console-first start, first run, journey) in `CHANGELOG.md` and `docs/releases/v0.6.3.md`, and for 0.6.4 (versions and console updates, the first numbered migration, access keys and the three roles, console deployment, retired `install`, publishing, and that fresh-install-only ends) in `docs/releases/v0.6.4.md`; add both to `docs/.vitepress/navigation.ts` and `docs/tests/site.spec.ts`; do not bump versions here (that happens in the release tasks)
- [ ] T083 Run the full gates and fix anything they report: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm coverage` (at or above 90% and not below the T001 baseline), `pnpm test:e2e`, `pnpm package:build && pnpm package:check`, `pnpm docs:build`, `pnpm docs:test`, and `pnpm audit --audit-level high`; record results and coverage under "Final gates" in `specs/018-npm-console-first-setup/verification-log.md`
- [ ] T084 Run every scenario in [quickstart.md](./quickstart.md) sections 1 to 8 and record the outcomes under "Quickstart" in `specs/018-npm-console-first-setup/verification-log.md`; run section 9 (a real-account rehearsal, including installing the previous release and updating it from the console while posting test events) only in a separate `git worktree` with scratch `vizoalica-rehearsal-*` resources and a separate `HOME`; run section 10 against the maintainer's running backend read-only first
- [ ] T085 Do the manual accessibility and usability pass the constitution requires and record it in `specs/018-npm-console-first-setup/accessibility-report.md`: keyboard-only and screen-reader walk of first run, the journey, the deployment and update wizard, the versions panel, the Access screen, the owner and analyst screens, and the footer; light and dark; phone width; and the SC-004 comprehension test with a few new users (can they name the next step within ten seconds at each stage)
- [ ] T086 Write `specs/018-npm-console-first-setup/qa-report.md`: a skeptical review as the constitution requires, covering the authorization matrix for all three roles, scope rules, traversal and header checks, secret handling across a deploy, rotate, update, and key-issue cycle (nothing in logs, run records, backups' permissions, or the tarball), the migration rules and adoption of hand-added tables, the update's ordering and failure behavior and the event-loss probe, the retired command, the maintainer's existing setup, and the first-publish checklist; list findings, fixes, and residual risks honestly
- [ ] T087 Roll out to the maintainer's running installation after the 0.6.4 release, with explicit care for the git-ignored production config and no `git clean`: connect the new console to the running 0.6.2 backend read-only first, confirm it shows unknown versions and offers the update, then run the update from the console (backup taken and stored outside the repository, `0002` applied with the hand-added action tables adopted, Worker deployed), confirm the versions match and key management is available, and record the steps and results in `specs/018-npm-console-first-setup/verification-log.md`

---

## Dependencies and execution order

### Phase dependencies

- **Setup (1)**: no dependencies. **Foundational (2)**: after Phase 1; blocks all stories.
- **US1 (3)**, **US2 (4)**: after Phase 2; independent of each other.
- **US3 and US4 (5)**: after Phase 2 (they need the connection store, the unconfigured service, `whoami`, and static serving).
- **Migrations, versions, and access keys (6)**: after Phase 2; independent of Phases 3 to 5. Blocks Phases 7 to 10.
- **US5 (7)**: after Phase 5 and Phase 6; its wizard replaces the placeholder from T026.
- **US9 (8)**: after Phase 6 and Phase 7 (it reuses the deployment engine).
- **US6 (9)** and **US7 (10)**: after Phase 6 and Phase 5.
- **US8 (11)**: Part A after Phase 5; Part B after Phase 7 (retire `install` only once console deployment works).
- **Polish (12)**: after the stories being shipped; T087 after the 0.6.4 release.

### Story dependency graph

```text
Setup ─> Foundational ─┬─> US1 (footer) ───────────────┐
                       ├─> US2 (package) ──────────────┤
                       ├─> US3+US4 (first run, journey)┼─> slice 1 (0.6.3) = US1 + US2 + US3 + US4 + US8 part A
                       └─> Migrations, versions, keys ─┬─> US5 (deploy) ─> US9 (versions and updates) ─┐
                                                       ├─> US6 (owner) ────────────────────────────────┼─> slice 2 (0.6.4)
                                                       └─> US7 (analyst) ──────────────────────────────┘   = Phase 6 + US5 + US9 + US6 + US7 + US8 part B
```

## Parallel opportunities

- **Phase 2**: T004, T006, T008, T010, and T011 are separate files (tests first, then their implementations).
- **US1 and US2** can run in parallel with each other and with the Worker work in Phase 6.
- **Within a story**: all `[P]` test tasks are separate files and can be written together.
- **Slice 2**: Phase 6 (Worker), T049 (ops-core), and the console role screens (Phases 9 and 10) touch different packages.

### Example: slice 1 in parallel across three people or agents

```text
A (console):  T012 T013 T014 T015  ->  T024..T030 (tests)  ->  T032 T033 T034 T035 T036 T037
B (service):  T004..T011  ->  T031  ->  T017 T019
C (package):  T002 T003  ->  T016 T018  ->  T020 T021 T022 T023
```

## Implementation strategy

### Slice 1 first (0.6.3)

Phases 1 to 5 plus Phase 11 part A. It needs no backend or schema change, keeps `vizoalica install` working,
and delivers the footer, the npm package, a console that starts with no backend, the first-run flow, and the
journey. Stop here, run the gates and quickstart sections 1 to 4, and release. Publishing to npm is the owner's
first action and can happen after this release.

### Then slice 2 (0.6.4)

Migrations and versions, access keys and the three roles, console deployment and updates, retiring `install`, and
the live publish workflow. It changes the schema through the first numbered migration, which the console applies to
the maintainer's database with a backup first (T087), and it ends the fresh-install-only rule, so it gets its own
upgrade notes.

### Notes

- Commit after each task or small group; keep the gates green.
- Out of scope, do not build: per-website signing keys, user accounts or logins, automatic update checks or any
  telemetry, Windows support, a non-interactive console-free deploy, Homebrew or a native app, switching between
  several backends, downgrading a Worker or database, rolling back automatically (the backup is the rollback), and
  any change to what the SDK collects.

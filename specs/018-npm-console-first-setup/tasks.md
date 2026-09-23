---
description: "Task list for Install from npm, a Console-First Setup, and Multiple Backend Environments"
---

# Tasks: Install from npm, a Console-First Setup, and Multiple Backend Environments

**Input**: Design documents from `/specs/018-npm-console-first-setup/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included and written first in every story. The constitution requires automated unit,
integration, contract, end-to-end, and negative tests for new behavior, and coverage must stay above 90%
for lines and branches. Write each test task before its implementation tasks and confirm it fails for the
right reason.

**Organization**: Tasks are grouped by user story. This ships as **one 0.7.0 release** (plan, R18) — the
earlier two-slice 0.6.3/0.6.4 patch plan is dropped, since nothing has shipped yet. Phases still run in
dependency order (foundations before what builds on them); there is one set of gates and one release at the
end, not an independently shippable slice partway through.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 to US11, matching the user stories in [spec.md](./spec.md)
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
- Every resource name a deploy or update run creates or touches starts with `<environment>-` (research R26);
  never build one without going through `defaultNames`/`assertResourceName`.
- The console deploy and update engines never call `pnpm build`, never read a repository-relative path, and
  never import across a package boundary with a relative path (`../../../scripts/...`); they depend only on
  `packages/ops-core` (a real workspace dependency) and the packaged artifacts under the running module's own
  install location (research R27).
- Comments explain non-obvious intent only. Keep `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` green
  at every commit.

---

## Phase 1: Setup — DONE

- [X] T001 Confirm the branch is green before any change and record the baseline in `specs/018-npm-console-first-setup/verification-log.md`
- [X] T002 [P] Rename the root package to `vizoalica-workspace` in `package.json`
- [X] T003 [P] Create the package skeleton `apps/cli`

## Phase 2: Foundational — DONE

- [X] T004-T011 Connection store (now superseded by the environment store, Phase 7), static serving, the
  unconfigured server, `compat.ts`, and `whoami()`/`backendInfo()` on the Worker client

## Phase 3: User Story 1 - A Footer That Points Home and to the Project (P1) — DONE

- [X] T012-T015 Footer tests and implementation

## Phase 4: User Story 2 - Install from npm and Start with One Command (P1) — DONE

- [X] T016-T023 Package skeleton, `main.ts`/`console-command.ts`, `build-package.mjs` (console, SDK, schema —
  the Worker prebundle step is added in Phase 8, T099), `check-package.mjs`, CI job, README

## Phase 5: User Stories 3 and 4 - First Run, and What Is Possible Now (P1) — DONE, revisited in Phase 7

- [X] T024-T038 Setup state, `setup/state.ts` and `stages.ts`, the console's `SetupProvider`, `FirstRun`,
  `Journey`, `useAvailability`, `ActionButton`, and the existing-screen availability wiring

  Phase 7 (T054-T057) revisits `FirstRun.tsx`, `setup/state.ts`, and the mock console to add naming the first
  environment; nothing here needs to be redone, only extended.

## Phase 6: Migrations, Versions, and Access Keys on the Worker (blocks US5, US6, US7, and US9) — DONE

- [X] T039-T048 `0002_access_keys.sql`, the migration-shape checks, `schema-version.ts`, `GET
  /v1/admin/backend`, access-key generation/hashing/verification, the per-role route matrix, and the local
  guards in `apps/local-ops-api/src/routes/access-keys.ts`

  Unaffected by multiple environments: each environment is already a separate Worker and database, so a key
  or a route decision never needs to know which environment it is in (research R24).

## Phase 6B: `packages/ops-core` completion — DONE

- [X] T049 [US5] Move `setUpBackend`, `Ctx`, `OpsError`, and the terminal/process helpers (not only the pure
  parsers/names/config-render/secrets helpers T049 originally scoped) from `scripts/cli/{backend,context,
  terminal}.ts` into `packages/ops-core/src/{backend,context,terminal}.ts`; make `apps/local-ops-api` depend
  on `@vizoalica/ops-core` as an ordinary workspace package (`package.json` dependency, `tsconfig.json`
  reference) instead of reaching across directories with relative imports; turn
  `scripts/cli/{backend,context,terminal}.ts` into thin re-export shims so the checkout's guided CLI commands
  (`connect`, `demo`, `rotate`, `vizoalica.ts`) are unaffected. Add `apps/local-ops-api/src/deploy/wrangler.ts`
  (the pinned, on-demand Wrangler runner: `PINNED_WRANGLER_VERSION`, `VIZOALICA_WRANGLER` override, argument
  arrays only, output caps and a timeout) and wire it as `console-ctx.ts`'s default runner

---

## Phase 7: User Story 10 - Manage Multiple Backend Environments (Priority: P1) (blocks US5, US6, US7, US9)

**Goal**: An admin creates, names, selects, and removes environments; every screen reflects only the selected
one; every resource name an environment's deploy creates carries its prefix; each environment's Cloudflare
credential (stored token or OneCLI) is independent.

**Independent Test**: Create two environments in the same Cloudflare account with different names against a
fake Wrangler, confirm every plan and detect call only ever uses that environment's prefixed names, switch
between them, and confirm every screen's data changes with nothing left over from the previous one.

### Tests for User Story 10 (write first, confirm they fail)

- [X] T050 [P] [US10] Write `packages/ops-core/tests/environment-names.test.ts`: `assertEnvironmentName`
  accepts lowercase letters, digits, and dashes, starting with a letter, and refuses anything else (spaces,
  uppercase, a leading digit or dash, empty, and a name long enough that `<name>-vizoalica-worker` would
  exceed Cloudflare's resource-name limit); `defaultNames(env)` returns `{ worker: "<env>-vizoalica-worker",
  database: "<env>-vizoalica-db", bucket: "<env>-vizoalica-bucket" }`; `assertResourceName(kind, name, env)`
  now requires `env` and refuses a `name` that does not start with `` `${env}-` ``, with the existing
  character and length rules still applied to the remainder
- [X] T051 [P] [US10] Write `apps/local-ops-api/tests/environment-store.test.ts`: `list()` on an empty store;
  `create(name, cloudflare)` writes `~/.config/vizoalica/environments/<name>.json` at mode 0600 with
  `VIZOALICA_ENV_NAME`, and either `VIZOALICA_CF_MODE: "token"` plus `VIZOALICA_CF_API_TOKEN` (mode 0600,
  never logged) or `VIZOALICA_CF_MODE: "onecli"` with no token field, and makes it active; a second `create`
  with a colliding name is refused (`environment_name_taken`) before anything is written; an invalid name is
  refused (`invalid_environment_name`) per T050's rules; `select(name)` updates
  `~/.config/vizoalica/active-environment.json` atomically and an unknown name is refused
  (`environment_not_found`); `remove(name)` deletes the file and, only if it was active, clears the active
  pointer (a non-active removal leaves the pointer alone); `active()` returns `undefined` on an empty store;
  `current()` (replacing `ConnectionStore#current`) returns the active environment's connection in the exact
  shape today's single connection file used, so `setup/state.ts` and the client-rebuild logic in `server.ts`
  need no change beyond the import; concurrent `create`/`select`/`remove` calls never leave a partial file;
  loading a pre-0.7.0 single `local-operations.json` with no `environments/` directory yet is out of scope
  here (covered by T090)
- [X] T052 [P] [US10] Write `apps/local-ops-api/tests/environments-routes.contract.test.ts` for
  [contracts/local-service-api.md](./contracts/local-service-api.md) "Environments": `GET /api/environments`
  (list with status and which is active, available to every role); `POST /api/environments` (creates and
  activates, `403` when an environment is already active and its principal is not admin, allowed when no
  environment exists yet); `POST /api/environments/:name/select` (available to every role, the very next
  request reflects the new active environment with no restart); `POST /api/environments/:name/connect`
  (verifies against `:name`'s own backend, independent of whichever environment is currently active); `DELETE
  /api/environments/:name` (`{ confirm: true }`, `403` unless `:name`'s own principal is admin, never calls
  Cloudflare); `404 environment_not_found` for an unknown name on select/connect/remove
- [X] T053 [P] [US10] Write `apps/admin-web/tests/environment-switcher.test.tsx` and
  `apps/admin-web/e2e/environments.spec.ts` against the mock console: with one environment, only a small,
  unobtrusive label is shown, no switcher chrome; with two or more, a switcher lists every environment by
  name and status, selecting one calls the select route and every screen (journey, versions, projects,
  websites, analytics, access keys) refreshes with nothing left over from the previous environment (a route
  spy asserts each of those screens' data-loading calls fire again after a switch); creating an environment
  asks for a name (validated live per T050's rules) and a Cloudflare credential choice (stored token, or
  OneCLI), and refuses a colliding name before submission; removing one asks for confirmation naming it and
  states plainly that this does not delete Cloudflare resources; a website owner or analyst never sees the
  switcher (their key fixes their environment); axe in both themes; keyboard-only

### Implementation for User Story 10

- [X] T054 [US10] Add `assertEnvironmentName` and `defaultNames(env)` to `packages/ops-core/src/names.ts`,
  and change `assertResourceName` to take and enforce the environment prefix (update every existing caller:
  `packages/ops-core/src/backend.ts`, `apps/local-ops-api/src/deploy/engine.ts`, and the checkout's guided
  commands, which pass their existing single default names' environment as a fixed literal so checkout
  behavior for `vizoalica backend`/`connect` is unchanged — see the note on Phase 8 for why the console path
  uses the real active environment instead)
- [X] T055 [US10] Implement `apps/local-ops-api/src/environment-store.ts` (replacing
  `connection-store.ts`): `list`, `create`, `select`, `remove`, `active`, `current` (per T051), each backed by
  `~/.config/vizoalica/environments/<name>.json` and `~/.config/vizoalica/active-environment.json`; keep the
  existing connection-file validation, atomic-write, and 0600 rules from `connection-store.ts` for the
  per-environment file; update every import of `ConnectionStore` (`server.ts`, `setup/state.ts`, `routes/*`,
  `deploy/engine.ts`) to `EnvironmentStore`
- [X] T056 [US10] Implement `apps/local-ops-api/src/routes/environments.ts` per T052's contract, wired into
  `apps/local-ops-api/src/server.ts`; extend `apps/local-ops-api/src/setup/state.ts` so `needsFirstRun` is
  `true` exactly when the environment list is empty and the setup state's `environment` field lists every
  saved environment and which is active (data model)
- [X] T057 [US10] Add the client calls (`listEnvironments`, `createEnvironment`, `selectEnvironment`,
  `connectEnvironment`, `removeEnvironment`) and types to `apps/admin-web/src/api/local-operations.ts` with
  tests extending `apps/admin-web/tests/local-operations.api.test.ts`; implement
  `apps/admin-web/src/setup/EnvironmentSwitcher.tsx` per T053 and mount it in the connected shell in
  `apps/admin-web/src/App.tsx`, alongside the footer; add the `manage-environments` capability
  (create/remove only — selecting is not gated, per [contracts/console-availability.md](./contracts/console-availability.md)) to `apps/admin-web/src/capabilities.ts` and `useAvailability.ts`
- [X] T058 [US10] Extend `apps/admin-web/src/setup/FirstRun.tsx` and `apps/local-ops-api/src/setup/state.ts`:
  an admin with no environment names one (a suggested default offered, validated live) as part of the same
  step that asks "I need a backend" or "I already have one" (not a fourth question, per
  [contracts/console-availability.md](./contracts/console-availability.md) "First-run questions"); creating
  the environment also asks for its Cloudflare credential choice when the admin is about to deploy (token or
  OneCLI), deferred until Phase 8's deploy wizard when only connecting to an existing backend; update
  `apps/admin-web/tests/first-run.test.tsx` and `apps/admin-web/e2e/first-run.spec.ts` for the combined step
- [X] T059 [US10] Update the mock console and fixtures for environments:
  `apps/admin-web/e2e/mock-console.ts` and `apps/admin-web/tests/fixtures/console.ts` (single-environment,
  multi-environment, and no-environment setup-state variants; the environments list and select/create/remove
  handlers)

**Checkpoint**: Story 10 works alone against a fake Wrangler. Quickstart section 8 (environment parts) passes.

---

## Phase 8: User Story 5 and User Story 11 - The Admin Deploys and Maintains the Backend From the Console, Using Only What Shipped (Priority: P1) (blocks US9)

**Goal**: Deploy, connect, rotate, purge, and add or remove sample data for the selected environment from the
console, with a reviewed plan, approval, resumable steps, secrets shown once, and — correcting the first
implementation pass — using only the Worker bundle and migrations shipped inside the installed package, never
building from or reading a source checkout.

**Independent Test**: With a Cloudflare account and no backend, deploy an environment entirely from the
console on a machine with only the installed npm package present; the plan was shown first, nothing was
created before approval, secrets were shown once, the backend is healthy and connected, and every step used
only packaged files. Repeat as a connection to an existing backend, and as a second environment in the same
Cloudflare account, confirming no collision with the first.

**Scope decisions made while implementing this phase** (see the review notes for the full list): no
interactive `/api/deploy/signin` or `/api/deploy/tool` route — neither credential mode (token or OneCLI)
needs one, since both are configured upfront at environment-creation time and OneCLI brokers Cloudflare
access transparently; `connect-existing` reuses the existing `/api/environments/:name/connect` route rather
than a separate `connect-existing` endpoint; sample-data management (`demo`) is deferred (it drives the
ingest API, not Wrangler, so it does not fit this engine and is a separate, later addition); `package-paths.ts`
(T066) became explicit `workerBundle`/`wranglerTemplate`/`schemaDir` fields threaded through `ServiceOptions`
→ `ServerOptions` → `EngineDeps` (matching how `schemaDir` already flowed) instead of a self-resolving
`import.meta.url` module, and T061's packaged-only guarantee is verified this way plus by the real
`apps/cli/tests/worker-bundle.test.ts` dry-run and `pnpm package:check`, rather than a `process.cwd()`
fixture test.

### Tests for User Story 5 and 11 (write first, confirm they fail)

- [X] T060 [P] [US5] Write `apps/local-ops-api/tests/deploy-engine.test.ts` against a fake Wrangler: the plan
  lists every resource with a name starting with the selected environment's prefix, its purpose, and the cost
  note, and creates nothing; a run cannot start without approval of that exact plan; steps run
  `prepare-tool`, `check-signin`, `detect`, `create-database`, `create-bucket`, `write-config`,
  `create-tables`, `deploy-worker`, `store-secrets`, `verify-health`, `connect`, in that order; a failed step
  stops with what failed and what already exists; a resumed run repeats no finished step and creates no
  duplicate; a resource this run did not create blocks the flow with the choice to pick new names or connect;
  `detect` and `cleanup` only ever match the plan's exact names, so a same-prefix resource from a different,
  unrelated run is never listed or touched; cleanup requires `confirm: true` and removes only what the run
  created; the run record contains the environment name, names, and statuses and never a secret; generated
  secrets are held in memory, revealed once by a single-use call, then `410`, and wiped after 10 minutes if
  unrevealed; only the administrator secret is written, to the run's environment's connection file, when the
  run connects; Wrangler is spawned with an argument array and no shell; a resource name failing the
  environment-prefix or character rules is refused before any call; the run's Wrangler invocations carry
  exactly the run's environment's Cloudflare credential (`CLOUDFLARE_API_TOKEN` for `token` mode, the OneCLI
  wrapper for `onecli` mode) and nothing from any other environment; a missing R2 activation is reported
  before anything is created
- [X] T061 [P] [US11] Write `apps/local-ops-api/tests/deploy-engine-packaged.test.ts`: with `process.cwd()`
  pointed at a scratch directory containing only a copy of `apps/cli/package/dist/` (no `deploy/`, no
  `scripts/`, no root `package.json`), `preflight`, `buildPlan`, and a first-install run all succeed reading
  only `dist/worker/index.mjs`, `dist/worker/wrangler.template.toml`, and `dist/schema/*.sql`; asserts the
  engine never calls a `build` function and never reads a path outside `dist/` and
  `~/.config/vizoalica/{environments,deployments,deploy,backups}/`
- [X] T062 [P] [US5] Write `apps/local-ops-api/tests/deploy-routes.contract.test.ts` for
  [contracts/local-service-api.md](./contracts/local-service-api.md) "Deployment and updates" and "Backend,
  versions, and maintenance": admin only (`403` for an analyst or owner, `409 backend_not_connected` where a
  connection is required), input validation (rejecting a `names` override that does not carry the active
  environment's prefix), `preflight` states (tool being prepared, ready, signed out, signed in with accounts,
  existing resources matching this environment's prefix only), token-mode environments skip the sign-in step,
  `signin` for OneCLI-mode environments returns the URL the tool prints, polling shows step progress,
  `rotate/:kind` for `admin`, `token`, and `digest` reveals the new value once, `purge-deleted` dry run versus
  apply, and `demo` add and remove — all scoped to the active environment
- [X] T063 [P] [US5] Write `apps/local-ops-api/tests/wrangler-pin.test.ts`: `PINNED_WRANGLER_VERSION` equals
  the version in the root `package.json` devDependencies (stripped of its range prefix), so they move
  together; `VIZOALICA_WRANGLER` overrides the command; the default command is `npm exec --yes
  --package=wrangler@<pinned> -- wrangler`
- [X] T064 [P] [US5] Write `apps/admin-web/tests/deploy-wizard.test.tsx` and `apps/admin-web/e2e/deploy.spec.ts`
  against the mock console: the wizard operates on the selected environment (its name and prefix shown in the
  plan); preflight states including the first-time tool download with progress, sign-in guidance for
  OneCLI-mode environments that returns to the flow (token-mode environments skip straight to the plan), the
  plan and the Approve control (disabled until the plan is shown), progress announced through a live region,
  a failed step with resume and the cleanup confirmation naming what will be removed, the secrets shown once
  with copy controls and a confirmation before they are wiped, success connecting the environment, and the
  connect-existing path; the backend screen shows the address and health and the rotate, purge, and demo
  actions with confirmations that name what will happen; axe in both themes; keyboard-only

### Implementation for User Story 5 and 11

- [X] T065 [US11] Write the Worker prebundle step in `scripts/build-package.mjs`: esbuild the Worker
  (`apps/ingest-worker/src/index.ts`) to `apps/cli/package/dist/worker/index.mjs` (ESM, target node, the same
  aliases as the existing bundle step, `define` the Worker version and the expected schema version — the
  highest migration number — at build time) and write `apps/cli/package/dist/worker/wrangler.template.toml`
  derived from `deploy/cloudflare/wrangler.example.toml` (`no_bundle = true`, `main` pointing at the sibling
  `index.mjs`, a `migrations_dir` placeholder for the packaged `dist/schema`, and only placeholders otherwise);
  add `apps/cli/tests/worker-bundle.test.ts` asserting `wrangler deploy --dry-run` (the repository's own
  pinned Wrangler) accepts the bundle and a filled-in template; add `dist/worker/**` to the package allowlist
  check in `scripts/check-package.mjs`
- [X] T066 [US11] Implement `apps/local-ops-api/src/deploy/package-paths.ts`: resolves the Worker bundle, its
  Wrangler template, and the schema directory relative to this module's own `import.meta.url`, so it finds
  `dist/worker/index.mjs`, `dist/worker/wrangler.template.toml`, and `dist/schema/*.sql` whether this code is
  running bundled inside `apps/cli/package/dist/cli.mjs` (an npm install) or unbundled from
  `apps/local-ops-api/src` in a checkout that has run `pnpm package:build` (which produces the same
  `apps/cli/package/dist/` tree); throws a plain, actionable error (not a stack trace) if the packaged files
  are missing, naming `pnpm package:build` as the fix for a checkout
- [X] T067 [US5] Rewrite `apps/local-ops-api/src/deploy/engine.ts` to stop reusing `setUpBackend` (checkout-
  only) and instead implement the first-install step sequence natively against `pinnedWrangler` (T049),
  `package-paths.ts` (T066), and `packages/ops-core`'s parsers/names/secrets: `prepare-tool` (resolve the
  runner), `check-signin` (skipped for token-mode environments), `detect` (exact-name match against the
  plan's names only), `create-database`, `create-bucket`, `write-config` (render `wrangler.template.toml` plus
  the environment's names and the created database's id into
  `~/.config/vizoalica/deploy/<worker>/wrangler.toml`, never the package directory), `create-tables`
  (`wrangler d1 migrations apply … --remote --config <rendered>` against the packaged `dist/schema`),
  `deploy-worker` (`wrangler deploy --config <rendered>` against the packaged `dist/worker/index.mjs`),
  `store-secrets`, `verify-health`, `connect` (saves to the run's environment's file via `EnvironmentStore`);
  keep `runs.ts` and `vault.ts` as they are (already environment-agnostic; the run record just gains the
  `environment` field from T060); delete the dependency on `console-ctx.ts`'s `Ctx`/`Prompter` machinery for
  this path (it stays available for anything that still needs `setUpBackend`, i.e. nothing in the console
  after this task)
- [X] T068 [US5] Implement `apps/local-ops-api/src/routes/deploy.ts` and `apps/local-ops-api/src/routes/
  backend.ts` (`preflight`, `tool`, `signin`, `plan`, `runs`, `runs/:id`, `resume`, `cleanup`, `reveal`,
  `connect-existing`, and the maintenance routes), every one reading the active environment via
  `EnvironmentStore`, verify health and administrator access before connecting, and write an audit line per
  admin action without secret values
- [X] T069 [US5] Implement `apps/admin-web/src/manage/DeployWizard.tsx` and `apps/admin-web/src/manage/
  BackendPage.tsx` (environment name and prefix shown, address, health, and the rotate, purge, and demo
  actions with named confirmations), add the `setup/deploy` and `manage/backend` routes and navigation,
  replace the placeholder from T058 so an admin with no backend in the selected environment lands in the
  wizard, and add the client calls to `apps/admin-web/src/api/local-operations.ts`

**Checkpoint**: Stories 5 and 11 work together, against a fake Wrangler and against the real packaged bundle
(T061). Quickstart sections 6 and 8 pass.

---

## Phase 9: User Story 9 - See the Worker and Database Versions and Update Them From the Console (Priority: P1)

**Goal**: Every role sees the selected environment's three versions and their status; an admin updates that
environment's database and then its Worker with a plan, a backup, and verification, without interrupting data
collection, and without touching any other environment.

**Independent Test**: With one environment one release behind and a second environment current, open the
versions panel for each, update the behind one from the console, and confirm the plan was shown first, a
backup was taken, the database changed before the Worker, the versions now match, no accepted event was lost,
an audit record exists, and the current environment was never touched.

### Tests for User Story 9 (write first, confirm they fail)

- [ ] T070 [P] [US9] Write `apps/local-ops-api/tests/update-engine.test.ts` against a fake Wrangler whose `d1
  migrations apply` applies the packaged migration files (via T066's `package-paths.ts`) to a real SQLite
  database and records them in `d1_migrations`, and whose `d1 export` writes a real file: the update plan
  shows the Worker from and to, each pending migration with its plain description and whether it only adds,
  the non-additive flag, and the backup; nothing changes before approval; steps run `prepare-tool`,
  `check-signin` (skipped in token mode), `read-versions`, `backup`, `migrate` (skipped when the schema is
  current), `deploy-worker` (skipped when the Worker is current), `verify`, `record`, with the backup before
  the first migration and the database before the Worker; only what is behind runs; a failed migration stops
  with what was applied, leaves the backend serving, and a resumed run repeats no finished step; declining the
  backup needs `skipBackup.confirm` and is recorded, and is refused when a non-additive change is pending; a
  backup that cannot be taken stops the flow; a Worker or schema newer than the package is refused with no
  downgrade; an unsupported schema is refused with guidance; an unknown version is treated as behind; a
  database with hand-added tables is adopted; ingestion requests sent through the real Worker between steps
  are all accepted; the run record lists the environment, versions before and after, the migrations applied,
  and the backup path, and never a secret; an update run against one environment issues no Wrangler call
  carrying any other environment's credential or names
- [ ] T071 [P] [US9] Write `apps/local-ops-api/tests/backend-versions.contract.test.ts`: `GET /api/backend`
  returns the active environment's Worker and schema versions and their statuses for a current, a
  one-release-behind, a newer, an unknown (older Worker), and an unsupported backend, the versions this
  console carries, and the pending database changes; every role can read it; an older Worker without the
  version routes yields unknown and an offered update; switching the active environment changes what this
  route reports with no restart
- [ ] T072 [P] [US9] Write `apps/admin-web/tests/versions-panel.test.tsx` and `apps/admin-web/e2e/update.spec.ts`
  against the mock console: the three rows (Console, Worker, Database schema) for the selected environment,
  each with status text and icon (*Up to date*, *Update available*, *Console is older*, *Unknown*,
  *Unsupported*); every role sees it read-only; the admin sees **Update backend** when something is behind and
  other roles see it unavailable with their reason; the update plan and approval, the backup shown before
  migrating, progress announced through a live region, a failed step with resume, the declined-backup
  confirmation, and the result with matching versions; switching environments swaps the whole panel; axe in
  both themes; keyboard-only

### Implementation for User Story 9

- [ ] T073 [US9] Implement `apps/local-ops-api/src/deploy/update.ts` (the `update-backend` mode, per T070),
  reusing the rewritten `deploy/engine.ts` (T067) and `package-paths.ts` (T066), and wire the
  `update-backend` mode and the `skipBackup` confirmation into `apps/local-ops-api/src/routes/deploy.ts`
- [ ] T074 [US9] Implement `GET /api/backend` in `apps/local-ops-api/src/routes/backend.ts` (versions,
  statuses from `compat.ts`, the versions this console carries, pending changes, all for the active
  environment) and carry the version statuses into the setup state in `apps/local-ops-api/src/setup/state.ts`
- [ ] T075 [US9] Implement `apps/admin-web/src/manage/VersionsPanel.tsx` on the backend screen and the update
  flow in `apps/admin-web/src/manage/DeployWizard.tsx` (plan, approval, backup, progress, failure and resume,
  result), with the messages for older, newer, unknown, and unsupported backends and the role reasons from
  [contracts/console-availability.md](./contracts/console-availability.md); make key management and sharing
  unavailable with "This backend needs an update before it can issue keys." when `features.accessKeys` is
  false
- [ ] T076 [P] [US9] Write the migration guide `docs/operations/schema-versions.md` (what the three versions
  mean, how updates work per environment, the backup and where it is saved, how to restore it, the additive
  rule, the oldest updatable schema, and what to do with an unsupported one) and the authoring rules for
  contributors in `CONTRIBUTING.md`; rewrite the "Deployment boundary" section of `docs/operations/releases.md`
  to end the fresh-install-only rule, and update the update section of `docs/operations/cloudflare.md`

**Checkpoint**: Story 9 works alone, per environment. Quickstart sections 7 and 8 pass.

---

## Phase 10: User Story 6 - A Website Owner Manages Their Projects and Websites (Priority: P2)

**Goal**: An owner, with only an owner key issued from one environment, manages projects and websites within
scope in that environment, installs and checks a website, sees analytics, is never offered a backend-changing
control, and never sees another environment.

**Independent Test**: As an owner, create or configure a website within scope in one environment, follow the
console through installing it until the check reports data, then try every backend-level and out-of-scope
operation and confirm each is refused; confirm the owner never sees the environment switcher or any other
environment's data.

### Tests for User Story 6 (write first, confirm they fail)

- [ ] T077 [P] [US6] Write `apps/local-ops-api/tests/share.test.ts`: `POST /api/websites/:id/share` (admin
  only, active-environment only) issues an owner key limited to that website (or an analyst key when `role`
  says so) and returns the setup details of [data-model.md](./data-model.md) (worker address, ids, public
  source key, allowed origins, guidance, key) with no administrator secret and no signing secret; the details
  are not stored by the service; `GET /api/sdk/*` is available to every role
- [ ] T078 [P] [US6] Write `apps/admin-web/tests/owner-role.test.tsx` and `apps/admin-web/e2e/owner.spec.ts`:
  entering setup details (paste or file) or an owner key connects and shows the owner experience for that key's
  one environment, with no environment switcher visible; with scope everything the owner creates a project
  and adds a website; with scope one project the owner adds and manages websites in it, cannot create
  projects, and sees no other project; with scope one website the owner edits, enables, disables, and deletes
  it and cannot add websites or projects; the Websites page shows installation steps, health, the SDK
  download, and the "has data arrived" check; the backend screen is read-only for the owner with every
  backend-level control unavailable and the reason "Only an admin can change the backend."; no deploy,
  update, rotate, purge, sample data, or key control is ever active; a route the owner may not use redirects
  to the owner's home with a notice; a website the owner creates shows the note that the admin provides the
  signing secret; replacing changed setup details keeps other settings; the journey shows stages 3 and 4; axe
  in both themes

### Implementation for User Story 6

- [ ] T079 [US6] Implement `apps/local-ops-api/src/routes/share.ts` and wire the SDK routes from
  `apps/local-ops-api/src/static.ts`; add role and scope handling to `apps/admin-web/src/setup/roles.ts` and
  `apps/admin-web/src/router.ts` (routes carry the roles that may use them; a disallowed route redirects with
  a notice) and to `useAvailability.ts` (create controls enabled only inside the key's scope); hide
  `EnvironmentSwitcher` (T057) for the owner and analyst roles
- [ ] T080 [US6] Implement the owner experience on `apps/admin-web/src/manage/ProjectsPage.tsx`,
  `WebsitesPage.tsx`, `WebsitePage.tsx`, and `InstallPage.tsx` (scope-aware create and manage controls, SDK
  download, the check, and the signing-secret note), `apps/admin-web/src/manage/SharePanel.tsx` on the
  admin's Website page (a copyable block and a downloadable JSON file of the setup details), and the owner
  variant of `apps/admin-web/src/setup/ConnectForm.tsx` that accepts pasted or uploaded details or a key

**Checkpoint**: Story 6 works alone.

---

## Phase 11: User Story 7 - An Analyst Sees the Data and the Configuration, and Changes Nothing (Priority: P2)

**Goal**: An analyst with a read-only key issued from one environment sees the Analytics area and read-only
configuration screens for that environment, and the backend refuses any change; the analyst never sees
another environment.

**Independent Test**: As an analyst use every analytics and configuration screen, then attempt every
state-changing operation directly against that environment's backend with the key; each is refused; confirm
the key is refused outright against a different environment's backend.

### Tests for User Story 7 (write first, confirm they fail)

- [ ] T081 [P] [US7] Write `apps/admin-web/tests/analyst-role.test.tsx` and `apps/admin-web/e2e/analyst.spec.ts`:
  entering an address and key shows the Analytics area and read-only Projects, Websites, Health, and Backend
  screens for the key's scope in its one environment, with no environment switcher; every control that would
  change something is present, `aria-disabled`, and says "Your access is read-only."; no screen shows an
  administrator secret, a signing secret, or any access key; an administrator secret entered under "analyst"
  is recognized and the admin experience is shown with the `administrator_secret_used` notice; a revoked key
  shows "Your access was revoked. Ask your admin for a new key." and no stale data (FR-020); axe in both
  themes; keyboard-only
- [ ] T082 [P] [US7] Write `apps/admin-web/tests/access-page.test.tsx` and e2e cases: the admin's Access
  screen issues a key (label, role analyst or owner, optional project or website scope) for the active
  environment, shows it once with a copy control and a confirmation before it is wiped, lists keys without
  secrets, revokes with a confirmation that names the key, and replaces a key; the controls carry the
  `manage-access-keys` capability and the screen is absent for other roles; switching the environment swaps
  the whole key list
- [ ] T083 [P] [US7] Write `apps/ingest-worker/tests/key-holder-cannot-escalate.test.ts` and extend
  `apps/ingest-worker/tests/access-key-authorization.test.ts` with a cross-environment case: a key created
  against one real SQLite-backed Worker instance is presented to a second, separately seeded instance and is
  refused (`401`), proving environment isolation is a property of separate Worker/database pairs and needs no
  extra check in the route matrix; with an analyst key and with an owner key, every route that could reveal
  the administrator secret, the signing secret, another key, or any hash returns nothing of the kind; every
  backend-level route and the automation interface are refused

### Implementation for User Story 7

- [ ] T084 [US7] Implement the analyst experience in `apps/admin-web/src/setup/roles.ts`,
  `apps/admin-web/src/App.tsx`, and `apps/admin-web/src/router.ts` (Analytics plus read-only Manage screens;
  read-only reasons through `useAvailability.ts`) and the revoked-key handling in
  `apps/admin-web/src/setup/SetupProvider.tsx`
- [ ] T085 [US7] Implement `apps/admin-web/src/manage/AccessPage.tsx` (issue with role and scope for the
  active environment, list, revoke, replace) with the once-only display component shared with the deployment
  wizard (`apps/admin-web/src/components/SecretReveal.tsx`), and register the route and navigation entry for
  the admin

**Checkpoint**: Stories 6, 7, 9, 10, 11, and 5 all work together; roles and environments are both enforced by
the backend and the local service and reflected by the console.

---

## Phase 12: User Story 8 - Retire `install`, Keep Existing Setups Working (Priority: P3)

### Part A: existing setups — DONE (pre-environments; T090 below adapts it)

- [X] T086-T088 Existing-setup detection in a single connection file, documentation for the npm path

### Part B: retire `install` and publish — DONE

- [X] T089 `vizoalica install` retired, `.github/workflows/publish.yml` guarded by `VIZOALICA_NPM_PUBLISH`,
  publishing documented

### Part C: import an existing single-backend setup as the first environment (NEW, needed once T055's
`EnvironmentStore` replaces the single connection store)

- [ ] T090 [P] [US8] Write `apps/local-ops-api/tests/existing-setup-import.test.ts`: a pre-0.7.0
  `~/.config/vizoalica/local-operations.json` (file mode, and OneCLI mode) found on first use with no
  `environments/` directory yet is offered, once, as the first environment (the admin names it — a sensible
  default such as `default` or `prod` is suggested — instead of it being silently imported, since it needs a
  name to become a prefix per R26); after naming, its address, credential, and role hint move into
  `environments/<name>.json` exactly as they were, the old file is left alone (never deleted, so a downgrade
  to a pre-0.7.0 checkout command still finds it), and no first-run questions beyond the name appear; a
  machine with both a legacy file and an `environments/` directory already present treats the legacy file as
  already imported (ignored, not re-offered); a damaged or over-permissive legacy file produces the existing
  plain repair message rather than being imported
- [ ] T091 [US8] Implement the import offer in `apps/local-ops-api/src/environment-store.ts` (detects the
  legacy file, exposes it in the setup state as a one-time "import this as your first environment, name it"
  step) and `apps/admin-web/src/setup/FirstRun.tsx` (the naming prompt, distinct from creating a brand-new
  environment); extend `apps/deploy-cli/tests/unit/cli-console.test.ts` and
  `apps/local-ops-api/tests/existing-setup.test.ts` accordingly
- [ ] T092 [US8] Update the documentation for the console flow (0.7.0 wording): environments and how to
  create and switch between them, per-environment Cloudflare credentials (token or OneCLI), the enforced
  naming prefix, deploying and updating from the console, the three roles and access keys (per environment),
  sharing setup with a website owner, the analyst and owner experiences, the known limit of the shared signing
  secret, and the retired command, in `README.md`, `docs/get-started.md`, `docs/operations/cloudflare.md`,
  `docs/operations/pages.md`, `docs/operations/onecli.md`, `docs/operations/operator-local.md`,
  `docs/operations/local-analytics.md`, `docs/operations/troubleshooting.md`, `llms.txt`,
  `.github/ISSUE_TEMPLATE/bug_report.yml`, `docs/.vitepress/theme/IntroVideo.vue`, and
  `scripts/promo/video/index.html`; add a privacy note in `docs/operations/privacy.md` and the
  constitution-required entry for access keys in `docs/privacy/` (purpose, retention, access boundary, and
  what owners and analysts can and cannot see, noting a key never crosses environments)

---

## Phase 13: Polish and Cross-Cutting Concerns

- [ ] T093 [P] Write the release notes and changelog for **0.7.0** (footer, npm package, console-first
  start, first run, journey, versions and console updates, the first numbered migration, access keys and the
  three roles, console deployment from packaged artifacts, multiple backend environments, retired `install`,
  publishing) in `CHANGELOG.md` and `docs/releases/v0.7.0.md`; add it to `docs/.vitepress/navigation.ts` and
  `docs/tests/site.spec.ts`; bump every version reference that still says 0.6.3/0.6.4 in the docs sweep (T092)
  and this feature's own artifacts to 0.7.0
- [ ] T094 Run the full gates and fix anything they report: `pnpm typecheck`, `pnpm lint`, `pnpm
  format:check`, `pnpm coverage` (at or above 90% and not below the T001 baseline), `pnpm test:e2e`, `pnpm
  package:build && pnpm package:check`, `pnpm docs:build`, `pnpm docs:test`, and `pnpm audit --audit-level
  high`; record results and coverage under "Final gates" in
  `specs/018-npm-console-first-setup/verification-log.md`
- [ ] T095 Run every scenario in [quickstart.md](./quickstart.md) sections 1 to 9 and record the outcomes
  under "Quickstart" in `specs/018-npm-console-first-setup/verification-log.md`; run section 10 (a real-account
  rehearsal, including a second environment in the same Cloudflare account and installing the previous
  release and updating it from the console while posting test events) only in a separate `git worktree` with
  scratch `vizoalica-rehearsal-*` resources and a separate `HOME`; run section 11 against the maintainer's
  running backend read-only first
- [ ] T096 Do the manual accessibility and usability pass the constitution requires and record it in
  `specs/018-npm-console-first-setup/accessibility-report.md`: keyboard-only and screen-reader walk of first
  run (including naming an environment), the journey, the environment switcher, the deployment and update
  wizard, the versions panel, the Access screen, the owner and analyst screens, and the footer; light and
  dark; phone width; and the SC-004 comprehension test with a few new users
- [ ] T097 Write `specs/018-npm-console-first-setup/qa-report.md`: a skeptical review covering the
  authorization matrix for all three roles (including cross-environment key refusal), scope rules, traversal
  and header checks, secret handling across a deploy, rotate, update, and key-issue cycle (nothing in logs,
  run records, backups' permissions, environment files, or the tarball), the resource-name-prefix enforcement
  under two environments sharing one account, the migration rules and adoption of hand-added tables, the
  update's ordering and failure behavior and the event-loss probe, the retired command, the maintainer's
  existing setup imported as an environment, and the first-publish checklist; list findings, fixes, and
  residual risks honestly
- [ ] T098 Roll out to the maintainer's running installation after the 0.7.0 release, with explicit care for
  the git-ignored production config and no `git clean`: connect the new console to the running 0.6.2 backend
  read-only first, import it as an environment (naming it, e.g. `prod`), confirm it shows unknown versions and
  offers the update, then run the update from the console (backup taken and stored outside the repository,
  `0002` applied with the hand-added action tables adopted, Worker deployed), confirm the versions match and
  key management is available, and record the steps and results in
  `specs/018-npm-console-first-setup/verification-log.md`

---

## Dependencies and execution order

### Phase dependencies

- **Setup (1)**, **Foundational (2)**: done.
- **US1 (3)**, **US2 (4)**, **US3+US4 (5)**: done.
- **Migrations, versions, and access keys (6)**, **ops-core completion (6B)**: done.
- **US10, environments (7)**: after Phase 6B; blocks Phases 8, 9, 10, 11 (each needs to know which
  environment it is acting on, and Phase 8 needs the naming-prefix rule).
- **US5+US11, deploy engine (8)**: after Phase 7.
- **US9, versions and updates (9)**: after Phase 8 (reuses its engine).
- **US6 (10)** and **US7 (11)**: after Phase 7 (need environment-scoped keys) and Phase 6 (need the route
  matrix); independent of Phase 8 and 9's deploy/update engines.
- **US8 (12)**: Parts A and B done; Part C (environment import) after Phase 7.
- **Polish (13)**: after every story is complete; T098 after the 0.7.0 release.

### Story dependency graph

```text
Done: Setup, Foundational, US1, US2, US3+US4, Migrations/Versions/Keys, ops-core (T049)
                                                       │
                                                       ▼
                                   US10 — environments (Phase 7)
                                    ┌──────────────┼──────────────┐
                                    ▼              ▼              ▼
                    US5+US11 — deploy (8)     US6 — owner (10)   US7 — analyst (11)
                                    │
                                    ▼
                        US9 — versions/updates (9)
                                    │
                                    ▼
                    US8 part C — existing-setup import (12)
                                    │
                                    ▼
                              Polish (13) → 0.7.0 release
```

## Parallel opportunities

- **Phase 7**: T050-T053 are separate files (tests first, then T054-T059 mostly sequential since they touch
  shared stores/routes).
- **Phase 8**: T060-T064 are separate files; T065 (Worker prebundle) can proceed in parallel with T060-T063.
- **Phase 10 and 11** (owner and analyst) can proceed in parallel with each other and with Phase 8/9 once
  Phase 7 is done, since they touch different console screens and different Worker route tests.
- **Phase 13**: T093, T096, T097 are independent write-ups; T094 and T095 should run after everything else
  lands.

## Implementation strategy

Ship as one 0.7.0 release (research R18): no independently shippable slice partway through, but land phases in
the dependency order above so integration risk surfaces early — environments (7) before the deploy engine (8)
that needs their naming rule, the deploy engine before updates (9) that reuse it, and owner/analyst (10, 11)
in parallel with either since they only need Phase 7's environment scoping and Phase 6's already-built route
matrix.

### Notes

- Commit after each task or small group; keep the gates green.
- Out of scope, do not build: per-website signing keys, user accounts or logins, automatic update checks or
  any telemetry, Windows support, a non-interactive console-free deploy, Homebrew or a native app,
  downgrading a Worker or database, rolling back automatically (the backup is the rollback), moving an
  environment's resources between Cloudflare accounts, renaming an environment in place, and any change to
  what the SDK collects.

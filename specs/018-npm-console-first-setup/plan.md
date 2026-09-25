# Implementation Plan: Install from npm, a Console-First Setup, and Multiple Backend Environments

**Branch**: `018-npm-console-first-setup` | **Date**: 2026-09-22 (revised) | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-npm-console-first-setup/spec.md`

## Revision 3 (2026-09-24): environments managed outside the console

Supersedes R24, R25, R27, R9 (deploy engine), and the first-run design (see spec "Revision 3").

**Design**
- `apps/local-ops-api/src/environments/`: `file.ts` (read/validate/atomic write of `environments.json`), `verify.ts` (Worker whoami + role + version; Cloudflare token verify), `vault.ts` (OneCLI helper process per environment: `onecli run --project <workspace> ... -- node helper`, JSON lines over stdio, restarts on exit), `registry.ts` (reads the file per request, caches verification for a short time, remembers the selection in `preferences.json`).
- The service holds a `Registry` instead of `EnvironmentStore`; `store.current()` becomes `registry.selected()` returning `{ remoteUrl, credential/fetch }` so route code changes little. Requests for a OneCLI-held secret go through the helper's `fetch`.
- `apps/cli/src/env-command.ts`: `vizoalica env list|add|update|remove|check` on top of the same file and verify modules (moved into a small shared package `packages/ops-core` neighbour if needed by both; otherwise imported from local-ops-api as `console-command` already does).
- Console: `Welcome` page (nothing usable), top-bar `EnvironmentPicker` (select only), read-only backend page. Deleted: FirstRun, SetupPage, ConnectForm, CloudflareCredentialForm, EnvironmentSwitcher, DeployWizard, UpdatePanel, IssuePanel.
- API: `GET /api/environments` (states, selected), `POST /api/environments/:name/select`, `POST /api/environments/recheck`. Everything else in environments/setup/deploy/backend-maintenance is deleted.

**Delivery order**: (1) file+verify+vault modules with tests, (2) registry and service, (3) `vizoalica env`, (4) console API and web, (5) delete dead code and tests, (6) docs and contracts, (7) gates.

## Summary

Make Vizoalica installable with `npm install -g vizoalica`, start it with one command that works before any
backend exists, and take the person from a running console to one or more deployed backends ("environments":
dev, stage, prod, or any names an admin picks), each independently configured, deployed, and secured, with
three separate roles enforced per environment. Also replace the console footer with a structured one. This
ships as one **0.7.0** minor release; nothing in it has shipped yet, so the in-progress implementation may be
redesigned or rewritten freely to deliver the model below (research R18).

The approach, with rationale in [research.md](./research.md):

- **Package.** A new workspace package `apps/cli`, published as `vizoalica`, built by esbuild into one
  dependency-free bundle plus the built console, the prebundled Worker, the database schema, and the SDK files.
  The tarball is an allowlist and is tested from a clean prefix. (R1, R14)
- **One process.** The local service serves the built console and the API from `127.0.0.1:4318`, and can start
  with no environment saved. (R2, R3)
- **Environments, not one backend.** An environment is a fully independent backend (its own Worker, database,
  storage, administrator secret, access keys, projects, and websites) named by the admin, with its own
  Cloudflare credential (a stored token, or OneCLI) chosen independently of every other environment. Every
  resource an environment's deploy creates is named `<environment>-…`, enforced by the console, so
  environments can share one Cloudflare account with no collisions or spread across several accounts. Exactly
  one environment is selected at a time; every screen reflects only it. This is a local, console-side concept
  (an `EnvironmentStore` replacing the single `ConnectionStore`), not a Worker or database change: isolation
  between environments comes from each being its own Cloudflare deployment. (R24, R25, R26)
- **First run and journey.** The console asks at most three questions, an admin also names their first
  environment, derives the four setup stages from the live backend of the selected environment, and shows any
  control that cannot work yet as unavailable with a reason and a next step, sending nothing. (R10, R11)
- **Three roles, enforced by the backend, per environment.** Admin does everything in an environment; an
  analyst reads analytics and configuration and changes nothing; a website owner also manages projects and
  websites within a scope but cannot change the backend. A key issued by one environment's Worker does not
  exist in another's database, so it is naturally refused elsewhere with no new column or check needed. The
  existing `access_keys` table (role and scope) and per-role route allowlist enforce this within an
  environment; the console builds each role's experience from what `whoami` reports. (R4, R5, R6, R23)
- **Deploy from the console, from what shipped.** A step engine (plan, approve, run, resume, cleanup, secrets
  shown once) drives a pinned Wrangler fetched on demand, deploying the exact Worker bundle and migrations the
  installed package carries — never building from or reading a source checkout — replacing `vizoalica
  install`. (R7, R8, R9, R13, R27)
- **Versions and updates.** The database gets numbered, additive, forward-only migrations and the Worker and
  database report their versions, per environment. The console shows the three versions to every role and lets
  an admin update one environment's database and then its Worker with a plan, a backup, and verification.
  This **ends the fresh-install-only rule** that has applied since 0.5. (R21, R22)
- **Footer.** Brand, tagline, two link columns, and a bottom line, on every screen. (R15)

### One release: 0.7.0

The earlier two-slice 0.6.3/0.6.4 patch plan is dropped (research R18): nothing has shipped, environments
touch the same connection and deploy-engine code every later piece depends on, and building a throwaway
single-connection slice first would be wasted work. The task list still orders foundational work (the
environment model, the corrected packaged deploy engine) before what builds on it, but there is one set of
gates and one release at the end.

### Decisions for owner review

1. **One 0.7.0 release, not two patches.** Bigger than either 0.6.3 or 0.6.4 alone, but nothing has shipped
   yet to justify a throwaway intermediate slice (R18).
2. **Environments are console-side state, not a Worker/database concept.** Each is a full, separate Cloudflare
   deployment; the console just remembers several and shows one at a time, the way a CLI remembers several
   named contexts. This reuses nearly everything already built for the single-connection design rather than
   threading an environment id through every route (R24).
3. **The resource-name prefix is enforced, not advisory.** An environment named "stage" can only ever create
   or touch resources named `stage-…`; the console refuses anything else. This is what lets environments share
   one Cloudflare account safely, per the owner's explicit request (R26).
4. **Each environment's Cloudflare credential is independent**, chosen per environment between a stored API
   token and OneCLI, reusing the OneCLI-wrapping mechanism already built for the administrator secret rather
   than inventing a second one (R25).
5. **The deploy and update engines are rewritten to deploy the packaged Worker bundle, never the checkout.**
   An earlier implementation pass got this wrong (it reused the checkout's guided-install flow, which runs
   `pnpm build`); this plan corrects it before more is built on top (R27). The checkout's own lower-level
   commands (`vizoalica backend`, `connect`, `rotate`, …) keep using the checkout-native path unchanged, since
   they are for contributors and scripts, not the console.
6. **Wrangler is fetched on demand and pinned**, not bundled, so the install stays small for analysts and
   owners; the cost is a first-deploy download and reliance on npm at that moment (R7).
7. **Access keys live in D1**, per key, with a role (analyst or owner) and a scope (everything, one project, or
   one website), revocable (R5); no environment column is needed since each environment is already a separate
   database.
8. **Website owners manage projects and websites** (including deleting them) within their scope, and can never
   change the backend. Deleting is part of managing here; say so if you want owners kept from deleting (R6, R23).
   The shared token-signing secret remains a known limit, unchanged by environments.
9. **The root package is renamed `vizoalica-workspace`** so the published package can be named `vizoalica`;
   contributors' `pnpm vizoalica` script is unchanged (R1).
10. **Publishing is the owner's first action**: npm account, two-factor authentication, name claim; the
    workflow is skipped until `VIZOALICA_NPM_PUBLISH` is set (R14).

## Technical Context

**Language/Version**: TypeScript 6 (ES2022), Node.js 22 or newer, pnpm 9 workspace (ESM)

**Primary Dependencies**: Existing: esbuild (bundles), React 19 and Vite 8 (console), Ajv (event schemas),
Vitest and Playwright with axe (tests). New at run time for the package: none. New at deploy time only: a
pinned Wrangler fetched through `npm exec`. New workspace packages: `apps/cli`, `packages/ops-core`.

**Storage**: Cloudflare D1, one independent database per environment: migration `0002_access_keys.sql` adds
`access_keys` (with role and scope) and an `actor` column on the audit table, and adopts the action tables;
applied versions are read from `d1_migrations`. Local files under `~/.config/vizoalica/`: one connection file
per environment under `environments/<name>.json` (mode 0600, extends the earlier single connection file's
shape with the environment's name and its Cloudflare credential configuration), an `active-environment.json`
pointer, and `deployments/` run records without secrets (each naming the environment it belongs to).

**Testing**: Vitest 4 (unit, contract, integration; jsdom for console; real SQLite for the Worker; a fake
Wrangler for the deploy engine), Playwright and axe for console flows, and a tarball smoke test in CI.
Coverage gate 90% lines and branches.

**Target Platform**: macOS and Linux with Node 22 or newer (the package); Cloudflare Workers and D1, one
deployment per environment (the backend); modern browsers (the console).

**Project Type**: Web application in a pnpm monorepo, now with a published CLI package and a multi-environment
local service.

**Performance Goals**: Install to running console in under two minutes (SC-001); console start under five
seconds; deploy from the console under ten minutes on a real account (SC-002, dominated by Cloudflare);
key-holder requests cost one extra indexed D1 read for the key lookup; switching the active environment
updates every screen with no full restart (the same "connection changed" mechanism already used for saving a
connection).

**Constraints**: The console makes no request about the user (no telemetry, no update check); no secret in the
tarball, logs, run records, backups, or screens after one view; the listener is loopback only; an analyst key
can never write and an owner key can never touch the backend; a key from one environment never works against
another; every resource name an environment's deploy creates or touches starts with that environment's name;
the deploy and update engines depend only on the installed package's own files, never on a source checkout,
`pnpm`, or any repository-relative path; the tarball is an allowlist; the maintainer's 0.6.2 backend keeps
working with the new console, importable as (or into) one environment.

**Scale/Scope**: About 30 source files changed and 45 added across the console, local service, Worker, CLI,
and CI, plus about 15 documentation files. Up to 200 active access keys per environment's backend; no fixed
limit on the number of saved environments (a handful is the expected case).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: unchanged, all pass.*

| Principle / rule | Assessment | Evidence in this plan |
| ---------------- | ---------- | --------------------- |
| **I. Privacy-minimal analytics** | Pass | No new visitor data. The console makes no request about the user (FR-010). Keys are stored as hashes; secrets are shown once and never logged. Environments add no new visitor-facing data. |
| **II. Security, privacy, abuse resistance** | Pass, with new negative tests | A new credential type: 256-bit secrets, hashed at rest, looked up by id, compared in constant time, scoped on every route, revocable, audited. An authorization matrix test covers every admin route with every principal, and is extended to prove a key from one environment is refused by another's backend (FR-051). Static serving refuses traversal and non-GET; strict CSP; loopback only; deployment inputs validated including the environment name prefix (FR-047, FR-048); Wrangler spawned without a shell (R17). Each environment's Cloudflare credential (token or OneCLI) is stored and used independently, so a leak or misuse in one environment cannot reach another's account. |
| **III. Open source, portable interoperability** | Pass | Standard npm distribution with provenance and an allowlisted tarball; MIT; contracts documented. No provider-specific behavior added. Deploying and updating now provably depend only on the package's own files (R27, Story 11), which also makes the feature more portable, not less. |
| **IV. Minimal infrastructure, AI-assisted deployment** | Pass, two points to watch | No new service. The console deploy shows a reviewable plan, needs approval, is resumable, produces an auditable record, requests only the sign-in it needs (and accepts a least-privilege API token, per environment), and verifies the result. The approval-gated agent lane (`deploy:plan/apply`) is untouched, so agent-operable deployment remains, per checkout, unaffected by the console's environment model. Updates follow the same rules, per environment, and a rollback is restoring that environment's backup or redeploying its previous Worker. |
| **V. Human-readable, AI-ready engineering** | Pass | Small modules (environment store, setup state, static server, deploy engine, key auth, availability); shared helpers move to `packages/ops-core` instead of being copied; contracts precede code. The environment model is deliberately the smallest change that satisfies the requirement (research R24): an active-pointer store, not an id threaded through every route. |
| **Accessible product experience** | Pass, verified by tests | First run (including naming an environment), journey, deploy wizard, keys, the environment switcher, and footer get axe scans in both themes, keyboard-only flows, announced state changes, and reasons that never rely on color. Manual assistive-technology pass remains an open item, as for 0.6.0. |
| **SDK never blocks the host** | Pass | The SDK is unchanged. |
| **Filtering and limits before persistence; bounded reads** | Pass | Key-holder routes are the existing bounded reports; key lookup is a primary-key read, unaffected by environments (each is a separate database). |
| **Versioned contracts, additive history** | Pass | New routes only; existing routes unchanged for the admin. Environment routes are new and additive. |
| **Testing and release gates** | Pass | Unit, integration, contract, e2e, negative, and package tests planned; coverage stays above 90%; release-time alignment review, QA report, and go/no-go stay release activities. |

No violations. Complexity Tracking lists the deliberate additions for transparency.

## Project Structure

### Documentation (this feature)

```text
specs/018-npm-console-first-setup/
├── spec.md                              # Feature specification
├── plan.md                              # This file
├── research.md                          # Phase 0: decisions R1 to R27
├── data-model.md                        # Phase 1: environment, access key, principal, connection, setup state, run
├── quickstart.md                        # Phase 1: validation guide
├── contracts/
│   ├── worker-access-keys.md            # Bearer resolution, route matrix, key endpoints, whoami (unchanged by environments)
│   ├── local-service-api.md             # Console assets, environments, setup, deploy, backend, keys, sharing
│   ├── package-and-cli.md               # Tarball allowlist (worker prebundle), commands, console behavior, publishing
│   └── console-availability.md          # Roles, stages, environment switcher, availability rules, first run, footer
├── checklists/requirements.md           # Spec quality checklist
└── tasks.md                             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

New paths are marked (new); the rest are modified.

```text
apps/
├── cli/                                 (new) the published package `vizoalica`
│   ├── package.json.template            publishable manifest (bin, engines, files, provenance)
│   ├── src/main.ts                      entry: argument parsing, node and platform checks
│   ├── src/console-command.ts          starts the service, opens the browser, handles OneCLI mode
│   ├── src/commands/                    thin wrappers over the existing command modules
│   └── tests/
├── local-ops-api/src/
│   ├── environment-store.ts             (new, replaces connection-store.ts) multi-environment, file-backed, one active pointer
│   ├── static.ts                        console assets with traversal and header rules
│   ├── setup/state.ts, setup/stages.ts  setup state (per active environment) and the four stages
│   ├── compat.ts                        console and backend version compatibility
│   ├── deploy/
│   │   ├── wrangler.ts                  the pinned, on-demand Wrangler runner (per environment's credential)
│   │   ├── package-paths.ts             (new) resolves the packaged Worker bundle, template, and schema from this module's own location
│   │   ├── engine.ts                    (rewritten, R27) first-install and update-backend step sequences against the packaged artifacts, no checkout dependency
│   │   ├── steps.ts, runs.ts, vault.ts  step definitions, run records (per environment), single-use secret vault
│   │   └── update.ts                    the update-backend mode (backup, migrate, deploy, verify)
│   ├── routes/{environments,setup,deploy,backend,access-keys,share}.ts   (environments new; deploy/backend rewritten)
│   ├── server.ts, config.ts, cli.ts     unconfigured start, environment-aware client, new routes
│   └── tests/
├── ingest-worker/src/
│   ├── auth/access-keys.ts, auth/principal.ts   key parsing, hashing, role and scope resolution (unchanged by environments)
│   ├── schema-version.ts                applied and expected schema versions, backend health
│   ├── http/admin-adapter.ts            whoami, key routes, route allowlist and scope forcing
│   ├── storage/d1-repositories.ts       key storage methods; purge lists gain the table
│   ├── version.ts                       build-time version
│   ├── index.ts                         bind the new repository methods (see the memory note)
│   └── tests/                           authorization matrix, scope, hashing, table-missing
├── ingest-api/src/domain/types.ts, storage/repositories.ts   access key types and methods
└── admin-web/src/
    ├── components/AppFooter.tsx         structured footer; styles in styles.css
    ├── components/ActionButton.tsx      availability rendering (aria-disabled, reason, next)
    ├── setup/{SetupProvider,FirstRun,Journey,ConnectForm,useAvailability,roles}.tsx|ts
    ├── setup/EnvironmentSwitcher.tsx     (new) list, select, create, remove environments
    ├── manage/{BackendPage,DeployWizard,AccessPage,SharePanel}.tsx       environment-scoped throughout
    ├── router.ts, App.tsx, capabilities.ts, api/local-operations.ts     roles, routes, calls, environment endpoints
    └── tests/, e2e/                     first run, journey, availability, footer, roles, deploy, environments

packages/ops-core/                       shared pure helpers, plus the deploy orchestration moved from scripts/cli
└── src/{names,parsers,config-render,secrets,context,terminal,backend}.ts

scripts/
├── build-package.mjs, check-package.mjs assemble and verify the tarball; build-package gains the Worker prebundle step
├── cli/{backend,context,terminal,secrets}.ts   thin re-export shims over packages/ops-core (checkout CLI unchanged)
└── vizoalica.ts                         install retired; console uses the packaged entry

deploy/cloudflare/
├── migrations/0002_access_keys.sql      access_keys, audit actor column, action tables IF NOT EXISTS (unchanged by environments)
└── wrangler.example.toml                unchanged (the package template is derived from it)

.github/workflows/ci.yml                 package check on every pull request
.github/workflows/publish.yml            provenance publish, skipped until enabled
package.json                             renamed vizoalica-workspace; version 0.7.0; package:build and package:check scripts
README.md, llms.txt, docs/**, .github/ISSUE_TEMPLATE/**   the npm path, environments, retired command, contributor notes
CHANGELOG.md, docs/releases/v0.7.0.md    one release's notes and upgrade notes
```

**Structure Decision**: Keep the existing monorepo boundaries and add two packages: `apps/cli` for what is
published, and `packages/ops-core` for helpers and orchestration the CLI and the console deploy engine share
(including, after correcting the first implementation pass, the checkout's guided-install function itself, so
the console never depends on it directly across a package boundary; see research R27). The published package
is assembled from build outputs rather than sources, so the tarball is exactly what was tested. Multiple
environments are added as a local storage and routing concept (`EnvironmentStore`) layered under the same
routes and screens already designed for one backend, not as a new dimension threaded through every module
(research R24): the console keeps its own patterns (shell, scope, capability matrix) and gains an environment
layer above them, mirroring the setup layer it already gained for the single-backend design.

## Delivery order (input to /speckit-tasks)

One release, ordered so foundations land before what builds on them:

1. Footer.
2. `apps/cli` package skeleton, build and tarball check, CI job.
3. `packages/ops-core` extraction (parsers, names, config rendering, secrets, and — correcting the earlier
   attempt — the context/terminal/backend orchestration the checkout's guided commands and the console deploy
   engine both need), with `apps/local-ops-api` depending on it as an ordinary workspace package rather than
   reaching across directories.
4. Multi-environment storage: `EnvironmentStore` (replacing the single connection store), the
   `active-environment` pointer, environment name validation and the resource-name-prefix rule in
   `packages/ops-core` (R26), and the `/api/environments` routes.
5. Local service: unconfigured start, static console, `whoami`-tolerant connect, setup state — all reading the
   *active* environment, so this layer changes only which store it reads from.
6. Console: setup provider, first run (naming the first environment, then the admin paths that connect),
   journey, availability gating, the environment switcher, settings.
7. Numbered migrations and version reporting: `0002`, the additive-migration checks, the applied and expected
   schema versions, `GET /v1/admin/backend`, and `whoami` (unaffected by environments; one Worker per
   environment already isolates this).
8. Worker access keys with roles and scopes: key auth, the per-role route matrix (analyst reads, owner writes
   in scope), audit actor, tests, purge lists (unaffected by environments for the same reason).
9. Roles in the console (analyst, owner), the keys screen, sharing, SDK download, and the versions panel, all
   scoped to the active environment.
10. The corrected console deploy engine (R27): the Worker prebundle and template in `scripts/build-package.
    mjs`, `deploy/package-paths.ts`, the pinned-Wrangler-only `deploy/engine.ts` rewrite (first install and
    `update-backend`, with backup and migrations), the environment's own Cloudflare credential wired into every
    run, routes, the wizard, and the backend screen (rotate, purge, demo) — this is what Story 5 and Story 9
    actually need to work from an installed package, not a checkout.
11. Existing setups: importing a pre-0.7.0 single connection file as the first environment on first use;
    retire `install`; the publish workflow; documentation sweep (environments, roles, retired command,
    packaged deployment); release notes for 0.7.0.

**Polish**: gates, package check, accessibility and usability pass, quickstart (including the multi-environment
scenario), QA report, live rollout for the maintainer (importing their running backend as an environment, then
the Worker redeploy and the table by hand where still needed).

## Complexity Tracking

Not violations of the constitution; listed so the added moving parts are explicit and reviewable.

| Addition | Why needed | Simpler alternative rejected because |
| -------- | ---------- | ------------------------------------- |
| Second published-package workspace (`apps/cli`) | The published tarball must be an assembled allowlist, not the workspace root | Publishing the root ships dev tooling and has no clean file list |
| `packages/ops-core`, including the deploy orchestration | The checkout's guided commands and the console deploy engine need the same parsers, name rules, secret generation, and (after correcting the first attempt) the same step orchestration, without one reaching across a package boundary into the other's source | Copying them would let the two flows drift on security-relevant rules; the first implementation pass's deep cross-package imports broke TypeScript project references and could not be packaged |
| `access_keys` table and a route allowlist | Roles must be enforced by the backend, with per-person revoke and scope | One shared read secret cannot revoke one person or scope a website owner |
| Wrangler fetched on demand | Keeps the install small for roles that never deploy | Bundling adds about 140 MB for everyone |
| Numbered, additive migrations and version reporting | Updating the database from the console needs to know what is applied and what is pending, and a failed Worker step must not break the running backend | Editing one baseline file in place forces a fresh install for every schema change, which is what this feature removes |
| `EnvironmentStore` and an active-environment pointer, replacing the single connection store | The owner asked for several independent backends manageable from one console, with an enforced naming convention so they can share a Cloudflare account | Threading an environment id through every route and screen would be a larger, riskier change for no behavioral difference, since the console only ever shows one environment at a time (FR-050) |
| A Worker prebundle and Wrangler-config template shipped in the package, and a deploy engine that depends only on packaged files | The published npm package must be able to deploy on a machine with no source checkout (FR-008, Story 11); the first implementation pass got this wrong by reusing the checkout-only guided-install path | Requiring a checkout for console-driven deploys defeats the purpose of publishing to npm; building the Worker from source on the admin's machine adds a toolchain dependency this plan explicitly avoids (R1) |

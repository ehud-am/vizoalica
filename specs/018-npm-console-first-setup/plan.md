# Implementation Plan: Install from npm and a Console-First Setup

**Branch**: `018-npm-console-first-setup` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-npm-console-first-setup/spec.md`

## Summary

Make Vizoalica installable with `npm install -g vizoalica`, start it with one command that works before any
backend exists, and take the person from a running console to a deployed backend, a configured website, and
visible data from inside the console, with three separate roles. Also replace the console footer with a
structured one.

The approach, with rationale in [research.md](./research.md):

- **Package.** A new workspace package `apps/cli`, published as `vizoalica`, built by esbuild into one
  dependency-free bundle plus the built console, the prebundled Worker, the database schema, and the SDK files.
  The tarball is an allowlist and is tested from a clean prefix. (R1, R14)
- **One process.** The local service serves the built console and the API from `127.0.0.1:4318`, and can start
  with no backend and no saved connection. (R2, R3)
- **First run and journey.** The console asks at most three questions, derives the four setup stages from the
  live backend, and shows any control that cannot work yet as unavailable with a reason and a next step, sending
  nothing. (R10, R11)
- **Roles enforced by the backend.** A new `access_keys` table and a route allowlist give analysts and website
  owners read-only, scoped keys; the console builds each role's experience from what `whoami` reports.
  (R4, R5, R6)
- **Deploy from the console.** A step engine (plan, approve, run, resume, cleanup, secrets shown once) drives a
  pinned Wrangler fetched on demand, replacing `vizoalica install`. (R7, R8, R9, R13)
- **Footer.** Brand, tagline, two link columns, and a bottom line, on every screen. (R15)

### Delivery in two releases (recommended)

The request is larger than a patch. The tasks are ordered so the first slice is complete on its own:

- **0.6.3**: footer, npm package, console-first start, first run, journey and availability, connect to an
  existing backend, existing setups recognized. **No backend or schema change.** `vizoalica install` still
  works, so there is never a period without an easy way to deploy.
- **0.6.4**: read-only keys and roles, console deployment and the backend screen, retiring `install`, and the
  npm publish workflow going live. This one changes the schema, so it is fresh-install-only, and the
  maintainer's database gets the `CREATE TABLE` by hand (as for actions).

### Decisions for owner review

1. **Release split** as above; shipping everything at once is possible but a bigger, riskier patch (R18).
2. **Wrangler is fetched on demand and pinned**, not bundled, so the install stays small for analysts and
   owners; the cost is a first-deploy download and reliance on npm at that moment (R7).
3. **Read-only keys live in D1**, per key, scoped to a project or website, revocable (R5). A schema addition.
4. **Website owners also get a read-only key** (limited to their website), so the "has data arrived" check
   works without an unauthenticated endpoint; the shared token-signing secret remains a known limit (R6).
5. **The root package is renamed `vizoalica-workspace`** so the published package can be named `vizoalica`;
   contributors' `pnpm vizoalica` script is unchanged (R1).
6. **Publishing is the owner's first action**: npm account, two-factor authentication, name claim; the
   workflow is skipped until `VIZOALICA_NPM_PUBLISH` is set (R14).

## Technical Context

**Language/Version**: TypeScript 6 (ES2022), Node.js 22 or newer, pnpm 9 workspace (ESM)

**Primary Dependencies**: Existing: esbuild (bundles), React 19 and Vite 8 (console), Ajv (event schemas),
Vitest and Playwright with axe (tests). New at run time for the package: none. New at deploy time only: a
pinned Wrangler fetched through `npm exec`. New workspace packages: `apps/cli`, `packages/ops-core`.

**Storage**: Cloudflare D1: one new table `access_keys` in the `0001_initial.sql` baseline. Local files under
`~/.config/vizoalica/` (existing connection file, mode 0600; new `deployments/` run records without secrets).

**Testing**: Vitest 4 (unit, contract, integration; jsdom for console; real SQLite for the Worker; a fake
Wrangler for the deploy engine), Playwright and axe for console flows, and a tarball smoke test in CI.
Coverage gate 90% lines and branches.

**Target Platform**: macOS and Linux with Node 22 or newer (the package); Cloudflare Workers and D1 (the
backend); modern browsers (the console).

**Project Type**: Web application in a pnpm monorepo, now with a published CLI package.

**Performance Goals**: Install to running console in under two minutes (SC-001); console start under five
seconds; deploy from the console under ten minutes on a real account (SC-002, dominated by Cloudflare);
reader requests cost one extra indexed D1 read for the key lookup.

**Constraints**: The console makes no request about the user (no telemetry, no update check); no secret in the
tarball, logs, run records, or screens after one view; the listener is loopback only; a reader key can never
write; the tarball is an allowlist; existing setups (file and OneCLI modes) keep working; the maintainer's
0.6.2 backend keeps working with the new console.

**Scale/Scope**: About 25 source files changed and 40 added across the console, local service, Worker, CLI, and
CI, plus about 15 documentation files. Up to 200 active access keys per backend.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: unchanged, all pass.*

| Principle / rule | Assessment | Evidence in this plan |
| ---------------- | ---------- | --------------------- |
| **I. Privacy-minimal analytics** | Pass | No new visitor data. The console makes no request about the user (FR-010). Keys are stored as hashes; secrets are shown once and never logged. |
| **II. Security, privacy, abuse resistance** | Pass, with new negative tests | A new credential type: 256-bit secrets, hashed at rest, looked up by id, compared in constant time, scoped on every route, revocable, audited. An authorization matrix test covers every admin route with every principal. Static serving refuses traversal and non-GET; strict CSP; loopback only; deployment inputs validated; Wrangler spawned without a shell (R17). |
| **III. Open source, portable interoperability** | Pass | Standard npm distribution with provenance and an allowlisted tarball; MIT; contracts documented. No provider-specific behavior added. |
| **IV. Minimal infrastructure, AI-assisted deployment** | Pass, one point to watch | No new service. The console deploy shows a reviewable plan, needs approval, is resumable, produces an auditable record, requests only the sign-in it needs (and accepts a least-privilege API token), and verifies the result. The approval-gated agent lane (`deploy:plan/apply`) is untouched, so agent-operable deployment remains. Retiring `install` only in the slice that ships console deployment. |
| **V. Human-readable, AI-ready engineering** | Pass | Small modules (connection store, setup state, static server, deploy engine, key auth, availability); shared helpers move to `packages/ops-core` instead of being copied; contracts precede code. |
| **Accessible product experience** | Pass, verified by tests | First run, journey, deploy wizard, keys, and footer get axe scans in both themes, keyboard-only flows, announced state changes, and reasons that never rely on color. Manual assistive-technology pass remains an open item, as for 0.6.0. |
| **SDK never blocks the host** | Pass | The SDK is unchanged. |
| **Filtering and limits before persistence; bounded reads** | Pass | Reader routes are the existing bounded reports; key lookup is a primary-key read. |
| **Versioned contracts, additive history** | Pass | New routes only; existing routes unchanged for the operator. |
| **Testing and release gates** | Pass | Unit, integration, contract, e2e, negative, and package tests planned; coverage stays above 90%; release-time alignment review, QA report, and go/no-go stay release activities. |

No violations. Complexity Tracking lists the deliberate additions for transparency.

## Project Structure

### Documentation (this feature)

```text
specs/018-npm-console-first-setup/
├── spec.md                              # Feature specification
├── plan.md                              # This file
├── research.md                          # Phase 0: decisions R1 to R20
├── data-model.md                        # Phase 1: access key, principal, connection, setup state, run
├── quickstart.md                        # Phase 1: validation guide
├── contracts/
│   ├── worker-access-keys.md            # Bearer resolution, route matrix, key endpoints, whoami
│   ├── local-service-api.md             # Console assets, setup, deploy, backend, keys, sharing
│   ├── package-and-cli.md               # Tarball allowlist, commands, console behavior, publishing
│   └── console-availability.md          # Roles, stages, availability rules, first run, footer
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
│   ├── connection-store.ts              (new) the mutable, file-backed connection
│   ├── static.ts                        (new) console assets with traversal and header rules
│   ├── setup/state.ts, setup/stages.ts  (new) setup state and the four stages
│   ├── compat.ts                        (new) console and backend version compatibility
│   ├── deploy/{engine,steps,runs,wrangler,vault}.ts   (new) the console deploy engine
│   ├── routes/{setup,deploy,backend,access-keys,share}.ts   (new)
│   ├── server.ts, config.ts, cli.ts     unconfigured start, switchable client, new routes
│   └── tests/
├── ingest-worker/src/
│   ├── auth/access-keys.ts, auth/principal.ts   (new) key parsing, hashing, resolution
│   ├── http/admin-adapter.ts            whoami, key routes, route allowlist and scope forcing
│   ├── storage/d1-repositories.ts       key storage methods; purge lists gain the table
│   ├── version.ts                       (new) build-time version
│   ├── index.ts                         bind the new repository methods (see the memory note)
│   └── tests/                           authorization matrix, scope, hashing, table-missing
├── ingest-api/src/domain/types.ts, storage/repositories.ts   access key types and methods
└── admin-web/src/
    ├── components/AppFooter.tsx         structured footer; styles in styles.css
    ├── components/ActionButton.tsx      availability rendering (aria-disabled, reason, next)
    ├── setup/{SetupProvider,FirstRun,Journey,ConnectForm,useAvailability,roles}.tsx|ts   (new)
    ├── manage/{BackendPage,DeployWizard,AccessPage,SharePanel}.tsx   (new)
    ├── router.ts, App.tsx, capabilities.ts, api/local-operations.ts   roles, routes, calls
    └── tests/, e2e/                     first run, journey, availability, footer, roles, deploy

packages/ops-core/                       (new) shared pure helpers
└── src/{names,parsers,config-render,secrets}.ts   moved from scripts/cli/backend.ts and secrets.ts

scripts/
├── build-package.mjs, check-package.mjs (new) assemble and verify the tarball
├── cli/backend.ts, cli/secrets.ts       import from ops-core
└── vizoalica.ts                         install retired (0.6.4); console uses the packaged entry

deploy/cloudflare/
├── migrations/0001_initial.sql          access_keys table (0.6.4)
└── wrangler.example.toml                unchanged (the package template is derived from it)

.github/workflows/ci.yml                 package check on every pull request
.github/workflows/publish-npm.yml        (new) provenance publish, skipped until enabled
package.json                             renamed vizoalica-workspace; package:build and package:check scripts
README.md, llms.txt, docs/**, .github/ISSUE_TEMPLATE/**   the npm path, retired command, contributor notes
CHANGELOG.md, docs/releases/v0.6.3.md, v0.6.4.md          release notes and upgrade notes
```

**Structure Decision**: Keep the existing monorepo boundaries and add two packages: `apps/cli` for what is
published, and `packages/ops-core` for helpers the CLI and the console deploy engine share, so the deployment
logic is written once. The published package is assembled from build outputs rather than sources, so the
tarball is exactly what was tested. The console keeps its own patterns (shell, scope, capability matrix) and
gains a setup layer above them.

## Delivery order (input to /speckit-tasks)

**Slice 1 (0.6.3), no backend change**

1. Footer.
2. `apps/cli` package skeleton, build and tarball check, CI job.
3. Local service: connection store, unconfigured start, static console, `whoami`-tolerant connect, setup state.
4. Console: setup provider, first run (operator paths that connect), journey, availability gating, settings.
5. Existing-setup detection, `console` command in packaged mode (file and OneCLI), documentation for the npm path.

**Slice 2 (0.6.4), schema and Worker change**

6. `packages/ops-core` extraction.
7. Worker access keys: schema, key auth, `whoami`, routes and matrix, tests, purge lists.
8. Roles in the console (analyst, owner), keys screen, share, SDK download, compatibility display.
9. Console deployment: engine, routes, wizard, backend screen (rotate, purge, demo), cleanup and resume.
10. Retire `install`, publish workflow, documentation sweep, release notes and upgrade notes.

**Polish**: gates, package check, accessibility and usability pass, quickstart, QA report, live rollout for the
maintainer (Worker redeploy and the table by hand).

## Complexity Tracking

Not violations of the constitution; listed so the added moving parts are explicit and reviewable.

| Addition | Why needed | Simpler alternative rejected because |
| -------- | ---------- | ------------------------------------ |
| Second published-package workspace (`apps/cli`) | The published tarball must be an assembled allowlist, not the workspace root | Publishing the root ships dev tooling and has no clean file list |
| `packages/ops-core` | The CLI and the console deploy engine need the same parsers, name rules, and secret generation | Copying them would let the two flows drift on security-relevant rules |
| `access_keys` table and a route allowlist | Roles must be enforced by the backend, with per-person revoke and scope | One shared read secret cannot revoke one person or scope a website owner |
| Wrangler fetched on demand | Keeps the install small for roles that never deploy | Bundling adds about 140 MB for everyone |

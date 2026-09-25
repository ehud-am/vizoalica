# Verification log: 018 install from npm and a console-first setup

## Baseline

Recorded 2026-09-21 on branch `018-npm-console-first-setup` before any implementation change.

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: pass.
- `pnpm coverage`: statements 96.46%, branches 92.21%, lines 97.7% (thresholds: lines and branches 90%).

## Footer link check (T015)

`curl -I -L` on 2026-09-21: `vizoalica.dev`, `/get-started`, `/operations/privacy`, the repository, Issues, Releases, and `blob/main/LICENSE` all answer 200.
`/discussions` initially answered 404 because GitHub Discussions was switched off for the repository (`has_discussions: false`). Turned it on the
same day with `gh api -X PATCH repos/ehud-am/vizoalica -f has_discussions=true`; `/discussions` now answers 200, and the footer includes it.

## Slice 1 gates (0.6.3), 2026-09-21

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: pass.
- `pnpm coverage`: 155 files, 1329 tests pass. Statements 96.7%, branches 92.69%, lines 97.82% (baseline 96.46 / 92.21 / 97.7).
  `apps/cli/src/bin.ts` is excluded like the other entry files; `scripts/check-package.mjs` runs the real command.
- `pnpm test:e2e`: 63 Playwright tests pass (footer, first run, journey, plus the existing suites, with axe in both themes).
- `pnpm package:build && pnpm package:check`: pass. The tarball holds only the allowlist (16 files, about 1.0 MB unpacked, 299 kB packed), nothing looks like a
  secret or local path, it installs into an empty prefix and home, `--version` matches, the console starts and serves the page, its security
  headers, its script, a session, `needsFirstRun: true`, both SDK files, refuses four traversal forms and a write to a page, writes no
  credential, and one interrupt stops it with exit code 0.
- `pnpm docs:build` and the deploy-cli and docs contract tests: pass.

## Quickstart, sections 1 to 4 and 8 (slice 1 parts)

1. Gates: pass (above).
2. Package from a clean prefix: pass, through `pnpm package:check`.
3. Footer: `e2e/footer.spec.ts` (13 tests) passes: present on Overview, Manage, and the connection-error screen; single column at 320 px;
   no horizontal overflow at 320, 768, and 1440 px in light and dark; axe clean; all nine links (including Discussions) reachable by
   keyboard with a visible focus ring; no request outside the console.
4. First run and journey: `e2e/first-run.spec.ts` and `e2e/journey.spec.ts` pass, and the jsdom suites (`first-run`, `journey`,
   `availability`, `setup-experience`) pass: at most three questions per path, every unavailable control is `aria-disabled` with a reason
   and sends nothing (including on Enter in a form), a stopped backend shows a notice and blocked stages, and the journey hides at data.
8. Existing setups: `apps/cli/tests/existing-setup.test.ts` passes for a file-mode file written by the checkout `connect`, a OneCLI
   placeholder file (never written back as a secret), a file others can read, a damaged file, and a revoked file.

Deviations from the plan, all in slice 1:

- The published folder is `apps/cli/package/` (not `apps/cli/dist/`), so that the tarball's own `dist/` holds the bundle, console, SDK files,
  and schema as the contract lists them.
- The footer omits npm (not published yet); Discussions was enabled on the repository and is included; see above.
- From the package, commands other than `console`, `serve`, `help`, and `--version` print where to go and exit 2. They still work in a
  checkout. The console's first-run "I need a backend" step tells the user deploying from the console comes next and links the guide.

`npm publish --dry-run --provenance=false` from `apps/cli/package/` on 2026-09-21 lists the same 16 files as `vizoalica@0.6.2`; `npm view vizoalica`
still answers 404, so the name is free. Nothing was published.

## Quickstart, sections 1 to 9 (0.7.0, environments and console-side deploy), 2026-09-23

### 1. The quality gates

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: pass.
- `pnpm test:e2e` (`playwright test` in `apps/admin-web`): 90 tests pass, including the new
  `e2e/update.spec.ts` and `e2e/environments.spec.ts` suites, with axe in both themes.
- `pnpm docs:build` and `pnpm docs:test`: pass (12 tests; 3 pre-existing consent tests skipped, same
  as before this feature).
- `pnpm coverage`: 182 files, 1595 tests pass. Statements 94.11%, functions 92.89%, lines 95.38% (all
  above the 90% floor). **Branches: 89.68%, 0.32 points below the 90% threshold.** Every file this
  feature added or substantially changed (`deploy/update.ts`, `deploy/engine.ts`,
  `routes/deploy.ts`, `routes/backend.ts`, `routes/environments.ts`, `environment-store.ts`,
  `deploy/wrangler.ts`, `deploy/vault.ts`, `deploy/runs.ts`, `deploy/steps.ts`,
  `routes/access-keys.ts`, `ConnectForm.tsx`, `UpdatePanel.tsx`, `ConnectionNotice.tsx`) is now at or
  near full branch coverage; the remaining shortfall is pre-existing debt in files this feature did
  not touch (`admin-adapter.ts`, `d1-repositories.ts`, `action-rollups.ts`, `local-ops-api/server.ts`,
  `console-command.ts`, `BackendPage.tsx`, `AccessPage.tsx`, `DeployWizard.tsx`, and a long tail of
  1-3-branch gaps elsewhere), most of it exercised only by Playwright e2e (not counted toward this
  vitest branch metric) rather than by unit tests. Left open for a dedicated coverage pass; not
  something this feature should absorb without a separate scope decision.
- Along the way, fixed a stale `vitest.config.ts` coverage `exclude` entry (`scripts/cli/terminal.ts`
  pointed at a 12-line re-export shim; the real 165-line implementation had moved to
  `packages/ops-core/src/terminal.ts` without updating the exclude list), removed a genuinely unused
  `EnvironmentFile.setExtra` method (zero callers anywhere in the repo), and fixed a real bug found by
  the new tests: `routes/backend.ts`'s rotate-secret handler passed the **environment name** instead
  of the **worker name** to `rotateSecret`/`configPath`, so rotating a secret after a real deploy
  always failed with `no_rendered_config` — fixed by resolving the deployed worker name via
  `deployedNames()` first.
- **A second, more significant bug found via `-t` test-filter isolation** (reproducible: fails when
  `apps/ingest-worker/tests/access-key-authorization.test.ts`'s "a database that has not been updated
  to schema 2" test runs alone, passes when the whole file runs in order): `D1Repositories.saveAdminAudit`
  unconditionally wrote an `actor` column that only exists from schema 2 (`0002_access_keys.sql`)
  onward. In the full test file, an earlier test consumes the module-level `shouldAuditDenial` rate
  gate (one audit write per 60s per Worker instance), so the schema-2-only column is never actually
  written and the bug stays masked; run in isolation, the gate is fresh and the write fires,
  crashing (500) instead of cleanly refusing (401) an admin request. In production this meant **any
  backend still on schema 1 could not perform any admin write or denial at all** — every admin-audited
  action (create/delete project, share a website, or an authorization refusal) would 500 until updated
  to schema 2, which directly contradicts this feature's own promise that an un-updated backend keeps
  working and only offers an update. Fixed in `saveAdminAudit` itself: catch the specific "no column
  named actor" error and retry the insert without that column, so a pre-schema-2 backend degrades
  gracefully (records the audit without an actor) instead of crashing. Added a direct regression test
  in `d1-repositories.test.ts` against a real `freshDatabase({ upTo: 1 })` fixture.

### 2. The package, from a clean prefix

`pnpm package:build`, `npm pack`, install into a scratch prefix and `HOME`, `--version` (0.7.0), `console --no-open`
on a scratch `VIZOALICA_PORT` (avoiding the maintainer's own long-running console on 4318): all pass. Manually
confirmed beyond `pnpm package:check`'s own assertions: `GET /` serves the page with security headers;
`POST /api/session` (with a matching `Origin` header) succeeds; `GET /api/setup/state` reports
`needsFirstRun: true`; `GET /api/sdk/vizoalica.js` serves the SDK; a `--path-as-is` traversal attempt
(`/api/sdk/../../../../etc/passwd`) answers 404; a `PUT` to a static asset answers 405.
`pnpm package:check`'s own 24 assertions (tarball allowlist, no secrets/local paths, four traversal
forms, no credential written on start, clean interrupt) all pass. The tarball now carries the packaged
Worker (`dist/worker/index.mjs`, `dist/worker/wrangler.template.toml`) and migrations
(`dist/schema/*.sql`) alongside the console and SDK, per Phase 8's redesign.

### 3. The footer

`e2e/footer.spec.ts` (13 tests): pass, unchanged from slice 1.

### 4. First run and the journey

`e2e/first-run.spec.ts`, `e2e/journey.spec.ts`, and the jsdom suites (`first-run`, `journey`,
`availability`, `setup-experience`): 71 tests pass, now covering the environment-naming step, the
website-owner paste/upload setup-details path, and the `administrator_secret_used`/`role_corrected`
one-line notice.

### 5. Roles are enforced by the Worker

Full `apps/ingest-worker` suite: 219 tests pass (the quickstart's suggested `-t "access key"` filter
doesn't literally match any test title in this package; `-t "key"` or the full package run are the
working equivalents). Covers the access-key route matrix, cross-environment key isolation (new this
pass), and the schema-1-compatibility fix above.

### 6. Deploying from the console, against a fake Wrangler

`apps/local-ops-api` deploy-engine and deploy-routes suites: pass, including the update-mode routes
added this pass (`/api/deploy/update/preview|plan|runs`) and the rotate-secret bug fix.

### 7. Versions and updates

`apps/ingest-worker apps/local-ops-api apps/cli -t "schema|migration|update"` and the admin-web
`--grep "versions|update"` e2e filter: pass, reproducibly (checked 3 consecutive runs after the
schema-1 audit fix, since this is exactly the command that first surfaced it).

### 8. Multiple environments

`apps/local-ops-api -t "environment"` (68 tests), `e2e/environments.spec.ts` (7 tests), and
`apps/cli/tests/worker-bundle.test.ts` (2 tests, the quickstart's `-t "worker-bundle"` filter matches
no test title so the file is run directly): all pass, including the `wrangler deploy --dry-run`
check against the real packaged Worker bundle and template.

### 9. Existing setups keep working

`apps/local-ops-api/tests/existing-setup-import.test.ts` (12 tests, new this pass) and
`apps/cli/tests/existing-setup.test.ts` (6 tests): pass. A saved file-mode and OneCLI-mode connection
are recognized with no first-run questions; `vizoalica install` prints where to go and exits 2; a
pre-0.7.0 legacy connection is offered once, named, and imported without disturbing the old file.

Section 10 (real-account rehearsal) and section 11 (the maintainer's own running 0.6.2 backend) are
deliberately not run here: both need a real Cloudflare account and are left for the maintainer,
per T098.


## Revision 3 (2026-09-24): environments managed outside the console

Verified after the change (see spec "Revision 3", research R28, tasks R301–R310):

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`: clean.
- `pnpm vitest run --coverage`: 1406 tests pass; 95% lines, 91% branches (threshold 90%). Two pre-existing
  README-shape tests fail independently of this change (`deployment-docs.contract.test.ts` "three parts"
  headings, which the README no longer has; they already failed before this revision).
- `pnpm --filter @vizoalica/admin-web test:e2e`: 71 of 72 pass. The one failure
  (`website-pages.spec.ts` install steps, 5 vs 4) predates this revision (it follows the SDK download step
  added to the Install page in the previous commit).
- `pnpm package:build && pnpm package:check`: pass, including `vizoalica env list` on an empty home, the
  console listing no environments and answering 409 for the setup state, and no Worker bundle in the tarball.
- By hand, built package against a local stub Worker with a scratch `HOME`: an analyst key saved as `admin`
  was refused and nothing written; admin and analyst environments saved to a `0600` file; `env list` showed
  a rejected secret as unusable without printing it; the console listed all three, selected the first usable,
  selected another, refused the unusable one (409), and proxied the selected environment's data.
- Not run: a real Cloudflare account, a real OneCLI gateway (the OneCLI helper is covered by unit tests with a
  fake `onecli`; only the argument shape was checked against the installed OneCLI 2.11 help), and a custom
  domain on a real Worker (custom-domain URLs are covered by the file and verification tests).


## Feature 019 (`vizoalica deploy`)

See [../019-deploy-command](../019-deploy-command/spec.md). Verified: unit tests for the plan, Wrangler runner
(token only in the environment, OneCLI wrapping), error explanations, the apply steps against a Wrangler with
memory (order, refusal of existing names, `--resume`, failures, account choice, secret handling, environment
registration). Terraform generation was built and then removed (deferred). **Not run:** a real Cloudflare
deploy.

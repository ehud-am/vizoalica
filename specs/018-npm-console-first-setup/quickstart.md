# Quickstart: validating the npm install and console-first setup

A run guide that proves the feature end to end. It links to the contracts and data model instead of
repeating them. Nothing here touches a real Cloudflare account except section 9 (optional, isolated).

## Prerequisites

- Node.js 22 or newer, pnpm 9, `pnpm install` at the repository root; Playwright Chromium for the console
  end-to-end run.
- Never run `git clean -x` in the main checkout: it holds the git-ignored production Wrangler config. Use a
  `git worktree` for clean-tree experiments, and scratch names beginning `vizoalica-rehearsal-` for any
  Cloudflare resource.

## 1. The quality gates

```sh
pnpm typecheck && pnpm lint && pnpm format:check
pnpm coverage        # at least 90% lines and branches
pnpm test:e2e        # console flows, per role, with axe scans
pnpm package:check   # the tarball allowlist, clean-prefix install, and start-up smoke test
```

**Expect:** all green.

## 2. The package, from a clean prefix (Stories 2 and 8, SC-001, FR-008)

```sh
pnpm package:build
(cd apps/cli/package && npm pack --pack-destination "$TMPDIR/vz-pack")
npm install -g --prefix "$TMPDIR/vz-prefix" "$TMPDIR/vz-pack"/vizoalica-*.tgz
"$TMPDIR/vz-prefix/bin/vizoalica" --version
HOME="$TMPDIR/vz-home" "$TMPDIR/vz-prefix/bin/vizoalica" console --no-open
```

**Expect:** the version prints; the console starts and prints `http://127.0.0.1:4318`; `curl` of that address
returns the console page; `curl http://127.0.0.1:4318/api/setup/state` (after the session call) reports
`needsFirstRun: true`; `curl http://127.0.0.1:4318/api/sdk/vizoalica.js` returns the SDK; a request for
`/../../etc/passwd` and its encoded forms is refused; one interrupt stops the process; the tarball lists only
the files in [contracts/package-and-cli.md](./contracts/package-and-cli.md).

## 3. The footer (Story 1, SC-008)

```sh
pnpm --filter @vizoalica/admin-web exec playwright test e2e/footer.spec.ts
```

**Expect:** the brand, tagline, both link groups, and version appear on the first-run, connected, and
connection-error screens at phone and desktop widths in both themes; every link has a distinct accessible
name; no network request is made by the footer; axe reports nothing.

## 4. First run and the journey (Stories 3 and 4, SC-003, SC-004)

```sh
pnpm --filter @vizoalica/admin-web exec playwright test e2e/first-run.spec.ts e2e/journey.spec.ts
pnpm vitest run apps/admin-web/tests/first-run.test.tsx apps/admin-web/tests/journey.test.tsx apps/admin-web/tests/availability.test.ts apps/admin-web/tests/setup-experience.test.tsx
```

**Expect:** for each role and situation the first-run flow asks at most three questions and lands on the right
next step; with no backend every create and change control is unavailable with a reason and a next step and
sends no request; the journey shows the current stage and one next action at each of the four stages and hides
when data arrives; the answers can be changed from settings.

## 5. Roles are enforced by the Worker (Stories 6 and 7, SC-005, SC-006)

```sh
pnpm vitest run apps/ingest-worker -t "access key"
```

**Expect:** for every admin route the matrix in [contracts/worker-access-keys.md](./contracts/worker-access-keys.md)
holds for an administrator secret, an analyst key, owner keys with each scope (everything, one project, one
website), a revoked key, a key for another project or website, and a malformed key. Analysts read analytics and
configuration and change nothing; owners manage projects and websites only inside scope (creating projects only with
scope everything, websites only with scope everything or that project) and are refused every backend-level route
and the automation interface; out-of-scope resources are not found; stored keys are hashes; owner writes are
audited with the key id; a Worker without the table still serves the administrator.

## 6. Deploying from the console, against a fake Wrangler (Story 5, SC-002, SC-007)

```sh
pnpm vitest run apps/local-ops-api -t "deploy"
```

**Expect:** the plan is shown and nothing is created before approval; steps run in order; a failed step stops
with what exists; a resumed run repeats nothing; a resource the run did not create blocks the flow; cleanup
needs confirmation and removes only what the run created; secrets are revealed once and then gone; no secret
is in a log, a run record, or a saved file other than the 0600 connection file.

## 7. Versions and updates (Story 9, SC-012, SC-013, SC-014)

```sh
pnpm vitest run apps/ingest-worker apps/local-ops-api apps/cli -t "schema|migration|update"
pnpm --filter @vizoalica/admin-web test:e2e -- --grep "versions|update"
```

**Expect:** migrations `0001` to `0002` applied to an empty database and to a fixture of the 0.5.2 schema give
identical schemas; a database with hand-added tables is adopted; a migration file with a destructive statement
and no annotation fails the check; the Worker reports its version and the applied and expected schema versions;
the console shows the three versions with the right status for a current, a one-release-behind, a newer, an
unknown, and an unsupported backend, to every role; an update run against a fake Wrangler shows the plan first,
takes the backup before migrating, migrates before deploying the Worker, skips what is current, stops on a failed
step and resumes without repeating, refuses a downgrade, and records what changed; a probe posting events during
the update loses none.

## 8. Multiple environments, against a fake Wrangler (Story 10 and Story 11, SC-015, SC-016, SC-017)

```sh
pnpm vitest run apps/local-ops-api -t "environment"
pnpm --filter @vizoalica/admin-web test:e2e -- --grep "environment"
pnpm vitest run apps/cli -t "worker-bundle"
```

**Expect:** creating two environments ("dev" and "stage") in the console, each with its own Cloudflare
credential configuration (one `token` mode, one `onecli` mode against the fake tool), produces two plans
whose every resource name starts with that environment's prefix; deploying both against the fake Wrangler
never lets one environment's detect or cleanup step see the other's resources; an access key issued from
"dev" is refused when "stage" is selected and when presented directly to "stage"'s fake backend; switching
the active environment replaces every screen's data with no leftover from the previous one; removing an
environment forgets its local file without any Cloudflare call; naming a second environment the same as the
first is refused before anything is saved; and the packaged Worker bundle (`dist/worker/index.mjs` plus
`dist/worker/wrangler.template.toml`) passes a `wrangler deploy --dry-run` with the repository's own Wrangler,
using only files under `apps/cli/package/dist/`, never a repository-relative source path.

## 9. Existing setups keep working (Story 8, SC-009)

```sh
pnpm vitest run apps/local-ops-api apps/deploy-cli -t "existing setup|retired"
```

**Expect:** a saved file-mode connection and a saved OneCLI-mode connection are recognized with no first-run
questions; `vizoalica install` deploys nothing, prints where to go, and exits with code 2.

## 10. Rehearsal on a real account (optional, isolated)

In a separate `git worktree`, with scratch names and a scratch Cloudflare account or resources named
`vizoalica-rehearsal-*`, run the console from the built package, create an environment named
`vizoalica-rehearsal` (so every resource it creates carries that prefix), deploy from the console, share a website,
connect as an analyst and as an owner on a second `HOME`, check the refusals, then install the previous release
first and update it from the console, watching versions, the backup file, and a loop of test events. Tear down in the order in
`docs/operations/cloudflare.md`, only names that start with `vizoalica-rehearsal-`. Never point it at the
production database or the production Wrangler configuration.

## 11. The maintainer's running backend (compatibility, R12, and its first update)

With the console from this release against the existing 0.6.2 backend: it connects with no first-run
questions, shows the backend as older-but-working, keeps analytics working, shows its versions as unknown, and offers the update; running the update from the console
backs up the database, applies `0002` (adopting the tables that were added by hand), deploys the Worker, and ends
with matching versions and key management available.

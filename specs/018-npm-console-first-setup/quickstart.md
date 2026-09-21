# Quickstart: validating the npm install and console-first setup

A run guide that proves the feature end to end. It links to the contracts and data model instead of
repeating them. Nothing here touches a real Cloudflare account except section 8 (optional, isolated).

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
npm pack --workspace vizoalica --pack-destination "$TMPDIR/vz-pack"
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
pnpm --filter @vizoalica/admin-web test:e2e -- --grep "footer"
```

**Expect:** the brand, tagline, both link groups, and version appear on the first-run, connected, and
connection-error screens at phone and desktop widths in both themes; every link has a distinct accessible
name; no network request is made by the footer; axe reports nothing.

## 4. First run and the journey (Stories 3 and 4, SC-003, SC-004)

```sh
pnpm --filter @vizoalica/admin-web test:e2e -- --grep "first run|journey|availability"
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
holds with an administrator secret, an active key, a revoked key, a key for another project or website, and a
malformed key; reader reads succeed only inside scope; every write is refused; stored keys are hashes; a
Worker without the table still serves the administrator.

## 6. Deploying from the console, against a fake Wrangler (Story 5, SC-002, SC-007)

```sh
pnpm vitest run apps/local-ops-api -t "deploy"
```

**Expect:** the plan is shown and nothing is created before approval; steps run in order; a failed step stops
with what exists; a resumed run repeats nothing; a resource the run did not create blocks the flow; cleanup
needs confirmation and removes only what the run created; secrets are revealed once and then gone; no secret
is in a log, a run record, or a saved file other than the 0600 connection file.

## 7. Existing setups keep working (Story 8, SC-009)

```sh
pnpm vitest run apps/local-ops-api apps/deploy-cli -t "existing setup|retired"
```

**Expect:** a saved file-mode connection and a saved OneCLI-mode connection are recognized with no first-run
questions; `vizoalica install` deploys nothing, prints where to go, and exits with code 2.

## 8. Rehearsal on a real account (optional, isolated)

In a separate `git worktree`, with scratch names and a scratch Cloudflare account or resources named
`vizoalica-rehearsal-*`, run the console from the built package, deploy from the console, share a website,
connect as an analyst on a second `HOME`, and check the refusals. Tear down in the order in
`docs/operations/cloudflare.md`, only names that start with `vizoalica-rehearsal-`. Never point it at the
production database or the production Wrangler configuration.

## 9. The maintainer's running backend (compatibility, R12)

With the console from this release against the existing 0.6.2 backend: it connects with no first-run
questions, shows the backend as older-but-working, keeps analytics working, and shows key management as
unavailable with "update the backend" until the Worker is redeployed and the `access_keys` table is added by
hand.

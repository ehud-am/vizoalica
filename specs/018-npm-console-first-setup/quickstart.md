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
returns the console page; `curl http://127.0.0.1:4318/api/environments` (after the session call) lists none and
selects none, and `/api/setup/state` answers `409`; `vizoalica env list` says how to add one; `curl http://127.0.0.1:4318/api/sdk/vizoalica.js` returns the SDK; a request for
`/../../etc/passwd` and its encoded forms is refused; one interrupt stops the process; the tarball lists only
the files in [contracts/package-and-cli.md](./contracts/package-and-cli.md).

## 3. The footer (Story 1, SC-008)

```sh
pnpm --filter @vizoalica/admin-web exec playwright test e2e/footer.spec.ts
```

**Expect:** the brand, tagline, both link groups, and version appear on the first-run, connected, and
connection-error screens at phone and desktop widths in both themes; every link has a distinct accessible
name; no network request is made by the footer; axe reports nothing.

## 4. The welcome page, the picker, and the journey (Revision 3, Stories R3-3 and 4)

```sh
pnpm vitest run apps/admin-web/tests/environments-ui.test.tsx apps/admin-web/tests/journey.test.tsx apps/admin-web/tests/availability.test.ts
pnpm --filter @vizoalica/admin-web exec playwright test e2e/environments.spec.ts e2e/journey.spec.ts
```

**Expect:** with no usable environment the console shows only the welcome page (no data screen, no forms), with
the reason for each environment and the exact `vizoalica env` command; with one or more usable it opens on the
selected one and the picker lists all, unusable ones disabled with their reason; choosing one reloads every
screen and sends only the select request; nothing in the console can add, edit, or remove an environment; the
journey shows the current stage and one next action and hides when data arrives.

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

## 6. Versions (Story 9, read-only after Revision 3)

```sh
pnpm vitest run apps/ingest-worker apps/local-ops-api apps/cli -t "schema|migration|update"
pnpm --filter @vizoalica/admin-web test:e2e -- --grep "versions|update"
```

**Expect:** migrations `0001` to `0002` applied to an empty database and to a fixture of the 0.5.2 schema give
identical schemas; a database with hand-added tables is adopted; a migration file with a destructive statement
and no annotation fails the check; the Worker reports its version and the applied and expected schema versions;
the console shows the three versions with the right status for a current, a one-release-behind, a newer, an
unknown, and an unsupported backend, to every role, with no control that changes the backend; an environment
whose database is newer than the console expects is unusable.

## 7. Environments and `vizoalica env` (Revision 3, Stories R3-1 and R3-2, FR-R1 to FR-R6)

```sh
pnpm vitest run apps/local-ops-api/tests/environments-*.test.ts apps/local-ops-api/tests/vault.test.ts apps/cli/tests/env-command.test.ts
```

Then, by hand, against a real Worker (or a throwaway local stub) with a scratch `HOME`:

```sh
export HOME=$(mktemp -d)
echo "$ANALYST_KEY" | vizoalica env add dev --url https://your-worker.example.com --role admin --secret-stdin   # refused: it is an analyst key
echo "$ADMIN_SECRET" | vizoalica env add dev --url https://your-worker.example.com --role admin --secret-stdin  # saved
vizoalica env list
vizoalica console --no-open
```

**Expect:** the wrong-role credential is refused with what it really is and nothing is written; the correct one
is saved to a `0600` `environments.json`; `list` shows `✓`/`✗` with reasons and never a secret; hand-editing
the file changes the console without a restart; a custom domain works like a `workers.dev` address; a secret in
OneCLI is used through the helper (`onecli run --project <workspace> …`) and the console process is not
wrapped; a selection is remembered across restarts; the console and the API expose no route that changes an
environment.

## 8. Existing setups (Revision 3)

The earlier per-environment layout never shipped and is not read. `vizoalica install` prints where to go and
exits with code 2; `vizoalica serve` no longer exists.

## 9. Rehearsal on a real account (optional, isolated)

In a separate `git worktree`, with a scratch `HOME`, scratch Cloudflare resources named `vizoalica-rehearsal-*`
(created with `pnpm vizoalica backend` in that worktree), and an environment named `vizoalica-rehearsal` added
with `vizoalica env add`: run the console from the built package, share a website, add an analyst and an owner
environment on a second `HOME`, check the refusals (including a credential saved with the wrong role), and
try a custom domain and a OneCLI-held secret. Tear down in the order in `docs/operations/cloudflare.md`, only
names that start with `vizoalica-rehearsal-`. Never point it at the production database or the production
Wrangler configuration, or at your real `~/.config/vizoalica`.

## 10. The maintainer's running backend (compatibility)

With the console from this release against the existing backend, add it with `vizoalica env add` (OneCLI:
`--secret-onecli --onecli-workspace … --onecli-agent … --onecli-gateway …`). It should verify, appear in the
picker, keep analytics working, and show its versions. The backend is updated as before (`pnpm vizoalica
backend`), not from the console.

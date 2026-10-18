# QA report: Vizoalica v0.11.1 (pre-release and skeptical review)

This report was produced by a separate, clean-context QA agent (constitution v3.1.0) that re-ran every check itself
rather than relying on the implementer's results.

- Date: 2026-10-18
- Commit: `214770579f6019dfaf70335160754564fcacae38` (branch `release/0.11.1`, working tree clean before and after)
- Scope: `git diff v0.11.0..release/0.11.1` (10 files, dependency-only release)

## Results

| Check                                                    | Result | Numbers                                                                                       |
| -------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                         | pass   | lockfile up to date, 13 workspace projects                                                    |
| `pnpm format:check`                                      | pass   | all files formatted                                                                           |
| `pnpm lint`                                              | pass   | no findings                                                                                   |
| `pnpm typecheck`                                         | pass   | `tsc -b` plus examples                                                                        |
| `pnpm coverage`                                          | pass   | 198 files, 2012 tests passed; lines 97.07% (6831/7037), branches 91.00% (6677/7337); gate 90% |
| `pnpm build`                                             | pass   |                                                                                               |
| `pnpm browser-sdk:build` + `git status`                  | pass   | no drift in `apps/ingest-worker/src/generated` or `examples`                                  |
| `pnpm generate:deploy-workflow:check`                    | pass   | workflow up to date                                                                           |
| `actionlint .github/workflows/*.yml`                     | pass   | no findings                                                                                   |
| `pnpm package:build` / `package:check`                   | pass   | built `vizoalica@0.11.1`; 30 checks ok, `--version` prints 0.11.1                             |
| `pnpm test:e2e`                                          | pass   | 90 passed (Chromium for Playwright 1.64 was already installed)                                |
| `pnpm docs:build`                                        | pass   | `releases/v0.11.1.html` built, listed in sitemap                                              |
| docs site tests                                          | pass   | 12 passed, 2 skipped by design (analytics-consent tests skip when built without analytics)    |
| `pnpm audit --prod --audit-level high`                   | pass   | exit 0; 1 moderate (`fast-uri` 3.1.7 via `ajv`), already disclosed in release notes           |
| `gitleaks detect ... main..HEAD`                         | pass   | 1 commit scanned, no leaks                                                                    |
| Worker tests (`apps/ingest-worker`, `apps/ingest-api`)   | pass   | 52 files, 460 tests                                                                           |
| Packaged Worker bundle, `wrangler deploy --dry-run`      | pass   | wrangler 4.150.0 accepted the template; 481.90 KiB / 95.12 KiB gzip; D1 and R2 bindings shown |
| Packaged Worker bundle, live `wrangler dev` request test | n/a    | could not be run in this environment (see below)                                              |

Docs tests: port 4321 was held by another process (PID 85186, not mine), so the tests ran from temporary copies of the
config and spec on port 4399. The copies were deleted afterwards and `git status` is clean.

## Diff review

- **Lockfile versus stated updates**: matches. Every stated bump is present in the resolved lockfile: wrangler 4.150.0,
  vite 8.3.4, zod 4.6.7, @playwright/test, playwright and playwright-core 1.64.0, prettier 3.9.10, @typescript-eslint
  (all ten packages) 8.71.2, @testing-library/user-event 14.6.8. I parsed the `packages:` section of both lockfiles.
  There are no new package names, no non-registry sources (no tarball or git entries), and no existing key changed
  content in place (91 keys removed, 64 added, all version bumps).
- **Transitive changes** beyond the headline packages, all expected from the bumps: `miniflare`
  5.20261006.0-alpha to 5.20261006.2-beta (the exact version wrangler 4.150.0 depends on per the registry), `rolldown`
  and its bindings 1.2.13 to 1.2.14 and `@oxc-project/types` 0.153.0 to 0.154.0 (from vite), `sharp` and libvips
  0.35.4/1.3.3 to 0.35.5/1.3.4 (from wrangler's miniflare), `postcss` 8.5.29 to 8.5.30, and the `esbuild` 0.28.1 copy
  dropped, leaving 0.25.12 and 0.28.2.
- **Integrity**: the lockfile integrity hashes for wrangler, vite, zod, playwright, prettier, miniflare and rolldown
  equal the npm registry values.
- **Install scripts**: no new package with `requiresBuild`. The packages flagged "new" by key are only version
  re-keys of existing bin packages.
- **Pinned action**: `reviewdog/action-actionlint@3cbf14efd750961dba35fccbf00f9e14028cb1f5 # v1.80.2`. Checked
  upstream with `git ls-remote`: tag `v1.80.2` is an annotated tag whose peeled commit is exactly that SHA. The old
  SHA likewise matched v1.79.1.
- **Consistency**: root version 0.11.1; CHANGELOG has a dated 0.11.1 entry; `docs/releases/v0.11.1.md` exists and its
  `--version` line says 0.11.1; the sidebar gains v0.11.1 and the top-nav "Releases" link and `docs/index.md` point to
  v0.11.1; `docs/tests/site.spec.ts` lists `/releases/v0.11.1`; `docs/package.json` and `apps/admin-web/package.json`
  carry the new Playwright and vite ranges. Workspace sub-packages keep their private 0.1.0 versions as before.
- `zod` has no manifest change (`apps/cli` declares `^4`); the 4.6.7 resolution comes only from the lockfile, which is
  expected.

## Findings

Blocker: none.

Major: none.

Minor:

1. `docs/releases/v0.11.1.md` and the CHANGELOG list `zod` 4.6.7 as a dependency update. That is accurate for the
   lockfile, but no `package.json` range changed for it, so a fresh resolution without the lockfile could differ. No
   action needed; informational.
2. `miniflare` resolved to a `-beta` prerelease (and was `-alpha` before). This is what wrangler 4.150.0 pins itself,
   so it is not introduced by this release, but it is a dev-only dependency to keep in mind.
3. `docs/.vitepress/dist/llms.txt` does not mention release 0.11.1 (it did not mention 0.11.0 either), so it is
   consistent with prior behavior.
4. Carried over, not new: the moderate `fast-uri` advisory (through `ajv`), already stated in the release notes.

## Could not verify

- Live request test of the packaged Worker through `wrangler dev --local`. The local server reached "ready" but
  connections were refused or reset and the server kept reloading, in this sandbox. The same happened with the
  previous wrangler 4.148.0, so it looks like an environment limitation and not a regression, but I cannot confirm it
  from here. The Worker's behavior is covered instead by the 460 Worker and ingest tests, the dry-run bundling with
  wrangler 4.150.0, and the real-browser SDK end-to-end tests. A smoke test of one real deployed Worker (for example
  `vizoalica deploy <name> --update` on a dev environment) is the remaining check, and is for the release owner.
- Whether the published npm package, the GitHub release and CI on the actual PR pass (including the new
  reviewdog action run on GitHub). Nothing was pushed, tagged or deployed.
- Cross-platform behavior (the lockfile adds platform binaries for Linux/Windows that I could not run on macOS).

## Recommendation

**Go**, with one optional condition: after merging, check that the CI run on GitHub (in particular the
`reviewdog/action-actionlint` step) is green before tagging, and optionally smoke-test one dev Worker update.

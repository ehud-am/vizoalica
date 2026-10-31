# Self-hosted releases

Vizoalica is distributed as self-hosted software. Publishing a repository release and deploying
an installation are separate operations.

## Maintainer release

A maintainer release produces an immutable Git tag and GitHub Release with source, release notes,
checksums for any published assets, and a deployment-compatibility note. It must not contain Cloudflare account
credentials or trigger deployment. Before publishing, run:

```sh
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm run validate
pnpm run build
pnpm browser-sdk:build
pnpm test:e2e
pnpm coverage
pnpm audit --audit-level high
```

Before a private repository becomes public, work through the
[public repository checklist](public-release.md): it covers secret scanning of history and the
publishable tree, ignored operator files, and the owner-controlled GitHub settings that remain
outside the source release.

The contrarian QA review and this test cycle are run by a separate AI agent started with clean context (the
constitution's release gate): it gets the repository, the specifications and the release scope, not the
implementing agent's conversation or self-review, and it re-runs the checks itself. Its written report says so.

Document the release version, commit SHA, compatibility changes, and whether the release changes the
D1 schema. A self-hosting operator decides whether and when to use the release.

## Automated release after approval

A release happens only after the release owner approves it in the project chat (constitution,
release gates). Once approved, the agent merges the release pull request, which bumps `version` in
`package.json` and adds `docs/releases/vX.Y.Z.md`. On that push to `main`,
`.github/workflows/release.yml`:

1. reads the version and skips if tag `vX.Y.Z` already exists (safe to re-run);
2. fails if `docs/releases/vX.Y.Z.md` is missing;
3. creates the tag and GitHub Release from that file;
4. dispatches `publish.yml` (npm) and `skill-release.yml` (skill zip) on the new tag. The workflow
   token's releases do not fire `release` events, but `workflow_dispatch` is allowed.

`publish.yml` stays a standalone workflow so the npm trusted publisher (bound to that filename)
keeps working. Re-run a release by running `release.yml` manually from `main`.

One-time setup: Settings → Actions → General → Workflow permissions must allow the workflow token
to write contents and actions (the workflow requests them explicitly; org policy may cap them).
If `main` has tag protection rules, allow `v*` tags created by GitHub Actions.

## Publishing the `vizoalica` package to npm

Installing the console with `npm install -g vizoalica` (see [the quick start](../get-started.md)) needs
the package to exist on npm. Claiming the name and the first publish are the project owner's actions,
done once:

1. **Create an npm account**, if there is not one already, and turn on **two-factor authentication**
   set to "Authorization and writes" — npm requires this to publish, and provenance publishing needs
   it too.
2. **Claim the name with a first publish.** There is no separate reservation step: whoever publishes
   first owns it. `vizoalica` on npm is already claimed this way (published manually, once, with a
   one-time automation token, `--provenance=false`, since provenance only works from a supported CI
   system). If the name were ever lost and had to be reclaimed, or for a scoped alternative such as
   `@your-org/vizoalica`, the same steps apply: `pnpm package:build && pnpm package:check`, then
   `npm publish --access public --provenance=false` from `apps/cli/package`, signed in with
   `npm login`.
3. **Hand future releases to CI.** On [npmjs.com](https://www.npmjs.com), open the package's
   Settings and add a trusted publisher: GitHub, repository `ehud-am/vizoalica`, workflow
   `publish.yml`. This lets `.github/workflows/publish.yml` publish with
   `npm publish --provenance` and no long-lived token, using GitHub's OIDC identity. (If trusted
   publishing is not available, add a granular npm automation token instead and store it as the
   repository secret `NPM_TOKEN`.)
4. **Turn it on.** Set the repository variable `VIZOALICA_NPM_PUBLISH` to `true`
   (Settings → Secrets and variables → Actions → Variables). Until this is set, the workflow builds
   and checks the package on every release but skips the actual publish, and says so in the run
   summary.
5. **Verify provenance** on the package's npm page after the first automated publish: it should show
   a "Provenance" badge linking back to the GitHub Actions run and this repository.

After that, publishing a GitHub Release (or running the workflow manually) publishes the matching
npm version automatically; nothing further is manual.

## Operator deployment

An operator deploys a selected release from their own checkout and Cloudflare account: a first
install with `pnpm deploy:apply`, or an update of a running backend with `wrangler deploy`. Both
are described in [the Cloudflare operations guide](./cloudflare.md).

There is no automatic deployment of the backend (Worker/D1/R2) on push, merge, tag creation, or
GitHub Release publication — that stays a deliberate, approval-gated operator action.

A connected **website**, however, can deploy automatically on push once configured: see
[website activation](pages.md) and the
[deploy workflow contract](../../specs/011-quality-simplicity-release/contracts/deploy-workflow-contract.md).
That automation is scoped to the website's own Cloudflare Pages project and repository — it never
touches the backend.

## Deployment boundary of the 0.5 and early 0.6 lines

Through 0.6.3, releases supported **fresh installs only**: a new installation applied the single
complete `0001_initial.sql` baseline to a new empty D1 database, and the install preflight rejected
existing or ambiguous Vizoalica schema state without changing it. There was no automated upgrade,
data-preserving migration, backfill, or schema rollback.

**This ends at 0.6.4.** Database changes are now numbered, additive migrations under
`deploy/cloudflare/migrations/` (starting with `0002_access_keys.sql`), and the console's Backend
screen reports the applied and expected schema versions and the Worker's version to every role. See
[Database and Worker versions](schema-versions.md) for what changed and how to author a migration.

**Since 0.7.0**, the console only reads a backend's versions (per selected environment); it does not update
one. Update a backend with `vizoalica deploy <name> --update`, or
apply a migration by hand (`wrangler d1 migrations apply <database> --remote --config <config>`); see
[Update an existing backend](cloudflare.md#update-an-existing-backend).

Shipping a newer Worker build to an installation that already has data is supported when the
release leaves the schema unchanged; see
[Update an existing backend](cloudflare.md#update-an-existing-backend). When a release does change
the schema, its [changelog](../../CHANGELOG.md) entry names the migration; a fresh install on a new
empty database still works too.

A source release, tag, or GitHub Release never deploys an operator's Cloudflare resources or
alters credentials. [Local validation evidence](../../specs/010-project-first-console/qa-report.md)
distinguishes automated checks from human visual and assistive-technology review. A version bump
in the checkout is not a published Git tag or GitHub Release.

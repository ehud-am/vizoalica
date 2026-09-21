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

Document the release version, commit SHA, compatibility changes, and whether the release changes the
D1 schema. A self-hosting operator decides whether and when to use the release.

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

## Deployment boundary of the 0.5 and 0.6 lines

The 0.5 and 0.6 releases support **fresh installs only**: a new installation applies the single complete
`0001_initial.sql` baseline to a new empty D1 database, and the install preflight rejects existing
or ambiguous Vizoalica schema state without changing it. There is no automated upgrade,
data-preserving migration, backfill, or schema rollback. Version 0.6 changes the schema (it adds two
tables for actions to the baseline), so a fresh install on a new empty database is its supported path.

Shipping a newer Worker build to an installation that already has data is supported when the
release leaves the schema unchanged; see
[Update an existing backend](cloudflare.md#update-an-existing-backend). When a release does change
the schema, its [changelog](../../CHANGELOG.md) entry has upgrade notes and a fresh install on a new
empty database is the supported alternative.

A source release, tag, or GitHub Release never deploys an operator's Cloudflare resources or
alters credentials. [Local validation evidence](../../specs/010-project-first-console/qa-report.md)
distinguishes automated checks from human visual and assistive-technology review. A version bump
in the checkout is not a published Git tag or GitHub Release.

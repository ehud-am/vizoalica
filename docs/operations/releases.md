# Self-hosted releases

Vizoalica is distributed as self-hosted software. Publishing a repository release and deploying
an installation are separate operations.

## Maintainer release

A maintainer release produces an immutable Git tag and GitHub Release with source, release notes,
checksums for any published assets, and a migration note. It must not contain Cloudflare account
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

Before a private repository becomes public, also scan both reachable history and the exact
publishable working tree with a current secret scanner, review image/document metadata, and confirm
that operator-owned `.env`, Wrangler production, deployment-profile, audit, receipt, and local
console files remain ignored and untracked. Enable GitHub secret scanning and push protection when
visibility changes. Use the [public repository checklist](public-release.md) for the owner-controlled
GitHub settings that remain outside the source release.

Document the release version, commit SHA, compatibility changes, and required migrations. A
self-hosting operator decides whether and when to use the release.

## Operator deployment

An operator deploys a selected release from their own checkout and Cloudflare account. The
supported commands are described in [the Cloudflare operations guide](./cloudflare.md).

There is no automatic deployment on push, merge, tag creation, or GitHub Release publication.

## Release 0.5.0 changes

No new migrations: existing installations must have every file through
`0005_dashboard_visual_refresh.sql`. The release replaces the console brand and visual system and
adds `pnpm ops` for guided local-console and Direct Upload Pages operations. It does not deploy an
operator's Cloudflare resources or alter their credentials.

[Local validation evidence](../../specs/008-modernize-console-design/qa-report.md) distinguishes
automated checks from human visual and assistive-technology review. A version bump in the checkout
is not a published Git tag or GitHub Release.

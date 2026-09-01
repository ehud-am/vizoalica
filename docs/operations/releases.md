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
```

Document the release version, commit SHA, compatibility changes, and required migrations. A
self-hosting operator decides whether and when to use the release.

## Operator deployment

An operator deploys a selected release from their own checkout and Cloudflare account. The
supported commands are described in [the Cloudflare operations guide](./cloudflare.md).

There is no automatic deployment on push, merge, tag creation, or GitHub Release publication.

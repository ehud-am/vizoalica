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
pnpm coverage
pnpm audit --audit-level high
```

Document the release version, commit SHA, compatibility changes, and required migrations. A
self-hosting operator decides whether and when to use the release.

## Operator deployment

An operator deploys a selected release from their own checkout and Cloudflare account. The
supported commands are described in [the Cloudflare operations guide](./cloudflare.md).

There is no automatic deployment on push, merge, tag creation, or GitHub Release publication.

## Patch 0.3.1 installation changes

No new migrations: existing installations must have every file through `0004_local_operations.sql`.
Restart the local API and console together to obtain the complete snippet and source identifiers.
If adopting the Pages example, build/copy its browser bundle, configure the Function and signing
secret, then deploy the website separately. See the [Pages recipe](pages.md).

[Local validation evidence](../../specs/006-simple-cloudflare-install/validation.md) and
[the skeptical QA review](../../specs/006-simple-cloudflare-install/qa.md) distinguish automated
checks from live operator validation. A version bump in the checkout is not a published Git tag
or GitHub Release.

# Contributing to Vizoalica

Thank you for helping improve Vizoalica. Keep changes focused, privacy-preserving, portable, and
easy for a self-hosting operator to audit.

## Development setup

Requirements are Node.js 22 or newer and the pnpm version declared in `package.json`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm validate
pnpm build
```

Changes to responsive layout or accessibility should also run:

```sh
pnpm test:e2e
```

## Pull requests

- Describe the operator or user outcome and any migration, compatibility, security, privacy, or
  cost impact.
- Add or update tests for observable behavior.
- Update the specification and operational documentation when contracts or workflows change.
- Keep unrelated refactors out of the same pull request.
- Confirm formatting, lint, type checking, tests, coverage, build, browser checks, and the
  production dependency audit pass before requesting review.

## Protect private information

Never commit `.env` files, Wrangler production configuration, deployment profiles, OneCLI output,
Cloudflare identifiers tied to a private account, secrets, tokens, receipts, audit logs, raw event
payloads, or visitor data. Use `example`, `example.com`, and explicit placeholders in tests and
documentation. If a credential is exposed, rotate it before doing anything else and follow
[SECURITY.md](SECURITY.md).

## Releases and deployments

A source release never deploys an operator's installation. Maintainers follow
[the release guide](docs/operations/releases.md); operators independently choose and deploy a
reviewed release using the Cloudflare operations guide.

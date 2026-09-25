# Feature Specification: `vizoalica deploy`

**Feature Branch**: `018-npm-console-first-setup` (continues from Revision 3 of
[../018-npm-console-first-setup/spec.md](../018-npm-console-first-setup/spec.md))

**Created**: 2026-09-24 · **Status**: Draft. **Revised 2026-09-24: Terraform generation (Story D2) is deferred**; see the note below.

**Input**: "can you spec, plan, tasks, and implement the vizoalica deploy command. two options 1. run this only,
2. generate terraform template"

## Why

Revision 3 moved environments out of the console and removed deploy and update from it, so the installed
package can no longer create a backend: only `pnpm vizoalica backend` in a source checkout can. `vizoalica
deploy` gives the npm-installed CLI a way to create the backend for an environment, either by doing it now
(an infrastructure-as-code output was specified and built, then deferred; see "Deferred").

## Clarifications (decided, not asked)

- The environment **name** is the resource prefix (existing rule R26): `<name>-vizoalica-worker`,
  `<name>-vizoalica-db`, `<name>-vizoalica-bucket`. The name need not be in `environments.json` beforehand; it
  must not be there already, so a deploy can never repoint an environment that exists.
- Without `--apply` the command is a dry run (it prints the plan); with `--apply` it creates.
- First install only. Updating an existing backend stays `pnpm vizoalica backend` (out of scope here).
- The Cloudflare account is chosen, never guessed, when the credential can see more than one.

## Stories

### Story D1 - Deploy (P1)

`vizoalica deploy <name> --apply` shows what will be created, asks to confirm (`--yes` skips; required
without a terminal), then, in order: checks Cloudflare access, refuses if any of the three resources already
exists (`--resume` tolerates ones this command may have left), creates the database and the bucket, writes a
deployment config, creates the tables from the packaged migrations, deploys the packaged Worker, generates and
stores the three secrets, checks `/healthz`, and adds `<name>` to `environments.json` as an `admin`
environment with the new address and administrator secret. It prints the token and digest secrets **once**, or
writes them to `--secrets-file` (0600, must not exist). It never writes a secret anywhere else, and never
prints the administrator secret (it is saved for the console).

Acceptance: (1) every failure names the step and the likely fix (not signed in, token missing a permission,
R2 not enabled, name taken); (2) nothing already existing is modified or deleted; (3) rerunning after a
failure with `--resume` continues without recreating; (4) after success `vizoalica env check <name>` is green
and the console opens on it; (5) without `--apply` it prints the plan and exits without touching Cloudflare.

### Story D2 - Generate Terraform (DEFERRED)

Built and then removed on 2026-09-24, before any real use. Reasons: the Cloudflare provider's v5 rewrite has had
breaking changes, the generated module could not be validated (`terraform validate` was not available), and
creating D1 tables needs a non-declarative shell step. Not offered until it has been applied once against a
scratch account and a maintained IaC route (Terraform or OpenTofu pinned to a tested provider version, a
Wrangler-native export, or another tool) is chosen. The design (resources, variables, the migration step,
secrets as sensitive outputs, README) is in git history at the commit that added `apps/cli/src/deploy/terraform.ts`.

### Story D3 - Credentials for Cloudflare (P1)

The Cloudflare credential comes from, in order: `--cloudflare-token-stdin`; `--cloudflare-onecli`
with `--onecli-workspace/--onecli-agent/--onecli-gateway` (Wrangler then runs under `onecli run`); the
`CLOUDFLARE_API_TOKEN` environment variable; a hidden prompt. It is passed to Wrangler only through its
environment, never as an argument, and is stored in the new environment only with `--save-cloudflare`.

## Requirements

- **FR-D1** `deploy <name>` without `--apply` only shows the plan (no terminal needed, nothing created);
  `--apply` creates.
- **FR-D2** Names are validated with the existing environment-name rules; an environment already in
  `environments.json` is refused, and so is a broken environments file.
- **FR-D3** Apply never modifies or deletes a resource it did not create in this run.
- **FR-D4** Secrets: generated with the existing generator; administrator secret only to `environments.json`;
  others once to the terminal or `--secrets-file`; without a terminal and without `--secrets-file`, refuse
  before creating anything.
- **FR-D5** Wrangler is the pinned version, run without a shell, with the credential in its environment only;
  `VIZOALICA_WRANGLER` overrides the command (tests).
- **FR-D6** The package ships the Worker bundle, its Wrangler template, and the migrations; `deploy` uses only
  those (never a repository path).
- **FR-D7** The Worker reports the console/package version it was deployed from.
- **FR-D8** `rotate` replaces only the named secrets of the named environment's Worker, and never loses a
  generated value (Story D4).

### Story D4 - Replace a secret (P1, added 2026-09-24)

`vizoalica rotate <name> <admin|token|digest|all>` replaces secrets on the environment's Worker. It explains the
impact of each, asks to type `rotate` (`--yes` skips; required without a terminal), stores the new values with
`wrangler secret bulk`, writes a new administrator secret into `environments.json` (and verifies it), and hands
the others over like deploy does. Only the admin role may rotate.

Acceptance: (1) the Cloudflare token needs only Workers Scripts: Edit: the account comes from `--account`,
`CLOUDFLARE_ACCOUNT_ID`, the one remembered at deploy or the last rotation, a lookup, or a question; (2) a
secret that exists only in memory is never lost: an unwritable `--secrets-file` is refused before anything
changes, a file that cannot be written or an environment that cannot be saved falls back to showing the value;
(3) a refusal by Cloudflare says which permission and account to check.

### Story D5 - Secrets that cannot be scrolled past (P1, added 2026-09-24)

In a terminal, deploy and rotate show generated secrets **last**, in a framed block naming what each is for,
and wait until `saved` is typed.

## Out of scope

Infrastructure-as-code output, updating an existing backend, destroying a backend, Terraform state management, remote
backends for state, OpenTofu-specific testing, and attaching a custom domain (attach it in Cloudflare, then run `vizoalica env update <name> --url …`).

## Success criteria

- **SC-D1** From an empty machine with an API token, one command creates a working, verified backend and a
  working environment.
- **SC-D3** No secret appears in output except the deliberate one-time reveal.

# Deploy the Vizoalica backend on Cloudflare

Run this guide **once per customer environment**. It creates and verifies the shared ingestion
backend: one Worker, one new D1 database, one new R2 bucket, three Worker secrets, safe defaults,
and scheduled aggregate cleanup.

This release supports **fresh deployments only**. The install commands (`pnpm deploy:check` and
`pnpm deploy:apply`) do not preserve, adopt, or modify an existing Vizoalica schema: the preflight
stops if the selected D1 database contains a Vizoalica table or migration record. For a first
install, select a new empty database; do not delete or alter an existing one. To ship a newer
Worker build to an installation that already has data, use
[Update an existing backend](#update-an-existing-backend) instead.

This guide does not configure an operator machine or connect a website. Its final handoff supplies
the inputs for [operator setup without OneCLI](local-analytics.md),
[operator setup with OneCLI](onecli.md), and [website activation](pages.md).

## Automated install (recommended)

From a checkout of this repository (see [Build from source](../../README.md#build-from-source)),
one command does the whole first install and the first console setup:

```sh
pnpm vizoalica install
```

Or, for the backend alone (for example when another person will set up the console):

```sh
pnpm vizoalica backend
```

What it does, in order:

1. Runs `pnpm build` and checks your Cloudflare login, opening a browser window to sign in if you
   are not signed in. If your login has several accounts it asks which to use.
2. Detects whether Vizoalica is already installed and asks **first install or update?**, offering
   the detected answer as the default.
3. **First install:** creates the D1 database and R2 bucket, writes
   `deploy/cloudflare/wrangler.production.toml` from the example (nothing to copy or edit),
   creates the tables, and deploys the Worker.
4. **Generates the three secrets, stores them on the Worker, and shows them once.** You save them in
   a password manager and type `saved`; the screen is then cleared. They travel to Wrangler over
   standard input, never as a command argument or a file. It never asks you to invent or paste a key.
5. Checks the Worker's `/healthz`, and prints its address.

`pnpm vizoalica install` then continues: it offers to set up this computer as an operator console (using
the administrator secret it just generated, so you paste nothing), to send sample data through the
new backend, and to start the console.

Names default to `vizoalica-ingest`, `vizoalica-config`, and `vizoalica-events`. Override them with
`--worker-name`, `--database`, and `--bucket`, and skip the question with `--first-run` or
`--update`.

Safety properties worth knowing:

- A first install **never adopts an existing database or bucket**. If either already exists it
  stops and tells you to choose new names or answer "update".
- If a first install fails after creating resources, it offers to delete **only the empty resources
  that run created**, so you can retry cleanly. It never touches anything that existed before.
- An old `wrangler.production.toml` is moved aside (`.bak-…`), never overwritten.
- An update keeps your data and secrets. It only generates a secret if one is missing, which also
  makes an interrupted install resumable: run the command again and answer "update".
- R2 not being activated is detected and explained instead of surfacing a raw error.

The manual procedure below does the same steps by hand and is the reference for what the command
runs. Use it when policy requires approving each step.

## Manual install

Everything from **Quick command reference** through **Backend handoff** is the manual procedure.

## Quick command reference

The numbered sections below explain and justify each step; this block is the same sequence with
the prose stripped out, for an operator (or agent) who already knows the model and just needs the
commands in order. Generating the three secrets (step 1) is deliberately manual — it must never
pass through a terminal history, script argument, or AI conversation — so it has no command here.

```sh
# 1. (manual, in a password manager — see "Generate and save the three secrets" below)

# 2. Prepare the checkout
git clone https://github.com/ehud-am/vizoalica.git && cd vizoalica
git checkout YOUR_APPROVED_TAG_OR_COMMIT
corepack enable && corepack prepare pnpm@9.15.4 --activate
pnpm install --frozen-lockfile && pnpm build
cp deploy/cloudflare/wrangler.example.toml deploy/cloudflare/wrangler.production.toml
# then edit wrangler.production.toml per the table in step 3 below

# 3. Authenticate and create fresh resources
pnpm exec wrangler login
pnpm exec wrangler d1 create YOUR_D1_NAME
pnpm exec wrangler r2 bucket create YOUR_R2_BUCKET

# 4. Store the three secrets (pastes from the password manager, one prompt each)
pnpm exec wrangler secret put VIZOALICA_TOKEN_SECRET --config deploy/cloudflare/wrangler.production.toml
pnpm exec wrangler secret put VIZOALICA_ADMIN_SECRET --config deploy/cloudflare/wrangler.production.toml
pnpm exec wrangler secret put VIZOALICA_ANALYTICS_DIGEST_SECRET --config deploy/cloudflare/wrangler.production.toml

# 5-6. Preflight, apply, and verify
pnpm deploy:check
pnpm deploy:apply
export VIZOALICA_WORKER_URL="https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev"
pnpm deploy:verify
```

Then continue to [operator setup](local-analytics.md) and [website activation](pages.md) — those
guides are each a single further command sequence, not a repeat of this one.

## Prerequisites

- Node.js 22 or newer and Corepack.
- A reviewed Vizoalica 0.5.2 checkout.
- Access to the intended Cloudflare account with Workers, D1, and R2 available.
- R2 activated for the account; Cloudflare may request billing information even when usage stays
  within an included allowance.
- A password manager with a cryptographically secure random-password generator.
- Authority to approve resource creation and the deployment target.

Allow one setup session. Stop at the first failed **Check** and use
[backend troubleshooting](troubleshooting.md); do not continue with an unverified target.

## Inputs

Record these non-secret choices before starting:

| Input                      | Example             | Rule                                                    |
| -------------------------- | ------------------- | ------------------------------------------------------- |
| Customer/environment label | `acme-production`   | Treat staging and production as separate environments   |
| Cloudflare account         | Account name and ID | Must own every resource below                           |
| Worker name                | `vizoalica-ingest`  | Must be unused for this fresh installation              |
| D1 database name           | `vizoalica-config`  | Must be new and empty                                   |
| R2 bucket name             | `vizoalica-events`  | Must be new for this environment                        |
| Release                    | `v0.5.2`            | Use one reviewed checkout for setup and later operators |

Step 1 creates the three secret values. They do not come from Cloudflare or this repository.

## Security boundary

The Cloudflare login or API token is for backend deployment only. It is not the Worker
administrator secret and never belongs in an operator console or website. Worker secrets never
belong in Git, HTML, browser JavaScript, URLs, command arguments, plans, receipts, logs, support
messages, or AI conversations.

For the simplest path, use Cloudflare-native authentication in a normal terminal outside
`onecli run`. If policy requires a OneCLI-held Cloudflare connection, use the explicit
[approval-gated profile path](#optional-approval-gated-deployment-profile). Never switch paths as an
automatic fallback.

## 1. Generate and save the three secrets

Generate three separate, unrelated cryptographically random strings. Do not invent memorable
values, derive one secret from another, or reuse a password or secret from another system.

For each secret, use one of these formats:

- **Recommended:** 256 random bits encoded as 43 unpadded base64url characters. The allowed
  characters are `A–Z`, `a–z`, `0–9`, `_`, and `-`.
- **Also recommended:** 256 random bits encoded as 64 hexadecimal characters (`0–9` and `a–f`).
- **Minimum:** 32 randomly generated characters. This satisfies the deployment guide's minimum,
  but 43 base64url characters or 64 hexadecimal characters provides a clear 256-bit target.

Values must contain no spaces or line breaks. Wrangler treats them as opaque strings, so do not
add quotes, a variable name, or a `Bearer` prefix to the stored value.

In the password manager, configure the random-password generator for 43–64 characters using one
of the character sets above. Generate and save each value under its exact name before opening a
Wrangler prompt:

| Secret name                         | Purpose                                  | Later destination                        |
| ----------------------------------- | ---------------------------------------- | ---------------------------------------- |
| `VIZOALICA_TOKEN_SECRET`            | Signs short-lived website ingest tokens  | Trusted token issuer for each website    |
| `VIZOALICA_ADMIN_SECRET`            | Authorizes administration and analytics  | Approved operators through either setup  |
| `VIZOALICA_ANALYTICS_DIGEST_SECRET` | Creates non-reversible analytics digests | Worker only; never shared with operators |

Retain all three password-manager records. Keep every value different.

**Check:** all three records exist, their values satisfy one format above, and none appears in a
repository file, terminal command, note, or support message.

## 2. Prepare the checkout

Replace `YOUR_APPROVED_TAG_OR_COMMIT` with the release tag or commit approved for this deployment.
Do not deploy an arbitrary moving branch.

```sh
git clone https://github.com/ehud-am/vizoalica.git
cd vizoalica
git checkout YOUR_APPROVED_TAG_OR_COMMIT
git rev-parse HEAD
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install --frozen-lockfile
pnpm build
cp deploy/cloudflare/wrangler.example.toml deploy/cloudflare/wrangler.production.toml
```

Record the exact commit printed by `git rev-parse HEAD`. The build is required because workspace
packages are consumed through their compiled output during the Worker build.
`wrangler.production.toml` is ignored by Git; edit only that private copy.

**Check:** `pnpm build` succeeds, the printed commit matches the approved release, and
`git status --short` does not list the production configuration or a secret file.

## 3. Authenticate and create fresh resources

```sh
pnpm exec wrangler login
pnpm exec wrangler whoami
pnpm exec wrangler d1 list
pnpm exec wrangler r2 bucket list
```

Confirm the intended account. Then choose unused names and create new resources:

```sh
pnpm exec wrangler d1 create vizoalica-config
pnpm exec wrangler r2 bucket create vizoalica-events
```

Do not reuse a D1 database from an earlier test or partial setup. If either chosen name already
exists, inspect ownership and select a different unused name rather than guessing that it is empty.

Edit `deploy/cloudflare/wrangler.production.toml`:

| Field           | Value                                      |
| --------------- | ------------------------------------------ |
| `name`          | The new Worker name                        |
| `database_name` | The new D1 name                            |
| `database_id`   | The ID returned for that exact D1 database |
| `bucket_name`   | The new R2 bucket name                     |

Keep the binding names, `migrations_dir`, cron trigger, request limit, and
`VIZOALICA_DEMO_MODE = "false"` from the example.

**Check:** the account, names, and D1 ID all match live resources, and no `REPLACE_…` value remains.

If `whoami` reports that authentication is missing or unusable, rerun
`pnpm exec wrangler login` in an interactive terminal, complete the browser authorization, and
repeat `pnpm exec wrangler whoami` before continuing.

## 4. Store the Worker secrets

Retrieve each value from the password manager and paste it only into Wrangler's hidden prompt:

```sh
pnpm exec wrangler secret put VIZOALICA_TOKEN_SECRET --config deploy/cloudflare/wrangler.production.toml
pnpm exec wrangler secret put VIZOALICA_ADMIN_SECRET --config deploy/cloudflare/wrangler.production.toml
pnpm exec wrangler secret put VIZOALICA_ANALYTICS_DIGEST_SECRET --config deploy/cloudflare/wrangler.production.toml
```

Wrangler may offer to create the Worker shell before storing the first secret. Accept only if the
displayed account and Worker name match the reviewed backend target.

```sh
pnpm exec wrangler secret list --config deploy/cloudflare/wrangler.production.toml
```

**Check:** all three secret names appear. The values are never displayed. Retain the token-signing
and administrator values in the password manager for their later, narrowly scoped handoffs.

## 5. Review the fresh baseline and preflight

This release has one complete schema baseline:
`deploy/cloudflare/migrations/0001_initial.sql`. It creates the current schema directly on an empty
database. It is not an in-place data migration.

```sh
pnpm deploy:check
```

The check prints the authenticated identity, confirms that the configured D1 name and R2 bucket
exist, confirms all Worker secret names, inspects the D1 schema for freshness, and performs a
Worker dry-run build. It cannot decide whether those resources are the customer's intended target;
that is why the account, names, and D1 ID must be compared in step 3. Its D1 inspection is
read-only. Any existing or ambiguous Vizoalica schema state stops the check with no schema
mutation.

**Check:** the command reports both `fresh D1 database confirmed` and `deploy preflight passed`.
If it reports existing schema, select a new empty D1 database and update both its name and ID in the
private configuration.

## 6. Apply and deploy

```sh
pnpm deploy:apply
```

Apply reruns the complete preflight and then repeats the fresh-D1 check immediately before applying
the baseline. It deploys the Worker only after the baseline succeeds.

```sh
pnpm exec wrangler d1 execute vizoalica-config \
  --remote \
  --config deploy/cloudflare/wrangler.production.toml \
  --command "SELECT name FROM d1_migrations ORDER BY id;"
pnpm exec wrangler d1 migrations list vizoalica-config \
  --remote \
  --config deploy/cloudflare/wrangler.production.toml
```

Replace `vizoalica-config` if you chose another name.

**Check:** the SQL query returns exactly one recorded name, `0001_initial.sql`, and the migration
list reports that there are no migrations to apply. The first command proves the baseline was
recorded; the second reports only unapplied migration files.

## 7. Configure retention and cost controls

In the R2 dashboard, add a lifecycle rule that expires the `events/` prefix after seven days for
the initial installation. D1's source retention value does not delete R2 objects. Review current
Workers, D1, R2, and Pages pricing before relying on included allowances, enable available account
usage alerts, and keep new website quotas small until traffic is understood.

The deployed cron trigger runs daily at 03:17 UTC and does two jobs:

- It deletes dashboard rollups, ingestion decisions, and quota windows older than the 32-day
  aggregate boundary, in bounded batches, repeating until each table is drained, up to 200
  batches per table per run.
- It permanently purges everything belonging to websites and projects that operators deleted:
  their raw event batches in R2, and their rows in D1 including audit entries and the project and
  website records themselves. See [Deleted websites and projects](#deleted-websites-and-projects).

A source quota limits accepted events, not every incoming request or the total account bill.

**Check:** the R2 lifecycle rule targets only this environment's event prefix and account alerts go
to the intended customer owner.

### Deleted websites and projects

Deleting a website or project in the console is **terminal and permanent**. New events are
rejected immediately, and the next daily run removes all its data. The purge writes one audit
entry that names nothing it removed. To purge now instead of waiting:

```sh
pnpm vizoalica purge-deleted           # dry run: prints what would be removed, deletes nothing
pnpm vizoalica purge-deleted --apply   # permanent; repeats until the Worker reports it finished
```

The dry run needs a Worker that includes the purge endpoint (`POST /v1/admin/purge-deleted`);
an older Worker answers 404, so [update the backend](#update-an-existing-backend) first. Each
run is bounded, so a large purge may take several passes; the command handles that. One table,
`dashboard_seen_events`, has no website column, so a deleted website's rows there are not
removed by the purge; the 32-day cleanup expires them.

### Ingest rate limiting (recommended for public websites)

Requests without a valid signed token are rejected before any database read, so anonymous traffic
costs Worker CPU only. Per-source quotas cap _accepted_ events but do not throttle a single client
that repeatedly sends valid-looking requests. To add an edge throttle, uncomment the
`[[ratelimits]]` block in your `wrangler.production.toml` (it is present, commented out, in
`wrangler.example.toml`) and [update the backend](#update-an-existing-backend):

```toml
[[ratelimits]]
name = "VIZOALICA_INGEST_LIMITER"
namespace_id = "1001"
[ratelimits.simple]
limit = 120
period = 60
```

The Worker then allows at most `limit` ingest requests per `period` seconds for each client
address, across all sources, and answers `429 rate_limited` with `Retry-After: 60` beyond it.
The default of 120 per minute is far above a real visitor's page-view rate but shared office or
mobile-carrier addresses can send many visitors' events, so raise it before lowering it. The
binding uses the Worker's own Cloudflare account permissions; it needs no zone access. If the
limiter is unavailable the Worker fails open and the source quotas still apply. Zone-level rules
(Cloudflare WAF rate limiting, Bot Fight Mode) remain an optional additional layer for operators
who serve the Worker from their own domain.

## Verify deployment health

Copy the Worker origin shown by Wrangler, without a trailing slash:

```sh
export VIZOALICA_WORKER_URL="https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev"
pnpm deploy:verify
```

**Check:** the command reports that `/healthz` returned HTTP success with `"ok":true`. This proves
only that the deployed Worker starts and answers over HTTPS. The health route does not access D1
or R2 and does not prove administrator access, token validation, event persistence, or website
collection.

The recorded-baseline query above verifies D1 schema installation. Operator setup separately
verifies authenticated administration. [Website activation](pages.md) is the first end-to-end
ingestion test: it creates a source, obtains a signed token, requires a **202** response, confirms
the aggregate in the console, and checks that the website remains usable if analytics fails.
Privacy behavior is documented in [privacy operations](privacy.md). For capacity planning, see the
[dashboard cost model](cost-model.md).

## Backend handoff

Record this redacted handoff for the customer. Do not include secret values:

```text
Deployment: Cloudflare backend
Customer/environment: <label>
Release commit: <exact commit>
Worker script name: <name>
Worker origin: https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev
Cloudflare account: <label and safely abbreviated ID>
Deployment/version ID: <identifier printed by deployment>
D1 database name: <name>
R2 bucket name: <name>
Baseline: 0001_initial.sql applied
Health verified at: <timestamp>
R2 lifecycle/usage alerts: <verified or outstanding>
Secret record names: token signing=<record>; administrator=<record>; analytics digest=<record>
```

Give each operator the Worker origin, release identity, and an approved way to obtain the
administrator credential:

- [Direct local credential](local-analytics.md), once for an operator who manages it in a private
  local file; or
- [OneCLI-managed credential](onecli.md), once for an operator whose organization injects it
  through OneCLI.

After one operator is verified, [activate a website](pages.md) once for each website.

## Update an existing backend

The quick way, from an approved checkout:

```sh
git fetch --tags && git checkout YOUR_APPROVED_TAG_OR_COMMIT
pnpm vizoalica backend --update
```

It builds, deploys, keeps your data and secrets, and checks health. If this checkout has no
`wrangler.production.toml` (for example on a second computer), it rebuilds one from your existing
install.

The manual equivalent is below. `pnpm deploy:check` and `pnpm deploy:apply` are **first-install**
commands: both refuse a D1 database that already contains Vizoalica tables, so they cannot ship a
newer Worker build, a changed Wrangler setting such as the rate limiter, or a new secret onto a
running installation. Use native Wrangler for that, from an approved checkout:

```sh
git fetch --tags && git checkout YOUR_APPROVED_TAG_OR_COMMIT
pnpm install --frozen-lockfile
pnpm build
pnpm exec wrangler deploy --config deploy/cloudflare/wrangler.production.toml
export VIZOALICA_WORKER_URL="https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev"
pnpm deploy:verify
pnpm vizoalica verify
```

Worker secrets, D1 data, and R2 objects are untouched by `wrangler deploy`, so there is nothing to
re-enter. Before you run it:

- Read the release notes and [changelog](../../CHANGELOG.md). This is safe only when the release
  leaves the D1 schema unchanged. There is no automated migration: if a release changes the
  schema, its upgrade notes say so, and the alternative is a fresh install on a new empty database.
- Use the same Cloudflare account and `wrangler.production.toml` that created the backend, and
  check `pnpm exec wrangler whoami` first.
- The [approval-gated profile](#optional-approval-gated-deployment-profile) below does not support
  updates: its apply step stops on a non-empty database. If policy requires that lane for every
  change, obtain the owner's explicit approval to use native Wrangler for this update; do not
  work around the check.

**Check:** `pnpm deploy:verify` reports `/healthz` returned `"ok":true`, and `pnpm vizoalica verify`
still reports authenticated access. Then run a website's accepted-event check from
[website activation](pages.md#verify-website-activation) if the release touched ingestion.

## Optional approval-gated deployment profile

Use this alternative only when policy requires explicit Cloudflare provider isolation, and only
for a **first install**: it cannot update an existing backend (see
[above](#update-an-existing-backend)). Initial D1 and R2 resource creation still requires a
separately approved owner action. Configure a private profile outside the repository, then follow
this exact sequence:

```sh
pnpm deploy:configure -- \
  --profile /private/path/vizoalica-profile.json \
  --provider onecli \
  --environment production \
  --wrangler-config /absolute/path/deploy/cloudflare/wrangler.production.toml \
  --account-id YOUR_ACCOUNT_ID \
  --onecli-project YOUR_PROJECT \
  --onecli-agent-id YOUR_AGENT_ID \
  --onecli-agent YOUR_AGENT \
  --onecli-connection YOUR_CONNECTION_ID
pnpm deploy:plan -- --profile /private/path/vizoalica-profile.json --out /private/path/plan.json
pnpm deploy:check -- --profile /private/path/vizoalica-profile.json --plan /private/path/plan.json --receipt /private/path/receipt.json
```

Review the exact account, provider, resources, mutations, and printed plan ID. The receipt is not
approval. Only after the customer approves that exact plan ID:

```sh
pnpm deploy:apply -- --profile /private/path/vizoalica-profile.json --plan /private/path/plan.json --receipt /private/path/receipt.json --approve EXACT_PLAN_ID
pnpm deploy:verify -- --profile /private/path/vizoalica-profile.json --worker-url https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev --plan /private/path/plan.json
pnpm deploy:status -- --profile /private/path/vizoalica-profile.json --plan-id EXACT_PLAN_ID
```

The profile runner removes ambient Cloudflare credentials and never falls back to native login.
The OneCLI deployment connection is unrelated to the OneCLI administrator credential used for an
operator machine.

## Rotate a secret

```sh
pnpm vizoalica rotate admin     # or: token | digest | all
```

It shows what the rotation will break, asks before changing anything, generates a new value,
stores it on the Worker, shows it once, and updates what it can:

| Secret   | What changes                                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin`  | Every console stops working until it has the new value. This computer's file is updated for you; other computers run `pnpm vizoalica connect`; a OneCLI console needs its credential card updated. |
| `token`  | Every website's token endpoint must be given the new value or its events are rejected with 401. Update the Pages secret or the GitHub Actions secret for each website.                             |
| `digest` | Unique-visitor counts restart (visitors seen before count as new once). Nothing is lost and nothing else needs updating.                                                                           |

Run it from the checkout that installed the backend, since it needs `wrangler.production.toml`.
If a secret may have been exposed, rotate it at once; see the recovery notes below.

## Recovery and removal

- **Existing schema detected:** stop. Select a new empty D1 database. This release provides no
  preservation path for that data.
- **Wrong account or resource:** stop, correct the private configuration, and rerun preflight.
- **Update needed on an existing backend:** use [Update an existing backend](#update-an-existing-backend);
  do not rerun `deploy:apply`.
- **Interrupted apply:** inspect D1 migration state and Worker deployment history. Do not assume a
  local timeout means the remote action failed. For a profile deployment, create a new plan and
  receipt before retrying.
- **Unhealthy Worker:** use Cloudflare deployment history only when the selected Worker version is
  compatible with the fresh baseline. Never change D1 schema as an improvised recovery step.
- **Suspected signing-secret exposure:** pause collection, run `pnpm vizoalica rotate token`, update every
  connected website, verify a new accepted event, then resume.
- **Suspected administrator-secret exposure:** run `pnpm vizoalica rotate admin` and update every other
  operator (`pnpm vizoalica connect`). Revoke affected OneCLI agents or remove affected direct local files.
- **Removal:** teardown is a separate destructive customer-owner decision. First revoke access and
  export anything the owner is required to retain; then obtain distinct approval for the exact
  Worker, D1 database, and R2 bucket. Backend automation never deletes them.

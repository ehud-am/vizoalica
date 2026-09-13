# Deploy the Vizoalica backend on Cloudflare

Run this guide **once per customer environment**. It creates and verifies the shared ingestion
backend: one Worker, one new D1 database, one new R2 bucket, three Worker secrets, safe defaults,
and scheduled aggregate cleanup.

This release supports **fresh deployments only**. Backend deployment does not preserve, adopt, or
modify an existing Vizoalica schema. The preflight stops if the selected D1 database contains a
Vizoalica table or migration record. Select a new empty database; do not delete or alter the
existing one.

This guide does not configure an operator machine or connect a website. Its final handoff supplies
the inputs for [operator setup without OneCLI](local-analytics.md),
[operator setup with OneCLI](ops-cli.md), and [website activation](pages.md).

## Prerequisites

- Node.js 22 or newer and Corepack.
- A reviewed Vizoalica 0.5.1 checkout.
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
| Release                    | `v0.5.1`            | Use one reviewed checkout for setup and later operators |

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

The deployed cron trigger deletes dashboard rollups older than the 32-day aggregate boundary in
bounded batches. A source quota limits accepted events, not every incoming request or the total
account bill.

**Check:** the R2 lifecycle rule targets only this environment's event prefix and account alerts go
to the intended customer owner.

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
Worker origin: https://<worker>.<account-subdomain>.workers.dev
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
- [OneCLI-managed credential](ops-cli.md), once for an operator whose organization injects it
  through OneCLI.

After one operator is verified, [activate a website](pages.md) once for each website.

## Optional approval-gated deployment profile

Use this alternative only when policy requires explicit Cloudflare provider isolation. Initial D1
and R2 resource creation still requires a separately approved owner action. Configure a private
profile outside the repository, then follow this exact sequence:

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
pnpm deploy:verify -- --profile /private/path/vizoalica-profile.json --worker-url https://YOUR_WORKER.workers.dev --plan /private/path/plan.json
pnpm deploy:status -- --profile /private/path/vizoalica-profile.json --plan-id EXACT_PLAN_ID
```

The profile runner removes ambient Cloudflare credentials and never falls back to native login.
The OneCLI deployment connection is unrelated to the OneCLI administrator credential used for an
operator machine.

## Recovery and removal

- **Existing schema detected:** stop. Select a new empty D1 database. This release provides no
  preservation path for that data.
- **Wrong account or resource:** stop, correct the private configuration, and rerun preflight.
- **Interrupted apply:** inspect D1 migration state and Worker deployment history. Do not assume a
  local timeout means the remote action failed. For a profile deployment, create a new plan and
  receipt before retrying.
- **Unhealthy Worker:** use Cloudflare deployment history only when the selected Worker version is
  compatible with the fresh baseline. Never change D1 schema as an improvised recovery step.
- **Suspected signing-secret exposure:** pause collection, replace it on the Worker and every
  connected website, verify a new accepted event, then resume.
- **Suspected administrator-secret exposure:** replace it on the Worker and update every authorized
  operator path. Revoke affected OneCLI agents or remove affected direct local files.
- **Removal:** teardown is a separate destructive customer-owner decision. First revoke access and
  export anything the owner is required to retain; then obtain distinct approval for the exact
  Worker, D1 database, and R2 bucket. Backend automation never deletes them.

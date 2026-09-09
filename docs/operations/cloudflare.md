# Install Vizoalica on Cloudflare

Start here for a first installation of **Vizoalica 0.3.1**. Follow the numbered steps in order.
Commands run from the Vizoalica checkout unless a step says otherwise.

The simplest setup uses Cloudflare login to deploy, a free `workers.dev` address for ingestion,
and your existing website (or the included Pages example). You can then use **OneCLI's local
vault for the console**. These are independent choices: using the vault locally does not require
routing Pages deployments through it.

**What you will have:** one ingestion Worker, one D1 database, one R2 bucket, a hosted SDK and
server-side token endpoint, and a console that runs on your computer only when needed.
No custom domain, paid Workers plan, hosted dashboard, or always-on local process is required.

## Before starting

- Install Node.js 22+ and pnpm 9 (`corepack enable` enables pnpm with supported Node installations).
- Have access to a Cloudflare account. Activate R2 in its dashboard; Cloudflare may require billing
  setup even for included usage.
- Have a password manager to generate and retain **two different random secrets**, each at least
  32 characters: `VIZOALICA_TOKEN_SECRET` and `VIZOALICA_ADMIN_SECRET`.
- Allow roughly one setup session. Stop at the first failed checkpoint; use
  [troubleshooting](troubleshooting.md) instead of continuing with missing pieces.

| Credential                    | Purpose                    | Store it here                                                |
| ----------------------------- | -------------------------- | ------------------------------------------------------------ |
| Cloudflare login or API token | Deploy infrastructure      | Wrangler login, or optional OneCLI deployment connection     |
| `VIZOALICA_TOKEN_SECRET`      | Sign website ingest tokens | Worker **and** website Function, with exactly the same value |
| `VIZOALICA_ADMIN_SECRET`      | Read/manage analytics      | Worker **and** local OneCLI vault (or private client file)   |

Never put any of these secrets in HTML, browser JavaScript, a URL, Git, or an AI conversation.
Project IDs and source keys are public and safe to copy.

## 1. Get the software and sign in

```sh
git clone https://github.com/ehud-am/vizoalica.git
cd vizoalica
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm exec wrangler whoami
cp deploy/cloudflare/wrangler.example.toml deploy/cloudflare/wrangler.production.toml
```

Use your selected release checkout when upgrading. `wrangler.production.toml` is ignored by Git;
keep account configuration there. Do not overwrite an existing configured file during an upgrade.

**Check:** `whoami` shows your intended account. If you have several accounts, set its non-secret ID:

```sh
export CLOUDFLARE_ACCOUNT_ID="REPLACE_WITH_YOUR_ACCOUNT_ID"
```

This default path is Cloudflare-native. Run it in a normal terminal outside `onecli run`, with no
inherited proxy or deployment-profile selection. For an explicitly isolated deployment, use the
[optional OneCLI Worker flow](#optional-onecli-worker-deployment) instead.

## 2. Create or find storage

List first so you can reuse the correct existing resources:

```sh
pnpm exec wrangler d1 list
pnpm exec wrangler r2 bucket list
```

For a **new** installation, create only what is missing:

```sh
pnpm exec wrangler d1 create vizoalica-config
pnpm exec wrangler r2 bucket create vizoalica-events
```

Edit `deploy/cloudflare/wrangler.production.toml`:

| Field           | Value                                               |
| --------------- | --------------------------------------------------- |
| `name`          | Your chosen Worker name, such as `vizoalica-ingest` |
| `database_name` | Live D1 name, such as `vizoalica-config`            |
| `database_id`   | UUID of **that same live database**                 |
| `bucket_name`   | Live R2 name, such as `vizoalica-events`            |

Keep the binding names, migration directory and safe defaults from the template. Keep
`VIZOALICA_DEMO_MODE = "false"`. Resource names and IDs from another account or a previous demo
will not work. Recheck the list output against **both** the name and ID before running migrations;
the basic preflight does not substitute for this comparison.

**Check:** the file contains no `REPLACE_WITH_D1_DATABASE_ID`, and all resources belong to the
account selected in step 1.

## 3. Save both Worker secrets

Retrieve the two values from your password manager and paste each only into its hidden Wrangler prompt:

```sh
pnpm exec wrangler secret put VIZOALICA_TOKEN_SECRET --config deploy/cloudflare/wrangler.production.toml
pnpm exec wrangler secret put VIZOALICA_ADMIN_SECRET --config deploy/cloudflare/wrangler.production.toml
```

On the first run, Wrangler may offer to create the Worker name before storing the secret. Accept
for the Worker you chose. The application is deployed in the next step. Retain the signing value:
you will paste **that same value** into the Pages secret later, not generate another one.

**Check:** both names appear here; values are never displayed:

```sh
pnpm exec wrangler secret list --config deploy/cloudflare/wrangler.production.toml
```

## 4. Apply all migrations and deploy

Read the SQL files in [`deploy/cloudflare/migrations`](../../deploy/cloudflare/migrations).
This release needs **all four**, in order:

1. `0001_initial.sql` — projects, sources, quotas and rollups.
2. `0002_admin_mcp.sql` — administration support.
3. `0003_dashboard.sql` — dashboard support.
4. `0004_local_operations.sql` — local console and hourly analytics.

```sh
pnpm deploy:check
pnpm deploy:apply
pnpm exec wrangler d1 migrations list vizoalica-config --remote --config deploy/cloudflare/wrangler.production.toml
```

Replace `vizoalica-config` in commands if you chose a different database name. `deploy:apply`
checks the configuration, applies pending migrations, then deploys the Worker. Never manually
rerun an already-applied migration; let Wrangler track it. On future releases, apply every
migration through that release's latest file, not just the four listed here.

**Check:** no migrations remain pending. Copy the deployed Worker origin, without a trailing slash:

```sh
export VIZOALICA_WORKER_URL="https://YOUR_WORKER.YOUR_SUBDOMAIN.workers.dev"
pnpm deploy:verify
```

**Check:** Worker health passes. This proves health only; it does not prove website installation.

## 5. Create one project and website

Open the [local console setup](local-analytics.md), choose **Path A for a local OneCLI vault**,
and start both local processes. Create a project, then a website with its exact public origin
(for example, `https://YOUR_PAGES_PROJECT.pages.dev`). For the Pages example, create its project
in [Pages step 1](pages.md#1-prepare-the-pages-project) first so you know that origin.

The console supplies a project ID, website/source ID and public source key. Keep them distinct:

| Value             | Used for                                            |
| ----------------- | --------------------------------------------------- |
| Project ID        | `data-project` and `VIZOALICA_PROJECT_ID`           |
| Website/source ID | `VIZOALICA_SOURCE_ID` in the server token issuer    |
| Public source key | `data-source` in the browser snippet                |
| Website origin    | Source's allowed origin and `VIZOALICA_SITE_ORIGIN` |
| Worker origin     | `data-endpoint`, followed by `/v1/events:batch`     |

The default new source allows 100 events/day, 10 events/second and seven-day retention. This is
intentionally small for testing. An origin is a scheme plus host and optional port: no path,
trailing slash or wildcard. The allowed origin is the **website**, not the ingestion Worker.
If you prefer setup without a console, use the [manual SQL alternative](#manual-sql-alternative).

## 6. Connect your website

Follow the [complete Pages website recipe](pages.md). It includes the SDK build, a copyable
Function at `/vizoalica/ingest-token`, signing-secret setup, deploy commands and content checks.
For another website backend, use the [SDK reference](browser-sdk.md) and implement the same token
contract there. A static host alone cannot keep a signing secret.

**Check:** the SDK URL returns JavaScript and the token endpoint returns a scoped five-minute JWT.
The ingestion Worker serves neither `/vizoalica.js` nor `/vizoalica/ingest-token`.

## 7. Keep the test inexpensive

In Cloudflare's R2 dashboard, add a lifecycle rule expiring the `events/` prefix after **7 days**.
The D1 `retention_days` setting alone does not delete R2 objects. Keep the source quota low, check
Workers/D1/R2 usage and configure available billing/usage alerts. Disable the source in the
console if traffic is unexpected.

Static Pages requests that do not invoke Functions are free; token requests share Workers usage.
The included example limits Function invocation to the token route. R2 has included monthly usage,
then charges for excess storage/operations. A source quota bounds accepted events, **not all
incoming requests or your bill**. No free-tier setup is a guaranteed spending cap. See current
[Pages pricing](https://developers.cloudflare.com/pages/functions/pricing/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and
[R2 pricing](https://developers.cloudflare.com/r2/pricing/).

## 8. Prove a page view arrived

1. Run the content verification command in the Pages recipe.
2. Open the actual website origin, allow analytics, and inspect the browser Network panel.
3. Confirm the token request succeeds and the request to `/v1/events:batch` returns **202**.
4. Refresh the local console's `24h` view. One fresh consented page visit should add a page view;
   an isolated test should show one privacy-safe unique user. Prior visits affect totals.
5. Block the analytics Worker in the browser and reload. The website must remain usable.

Record the release, Worker URL/version, website origin, migration status, and observed counts.
Before a public launch, also exercise the signed/invalid-token, wrong-origin, malformed, oversized
and over-quota scenarios in [privacy operations](privacy.md). Rejected events must not create
accepted raw batches; another project must continue working.

## Manual SQL alternative

Use this **instead of** console creation, on a fresh test installation. Copy the following into a
private `seed.sql`, replace the origin with your real website origin, then run it once. Use distinct
IDs for additional sites. Never paste this over an existing site's configuration.

```sql
INSERT INTO quota_policies
  (id, max_request_bytes, max_events_per_batch, max_events_per_token,
   max_events_per_second, max_events_per_day, max_property_count,
   max_property_value_length, retention_days)
VALUES ('quota-test', 131072, 25, 25, 10, 100, 20, 256, 7);

INSERT INTO projects (id, name, mode, default_retention_days, quota_policy_id)
VALUES ('project-test-id', 'Test site', 'production', 7, 'quota-test');

INSERT INTO sources
  (id, project_id, name, public_source_key, allowed_origins_json, status, created_at, updated_at)
VALUES ('source-test-id', 'project-test-id', 'Test website', 'public-source-key',
  '["https://YOUR_PAGES_PROJECT.pages.dev"]', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
```

```sh
pnpm exec wrangler d1 execute vizoalica-config --remote --config deploy/cloudflare/wrangler.production.toml --file /absolute/path/to/seed.sql
```

**Check:** one source belongs to `project-test-id`, uses `public-source-key`, and allows only your
website origin. These columns match migration 0004, including its required name and timestamps.

## Optional OneCLI Worker deployment

Use this when your deployment policy requires vault-held Cloudflare credentials. It is separate
from the local console's generic administrator secret. Follow the
[profile → plan → check → apply → verify workflow](../../specs/005-onecli-cloudflare-credentials/quickstart.md).
It covers existing Worker/D1/R2 resources, not initial resource creation or Pages uploads.

For a Cloudflare API token, select these exact UI labels, scoped to the intended account:

| Operation                                                | Cloudflare permission                 |
| -------------------------------------------------------- | ------------------------------------- |
| Confirm account membership                               | `User → Memberships → Read`           |
| D1 lookup and migrations                                 | `Account → D1 → Edit`                 |
| R2 lookup                                                | `Account → Workers R2 Storage → Read` |
| Worker secrets and deployment                            | `Account → Workers Scripts → Edit`    |
| Pages project, secret and deployment (separate workflow) | `Account → Cloudflare Pages → Edit`   |
| Initial R2 bucket creation (separate workflow)           | `Account → Workers R2 Storage → Edit` |

Use the [Cloudflare permissions reference](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
for current labels. Account-scoped grants are not automatically restricted to one Worker or bucket;
use OneCLI policy to narrow permitted operations. Do not add DNS/zone permissions for `workers.dev`
or `pages.dev`; custom domains are optional separate work.

Vizoalica removes ambient Cloudflare credentials for OneCLI inspection and execution. Wrapped
Wrangler gets only `CLOUDFLARE_API_TOKEN=onecli-managed` so it can start; the gateway injects the
real credential. There is no automatic native fallback. Profile reads allow 60 seconds, bundle
checks 120 seconds, and migrations/deploys 300 seconds; OneCLI inspection allows 15 seconds.
Worker HTTP health verification has a separate 10-second request timeout.

If the self-hosted gateway advertises `gateway:10255` to host processes, see
[local gateway setup](local-analytics.md#self-hosted-gateway-on-macos-or-linux).
The profile runner currently has no gateway override field; fix the advertised host-accessible
address in OneCLI before using profiles, or explicitly choose the native deployment path.
For the reported Pages `8000013` upload failure, see [troubleshooting](troubleshooting.md):
this patch does not implement a proxy bypass or claim to fix OneCLI's upload-token replacement.

## Operating and rollback cards

### A source is abused

1. Set its `status` to `disabled` in D1.
2. Confirm new requests return a rejection and unrelated projects remain healthy.
3. Review only safe ingestion decisions and quota-window counts; do not log raw payloads.
4. Rotate the server token issuer credentials before re-enabling the source.

### A deployment is unhealthy

1. Select a prior known-good Worker version compatible with the current D1 schema using
   Cloudflare’s deployment history. Do not roll back schema blindly.
2. Do **not** delete D1 configuration, quota records, rollups, or R2 batches.
3. Verify `/healthz`, a signed request, and a rejected malformed request.
4. Record the incident, version, and rollback time.

### A secret may have leaked

1. Treat it as compromised; create a new secret in the approved secret manager.
2. Pause collection, replace the signing secret on both Worker and website, redeploy, verify
   a newly accepted event, then resume. For an administrator secret, update the Worker and local
   vault/client instead.
3. Invalidate outstanding short-lived tokens where possible.
4. Audit access to the secret manager and deployment account.

### Rotate, revoke, recover, or change providers

Rotate a token inside the same OneCLI Cloudflare connection, then generate a new plan and preflight
receipt. The Vizoalica profile does not change when the connection and account stay the same. To
revoke access, detach the connection from the deployment agent or revoke it in OneCLI; subsequent
checks and applies fail at the provider boundary.

For a compromised machine, revoke that machine's OneCLI identity, remove its private profile,
plans, receipts, results, and audit file, review OneCLI and Cloudflare audit evidence, and create a
new identity on a trusted machine. Do not transfer credential material between machines.

To migrate from native authentication, create a new OneCLI profile and run plan/check before any
apply. To roll back, create an explicit `cloudflare-native` profile and authenticate Wrangler
through Cloudflare's normal flow. Neither direction copies a token through Vizoalica. A failed or
interrupted apply lists completed and pending operations; inspect local status, generate a fresh
plan and receipt, and rely on Wrangler's idempotent migration tracking before retrying.

Deployment audit records are operator-only NDJSON beside the private profile and are pruned after
90 days by default. Back up Cloudflare data and configuration through your normal account controls;
the audit log is evidence, not a backup. Teardown remains a separate destructive procedure: revoke
deployment access first, export required data, and obtain distinct approval before removing Worker,
D1, or R2 resources.

# Deploy Vizoalica on Cloudflare

This is the self-hosted production deployment manual for the v0.1.0 ingestion Worker. Work
through it in order. Deployment is always an explicit operator action: Vizoalica releases, tags,
pushes, and merges never deploy to Cloudflare automatically.

## Before you begin

You need a Cloudflare account with permission to create Workers, D1 databases, R2 buckets, and
Workers secrets; Node.js 22+; pnpm 9; and Wrangler 4.x. Choose one authentication provider per
deployment profile: OneCLI 2.11+ (recommended for credential isolation) or Cloudflare-native.
Enable R2 for the account in the Cloudflare dashboard before running the bucket creation command;
the API rejects bucket creation until R2 has been activated for the account.
For the native flow, authenticate explicitly before creating resources:

```sh
pnpm exec wrangler login
pnpm exec wrangler whoami
```

```sh
pnpm install --frozen-lockfile
pnpm run validate
cp deploy/cloudflare/wrangler.example.toml deploy/cloudflare/wrangler.production.toml
```

Set the actual D1 database ID and any resource names in `wrangler.production.toml`. This file is
gitignored and belongs to the operator; do not commit account-specific configuration. Do not
deploy from an unreviewed or dirty checkout.

## OneCLI credential isolation

Create the Cloudflare connection in a OneCLI-controlled human interface. Never pass its token to a
Vizoalica command, repository file, AI prompt, or shared transcript. Attach the connection to one
dedicated local deployment agent, and use a separate identity and grant for CI. Then create the
non-secret profile and follow the
[OneCLI validation quickstart](../../specs/005-onecli-cloudflare-credentials/quickstart.md).

The minimum Cloudflare API-token permissions are:

| Planned operation                 | Minimum access                            | OneCLI tool policy                     |
| --------------------------------- | ----------------------------------------- | -------------------------------------- |
| Identity and account confirmation | Account membership read                   | Allow                                  |
| D1 lookup and migrations          | D1 read and edit on the target account    | Read: allow; migration: approval-gated |
| R2 bucket lookup                  | R2 read on the named bucket               | Allow                                  |
| Worker secret-name listing        | Workers Scripts read on the target Worker | Allow                                  |
| Worker dry-run and deploy         | Workers Scripts edit on the target Worker | Dry-run: allow; deploy: approval-gated |

Resource creation, deletion, secret-value access, unrelated accounts, and arbitrary Wrangler
arguments are outside this integration's operation catalog. Use a distinct reviewed procedure if
new infrastructure must be created or destroyed. Worker application secrets remain in Cloudflare;
the deployment integration checks required names but never reads their values.

OneCLI mode removes ambient Cloudflare tokens, keys, emails, auth paths, and account selection from
every inspected and wrapped process. If OneCLI is unavailable, detached, revoked, ambiguous, or
denied, deployment stops. It never falls back to Wrangler's cached or environment authentication.

### Keeping a test deployment free

Workers Free, D1 Free, and R2's included monthly usage are sufficient for a small test site, but
R2 is not a hard zero-cost product: it charges if its included storage or operation limits are
exceeded. Do not opt into a paid Workers plan for this test deployment. Before exposing the
source, configure a low daily quota and short R2 retention, monitor Cloudflare usage, and disable
the source immediately if the test receives unexpected traffic. The Worker rejects traffic beyond
the source quota before it writes to R2.

## Deployment map

```text
Browser SDK → Worker /v1/events:batch → D1 (configuration, quota windows, rollups)
                                   └→ R2 (immutable accepted raw batches)
```

The browser source key is a routing identifier, not a secret. Production requests require a
short-lived server-issued bearer token. Never place `VIZOALICA_TOKEN_SECRET` in a website,
browser bundle, or a Wrangler configuration file.

## 1. Create the storage containers

Choose unique names, then create the D1 database and R2 bucket:

```sh
pnpm exec wrangler d1 create vizoalica-config
pnpm exec wrangler r2 bucket create vizoalica-events
```

Copy the `database_id` returned by the first command into
`deploy/cloudflare/wrangler.production.toml`. If you use different names, update both `database_name` and
`bucket_name` too.

**You should see:** the configuration has no `REPLACE_WITH_D1_DATABASE_ID` value.

## 2. Configure safe defaults

Keep these production settings unless you have reviewed a change:

```toml
[vars]
VIZOALICA_DEMO_MODE = "false"
VIZOALICA_MAX_REQUEST_BYTES = "131072"
```

`VIZOALICA_DEMO_MODE` must remain `false` in production. It is the only mode that permits an
unsigned request, and accepted demo data is labelled lower trust. The byte ceiling is an outer
guard; project policies impose additional event and rate limits.

## 3. Apply the database schema

`pnpm run deploy:apply` applies migrations before deploying. First inspect the migration:

```sh
sed -n '1,240p' deploy/cloudflare/migrations/0001_initial.sql
```

**You should see:** when applying, Wrangler reports that `0001_initial.sql` was applied. The
schema creates projects, sources, quota policies, quota windows, ingestion decisions, and
dashboard rollups. It intentionally does not create a raw-events table: raw batches belong only
in R2.

## 4. Store the signing secret

Generate a high-entropy secret in your approved secret manager and enter it only at the prompt:

```sh
pnpm exec wrangler secret put VIZOALICA_TOKEN_SECRET --config deploy/cloudflare/wrangler.production.toml
```

**You should see:** Wrangler confirms the secret was uploaded. Do not echo the value, commit it,
or add it to `.env` files. Your token issuer must use the same secret until you perform a planned
key rotation.

## 5. Seed one project, source, and quota policy

Use D1’s dashboard or a controlled SQL session to create configuration before sending traffic.
Replace every example identifier and origin below; the allowed origin must be an exact browser
`Origin` value (scheme, host, and port). The following command runs the SQL in the authenticated
account; replace `vizoalica-config` if you selected another database name:

```sh
pnpm exec wrangler d1 execute vizoalica-config --remote --config deploy/cloudflare/wrangler.production.toml --command "YOUR_REVIEWED_SQL"
```

For a low-volume test site, use a unique identifier, an exact origin, and conservative limits such
as `100` events per day and `7` retention days. These settings bound accepted R2 writes; they do
not replace Cloudflare usage monitoring.

```sql
INSERT INTO quota_policies
  (id, max_request_bytes, max_events_per_batch, max_events_per_token,
   max_events_per_second, max_events_per_day, max_property_count,
   max_property_value_length, retention_days)
VALUES
  ('quota-test', 131072, 25, 25, 10, 100, 20, 256, 7);

INSERT INTO projects (id, name, mode, default_retention_days, quota_policy_id)
VALUES ('project-test-id', 'Test site', 'production', 7, 'quota-test');

INSERT INTO sources (id, project_id, public_source_key, allowed_origins_json, status)
VALUES ('source-test-id', 'project-test-id', 'public-source-key', '["https://test.gitlocal.dev"]', 'active');
```

**You should see:** exactly one active source pointing to the intended project. Never use `*` as
an allowed origin. Disable a source (`status = 'disabled'`) before rotating or retiring it.

## 6. Configure R2 retention and alerts

In the Cloudflare dashboard, add an R2 lifecycle rule for the `events/` prefix that expires
objects at the approved retention period. For the low-volume test configuration above, set it to
7 days. Then create alerts for Workers errors/CPU, R2 storage, and D1 storage. Set an owner and
response procedure for each alert.

**You should see:** R2 has an expiration rule and alert recipients are configured before launch.
R2 object keys contain only server-approved project/source/time partitions and an opaque ID;
dashboard rollups contain only bounded counts and page paths.

## 7. Deploy

Run the preflight, then explicitly apply the deployment:

```sh
pnpm run deploy:check
pnpm run deploy:apply
```

Record the Worker URL printed by Wrangler. The source configuration must allow the website's exact
browser origin, not the Worker URL. If the website later moves to another origin, add that new
website origin before directing browser traffic to it.

### Attach a custom Worker domain

The domain must be an active Cloudflare zone. Add a custom-domain route to the operator-owned
`wrangler.production.toml`, then rerun `pnpm run deploy:apply`:

```toml
routes = [
  { pattern = "analytics.test.gitlocal.dev", custom_domain = true }
]
```

Use a dedicated analytics subdomain rather than replacing the website at
`https://test.gitlocal.dev`. The website remains the allowed source origin; the Worker custom
domain is the SDK ingestion endpoint. Confirm the zone is managed by the same Cloudflare account
shown by `wrangler whoami` before deploying the route.

`deploy:check` verifies the production config, the intended authenticated account, the D1 and R2
resources, the required Worker secret, and a Wrangler dry-run. `deploy:apply` reruns this
preflight, applies D1 migrations, then deploys the Worker.

**You should see:** a versioned Worker deployment and its public URL. A failed preflight means do
not proceed to deployment.

## 8. Connect the website

Configure the SDK with the deployed URL, the public source key, and a same-origin endpoint that
fetches a short-lived ingest token from your server. See
[`browser-sdk.md`](./browser-sdk.md) for the HTML and JavaScript examples.

This website integration is unchanged by OneCLI. OneCLI is not installed in the website, browser,
or SDK, and the snippet never receives a Cloudflare deployment token or Worker administrator
secret.

The Worker handles CORS preflight for `POST /v1/events:batch` and accepts the SDK's
`authorization`, `content-type`, and `x-vizoalica-source` headers. CORS is not authorization:
every actual event request still has its browser origin checked against the configured source and
its bearer token checked against that source and project.

The ingestion Worker does not mint ingest tokens. A static website by itself cannot safely issue
them because it cannot keep `VIZOALICA_TOKEN_SECRET` private. Before connecting a static site,
deploy or configure a same-origin backend endpoint such as
`https://test.gitlocal.dev/vizoalica/ingest-token`. That endpoint must keep the signing secret in
its server-side secret store and create a short-lived token whose `project_id`, `source_id`, and
`origin` exactly match the D1 source configuration. Do not use unsigned demo mode in production.

**You should see:** page views are sent asynchronously. Stop the Worker or block its URL once:
the host page must remain usable and show no analytics error.

## 9. Verify production behavior

Verify the health endpoint, then run the feature scenarios:

```sh
VIZOALICA_WORKER_URL=https://your-worker.example pnpm run deploy:verify
```

Then verify all of the following in a non-production project first:

1. A valid signed page-view returns `202` and creates an R2 object.
2. An invalid, expired, wrong-origin, malformed, or oversized request is rejected with no R2
   object.
3. Over-quota traffic receives `429`, while another project continues to receive `202`.
4. `dashboard_rollups` increments only for the correct project/source/date/type/path.
5. R2 keys and metadata contain no visitor ID, session ID, token, raw URL query, or payload.

**You should see:** all five checks pass before opening production traffic. Record the date,
Worker version, test project, and result in the operator's deployment record.

## Minimal operator and MCP access

The Worker has a separate administrator credential for non-browser configuration and read-only MCP
queries. Generate and store it in your approved secret manager, then upload it without placing its
value in a file or website:

```sh
pnpm exec wrangler secret put VIZOALICA_ADMIN_SECRET --config deploy/cloudflare/wrangler.production.toml
```

Rotate this credential by replacing the secret and deploying the Worker. The old credential stops
working immediately. Never use it in a browser, website bundle, token issuer, or URL.

Authenticated HTTPS administration is available at `/v1/admin/projects` and its project-scoped
source routes. It creates system-generated project/source identifiers and public source keys,
requires exact `http` or `https` origins, and gives each new source a conservative limit of 10
events/second, 100 events/day, and seven-day raw retention. Sources can be disabled but are not
deleted by this minimal release.

The authenticated HTTPS `/mcp` endpoint is a stateless, read-only MCP surface. It exposes only
`list_projects_and_sources` and `get_page_view_counts`. The latter requires a project ID, a source
ID belonging to that project, and an inclusive date range of 31 days or less. Results contain only
aggregate page-view counts by date and path. The endpoint has no browser CORS, raw-event access,
write tools, or arbitrary query capability.

The machine that runs the local analytics and administration console is configured separately.
Follow [Local analytics operations](./local-analytics.md) and choose either its OneCLI gateway path
or its direct private-file path. That client-side choice does not change this Worker deployment or
the website snippet.

## Operating and rollback cards

### A source is abused

1. Set its `status` to `disabled` in D1.
2. Confirm new requests return a rejection and unrelated projects remain healthy.
3. Review only safe ingestion decisions and quota-window counts; do not log raw payloads.
4. Rotate the server token issuer credentials before re-enabling the source.

### A deployment is unhealthy

1. Deploy the prior known-good Worker version using Wrangler’s deployment history.
2. Do **not** delete D1 configuration, quota records, rollups, or R2 batches.
3. Verify `/healthz`, a signed request, and a rejected malformed request.
4. Record the incident, version, and rollback time.

### A secret may have leaked

1. Treat it as compromised; create a new secret in the approved secret manager.
2. Upload it with `wrangler secret put`, deploy, and update the token issuer atomically.
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

## Release checklist

- [ ] `pnpm run validate` is green.
- [ ] `pnpm run deploy:check` is green for the intended account.
- [ ] Wrangler is authenticated to the intended account.
- [ ] D1 ID and R2 bucket are correct.
- [ ] Migration applied and project/source/quota policy seeded.
- [ ] `VIZOALICA_TOKEN_SECRET` stored as a Worker secret.
- [ ] Demo mode is disabled.
- [ ] R2 lifecycle rule and operational alerts are enabled.
- [ ] Signed, rejected, quota, privacy, and rollback checks were recorded.

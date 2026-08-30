# Deploy Vizoalica on Cloudflare

This is the production deployment manual for the v0.1.0 ingestion Worker. Work through it in
order. Each step has a **you should see** check; stop and fix that check before continuing.

## Before you begin

You need a Cloudflare account with permission to create Workers, D1 databases, R2 buckets, and
Workers secrets; Node.js 20+; pnpm 9; and Wrangler authenticated for the target account.

```sh
pnpm install --frozen-lockfile
pnpm run validate
pnpm exec wrangler whoami
```

**You should see:** all tests pass and `whoami` prints the intended Cloudflare account. Do not
deploy from an unreviewed or dirty checkout.

## Deployment map

```text
Browser SDK → Worker /v1/events:batch → D1 (configuration, quota windows, rollups)
                                   └→ R2 (immutable accepted raw batches)
```

The browser source key is a routing identifier, not a secret. Production requests require a
short-lived server-issued bearer token. Never place `VIZOALICA_TOKEN_SECRET` in a website,
browser bundle, or `wrangler.toml`.

## 1. Create the storage containers

Choose unique names, then create the D1 database and R2 bucket:

```sh
pnpm exec wrangler d1 create vizoalica-config
pnpm exec wrangler r2 bucket create vizoalica-events
```

Copy the `database_id` returned by the first command into
`deploy/cloudflare/wrangler.toml`. If you use different names, update both `database_name` and
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

First inspect the migration, then apply it to the selected account:

```sh
sed -n '1,240p' deploy/cloudflare/migrations/0001_initial.sql
pnpm exec wrangler d1 migrations apply vizoalica-config --remote --config deploy/cloudflare/wrangler.toml
```

**You should see:** Wrangler reports that `0001_initial.sql` was applied. The schema creates
projects, sources, quota policies, quota windows, ingestion decisions, and dashboard rollups.
It intentionally does not create a raw-events table: raw batches belong only in R2.

## 4. Store the signing secret

Generate a high-entropy secret in your approved secret manager and enter it only at the prompt:

```sh
pnpm exec wrangler secret put VIZOALICA_TOKEN_SECRET --config deploy/cloudflare/wrangler.toml
```

**You should see:** Wrangler confirms the secret was uploaded. Do not echo the value, commit it,
or add it to `.env` files. Your token issuer must use the same secret until you perform a planned
key rotation.

## 5. Seed one project, source, and quota policy

Use D1’s dashboard or a controlled SQL session to create configuration before sending traffic.
Replace every example identifier and origin below; the allowed origin must be an exact browser
`Origin` value (scheme, host, and port).

```sql
INSERT INTO quota_policies
  (id, max_request_bytes, max_events_per_batch, max_events_per_token,
   max_events_per_second, max_events_per_day, max_property_count,
   max_property_value_length, retention_days)
VALUES
  ('quota-prod', 131072, 25, 25, 100, 100000, 20, 256, 90);

INSERT INTO projects (id, name, mode, default_retention_days, quota_policy_id)
VALUES ('project-prod', 'Production site', 'production', 90, 'quota-prod');

INSERT INTO sources (id, project_id, public_source_key, allowed_origins_json, status)
VALUES ('source-web', 'project-prod', 'public-source-key', '["https://www.example.com"]', 'active');
```

**You should see:** exactly one active source pointing to the intended project. Never use `*` as
an allowed origin. Disable a source (`status = 'disabled'`) before rotating or retiring it.

## 6. Configure R2 retention and alerts

In the Cloudflare dashboard, add an R2 lifecycle rule for the `events/` prefix that expires
objects at the approved retention period. Then create alerts for Workers errors/CPU, R2 storage,
and D1 storage. Set an owner and response procedure for each alert.

**You should see:** R2 has an expiration rule and alert recipients are configured before launch.
R2 object keys contain only server-approved project/source/time partitions and an opaque ID;
dashboard rollups contain only bounded counts and page paths.

## 7. Deploy

Perform a dry run first, then deploy:

```sh
pnpm exec wrangler deploy --dry-run --config deploy/cloudflare/wrangler.toml
pnpm worker:deploy
```

Record the Worker URL printed by Wrangler. If you later attach a custom domain, add that exact
origin to the source configuration before directing browser traffic to it.

**You should see:** a versioned Worker deployment and its public URL. A failed dry run means do
not proceed to deployment.

## 8. Connect the website

Configure the SDK with the deployed URL, the public source key, and a same-origin endpoint that
fetches a short-lived ingest token from your server. See
[`browser-sdk.md`](./browser-sdk.md) for the HTML and JavaScript examples.

**You should see:** page views are sent asynchronously. Stop the Worker or block its URL once:
the host page must remain usable and show no analytics error.

## 9. Verify production behavior

Run the repository validation and the feature scenarios:

```sh
scripts/validate-cloudflare-quickstart.sh
```

Then verify all of the following in a non-production project first:

1. A valid signed page-view returns `202` and creates an R2 object.
2. An invalid, expired, wrong-origin, malformed, or oversized request is rejected with no R2
   object.
3. Over-quota traffic receives `429`, while another project continues to receive `202`.
4. `dashboard_rollups` increments only for the correct project/source/date/type/path.
5. R2 keys and metadata contain no visitor ID, session ID, token, raw URL query, or payload.

**You should see:** all five checks pass before opening production traffic. Record the date,
Worker version, test project, and result in the release record.

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

## Release checklist

- [ ] `pnpm run validate` is green.
- [ ] Wrangler is authenticated to the intended account.
- [ ] D1 ID and R2 bucket are correct.
- [ ] Migration applied and project/source/quota policy seeded.
- [ ] `VIZOALICA_TOKEN_SECRET` stored as a Worker secret.
- [ ] Demo mode is disabled.
- [ ] R2 lifecycle rule and operational alerts are enabled.
- [ ] Signed, rejected, quota, privacy, and rollback checks were recorded.

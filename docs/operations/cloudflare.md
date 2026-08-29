# Cloudflare deployment

Vizoalica v0.1.0 runs as a Cloudflare Worker. D1 stores project, source, and quota
configuration; R2 stores accepted immutable event batches.

## Provisioning

1. Create a D1 database and an R2 bucket, then replace `database_id` in
   `deploy/cloudflare/wrangler.toml`.
2. Apply the migration with `pnpm exec wrangler d1 migrations apply vizoalica-config --remote --config deploy/cloudflare/wrangler.toml`.
3. Set the HMAC secret with `pnpm exec wrangler secret put VIZOALICA_TOKEN_SECRET --config deploy/cloudflare/wrangler.toml`.
4. Deploy with `pnpm worker:deploy`.

Use a custom domain only after verifying that its origin policy matches configured sources.

## Retention and cost controls

Configure an R2 lifecycle rule to expire `events/` objects at each project’s approved
retention period. D1 must retain only configuration and bounded decision records, never raw
events. Set Workers request and CPU alerts, R2 storage alerts, and D1 storage alerts before
accepting production traffic.

## Rollback

Deploy the prior Worker version with Wrangler. Do not delete R2 event batches or D1
configuration during rollback. Review migrations before applying schema changes.

## Limits

An accepted response means the batch was successfully written to R2. The Worker validates
payload size, schema, origin, token, and quota before persistent writes. Browser-visible source
keys are routing identifiers, not secrets.

#!/usr/bin/env sh
set -eu

if [ "${1:-}" = "--" ]; then
  shift
fi

if [ -n "${VIZOALICA_DEPLOY_PROFILE:-}" ]; then
  exec node --import tsx apps/deploy-cli/src/index.ts check --profile "$VIZOALICA_DEPLOY_PROFILE" "$@"
fi
if [ "${1:-}" = "--profile" ]; then
  exec node --import tsx apps/deploy-cli/src/index.ts check "$@"
fi

config_path="${VIZOALICA_DEPLOY_CONFIG:-deploy/cloudflare/wrangler.production.toml}"

fail() {
  echo "deploy preflight failed: $*" >&2
  exit 1
}

value_for() {
  key="$1"
  sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$config_path" | head -n 1
}

[ -f "$config_path" ] || fail "missing $config_path; copy deploy/cloudflare/wrangler.example.toml and configure it"

database_id="$(value_for database_id)"
database_name="$(value_for database_name)"
bucket_name="$(value_for bucket_name)"
demo_mode="$(value_for VIZOALICA_DEMO_MODE)"

[ -n "$database_id" ] && [ "$database_id" != "REPLACE_WITH_D1_DATABASE_ID" ] || fail "configure d1 database_id"
[ -n "$database_name" ] || fail "configure d1 database_name"
[ -n "$bucket_name" ] || fail "configure r2 bucket_name"
[ "$demo_mode" = "false" ] || fail "VIZOALICA_DEMO_MODE must be false"

pnpm exec wrangler whoami
pnpm exec wrangler d1 info "$database_name" --config "$config_path" >/dev/null
pnpm exec wrangler r2 bucket info "$bucket_name" --config "$config_path" >/dev/null
pnpm run deploy:fresh-check -- "$database_name" "$config_path"

for secret_name in VIZOALICA_TOKEN_SECRET VIZOALICA_ADMIN_SECRET VIZOALICA_ANALYTICS_DIGEST_SECRET; do
  if ! pnpm exec wrangler secret list --config "$config_path" --format json | grep -q "\"$secret_name\""; then
    fail "Worker secret $secret_name is not configured"
  fi
done

pnpm exec wrangler deploy --dry-run --config "$config_path"
echo "deploy preflight passed for $config_path"

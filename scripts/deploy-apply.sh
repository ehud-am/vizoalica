#!/usr/bin/env sh
set -eu

config_path="${VIZOALICA_DEPLOY_CONFIG:-deploy/cloudflare/wrangler.production.toml}"
database_name="$(sed -n 's/^[[:space:]]*database_name[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$config_path" | head -n 1)"

[ -n "$database_name" ] || {
  echo "deploy failed: configure database_name in $config_path" >&2
  exit 1
}

pnpm run deploy:check
pnpm exec wrangler d1 migrations apply "$database_name" --remote --config "$config_path"
pnpm exec wrangler deploy --config "$config_path"

echo "Deployment completed. Run: VIZOALICA_WORKER_URL=https://your-worker.example pnpm run deploy:verify"

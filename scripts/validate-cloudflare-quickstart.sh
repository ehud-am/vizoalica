#!/usr/bin/env sh
set -eu
pnpm typecheck
pnpm test
pnpm exec wrangler deploy --dry-run --config deploy/cloudflare/wrangler.toml

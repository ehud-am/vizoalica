#!/usr/bin/env sh
set -eu
pnpm typecheck
pnpm test
pnpm run deploy:check

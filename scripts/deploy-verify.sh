#!/usr/bin/env sh
set -eu

if [ "${1:-}" = "--" ]; then
  shift
fi

if [ -n "${VIZOALICA_DEPLOY_PROFILE:-}" ]; then
  exec node --import tsx apps/deploy-cli/src/index.ts verify --profile "$VIZOALICA_DEPLOY_PROFILE" "$@"
fi
if [ "${1:-}" = "--profile" ]; then
  exec node --import tsx apps/deploy-cli/src/index.ts verify "$@"
fi

worker_url="${VIZOALICA_WORKER_URL:-}"

[ -n "$worker_url" ] || {
  echo "deploy verification failed: set VIZOALICA_WORKER_URL to the deployed Worker URL" >&2
  exit 1
}

case "$worker_url" in
  https://*) ;;
  *)
    echo "deploy verification failed: VIZOALICA_WORKER_URL must begin with https://" >&2
    exit 1
    ;;
esac

health_url="${worker_url%/}/healthz"
response="$(curl --fail --silent --show-error "$health_url")"
printf '%s' "$response" | grep -q '"ok":true' || {
  echo "deploy verification failed: health endpoint did not return ok" >&2
  exit 1
}

echo "deployment verification passed: $health_url"

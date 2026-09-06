# Local Analytics Operations

Vizoalica's analytics and website-management console runs only when an operator needs it. The
browser talks to a loopback API; that API is the only local component allowed to hold the remote
administrator credential or call the Worker. The browser never receives that credential, signing
keys, issued ingest tokens, visitor digests, raw events, or raw URL queries.

## Local setup

Requirements are Node.js 22 and pnpm 9. Apply all D1 migrations through
`0004_local_operations.sql`, then create an operator-owned configuration outside the repository:

```bash
mkdir -p "$HOME/.config/vizoalica"
chmod 700 "$HOME/.config/vizoalica"
pnpm --filter @vizoalica/local-ops-api dev -- configure \
  "$HOME/.config/vizoalica/local-operations.json" \
  "https://your-worker.example" \
  "your-administrator-credential"
```

The command writes the file atomically with mode `0600`. Never copy it into the repository, a
browser configuration file, a support message, or a shared analytics link. For environment-based
development, copy `apps/local-ops-api/.env.example` outside the repository and preserve the same
permissions.

Start the Worker, loopback API, and console in separate terminals:

```bash
pnpm worker:dev
pnpm local-ops-api:dev -- serve "$HOME/.config/vizoalica/local-operations.json"
pnpm admin-web:dev
```

Both local services bind to `127.0.0.1`. The development console proxies `/api` to the local API;
it never calls the Worker directly. The API accepts only its exact configured loopback origin and
a short-lived HttpOnly, SameSite session cookie.

## Website and analytics behavior

- Website creation accepts a display name and one to ten exact HTTP(S) origins.
- The generated source key is public. A customer website remains responsible for issuing
  short-lived ingest tokens from its own backend.
- Disable is reversible. Delete is a terminal soft deletion that stops collection while retaining
  historic aggregates and administrative audit evidence.
- Analytics supports only rolling `24h`, `7d`, and `30d` windows. Queries read indexed hourly D1
  aggregates; they never fall back to scanning raw R2 batches.
- Unique-user presence uses a keyed, non-reversible digest. Only aggregate counts leave D1.
- Processing, unavailable, denied, and interrupted outcomes are explicit. An unavailable response
  never presents cached totals as current; an interrupted maintenance operation advises a safe
  status check or retry.

## Credential lifecycle

Rotate access by rerunning `configure` with the replacement credential. Revoke local access with:

```bash
pnpm --filter @vizoalica/local-ops-api dev -- revoke \
  "$HOME/.config/vizoalica/local-operations.json"
```

The Worker remains the authority: a remotely revoked credential invalidates the current local
browser session on its next request. Reauthorize by writing a valid replacement credential and
restarting the local API. Losing the machine requires revoking the corresponding credential at the
Worker boundary.

## Operations, cost, and recovery

The console and loopback API cost nothing while stopped. The production data plane adds no service
beyond the existing Worker, D1, and R2 resources. Storage growth is bounded to hourly page-view
counters, hourly opaque visitor-presence rows, configuration, and audit records; normal analytics
does not read R2.

D1 configuration, aggregate, and audit tables should be included in the operator's normal D1
backup/export schedule. R2 raw batches follow the configured retention and lifecycle policy.
Recovery consists of restoring D1, verifying project/source isolation, and retaining R2 objects
whose retention has not elapsed. Configuration and aggregates use ordinary SQLite-compatible
tables and JSON/CSV-capable exports, providing a migration path to another backend adapter without
changing browser instrumentation or accepted event history.

To tear down local operation, stop both local processes and remove the operator-owned configuration
file. This does not remove remote data. Remote teardown follows the Cloudflare operations guide and
must export required data before deleting D1, R2, or the Worker.

## Deferred MCP adapter boundary

The AI-tool client is deliberately deferred. Its future adapter may expose project listing,
website lifecycle, safe snippets, status, fixed-window analytics, and approved maintenance actions,
but it **must call this loopback API**. It must not call the Worker, D1, R2, or Cloudflare APIs
directly, own another administrator credential, or reproduce authorization and business rules.
Compatibility tests must prove that web and MCP clients receive the same project scope,
authorization result, completeness state, and audited mutation outcome.

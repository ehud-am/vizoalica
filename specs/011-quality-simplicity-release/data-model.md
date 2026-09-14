# Phase 1 Data Model: Deployment CI/CD

No new persisted storage (D1/R2) is introduced by Phase 1. The entities below are either
transient (exist only inside a GitHub Actions run) or already-existing records whose shape gains
one new field.

## Deployment Configuration Values (transient, per customer repo)

Exists only as GitHub Actions repository variables/secrets in the customer's repo and as an
ephemeral `wrangler.toml` inside a single CI job run (see research.md, Unknown 1). Never
persisted by vizoalica itself.

| Field | Kind | Source | Notes |
|---|---|---|---|
| `VIZOALICA_SDK_SRC` | var | GH Actions variable | SDK script URL |
| `VIZOALICA_INGEST_ENDPOINT` | var | GH Actions variable | Worker ingest URL |
| `VIZOALICA_PUBLIC_SOURCE_KEY` | var | GH Actions variable | matches existing `validIdentity` format in `config.json.ts` |
| `VIZOALICA_PROJECT_ID` | var | GH Actions variable | matches existing `validIdentity` format |
| `VIZOALICA_TOKEN_URL` | var | GH Actions variable | same-origin URL, validated by `config.json.ts` |
| `VIZOALICA_CONSENT` | var | GH Actions variable | one of `analytics-granted`/`analytics-denied`/`unknown` |
| `VIZOALICA_SOURCE_ID` | var | GH Actions variable | consumed by `ingest-token.ts` |
| `VIZOALICA_SITE_ORIGINS` | var | GH Actions variable | comma-separated list, each `https://` origin, per `ingest-token.ts` — supports serving the same site from more than one hostname (e.g. apex + `www`) |
| `CF_ACCOUNT_ID` | var or secret | GH Actions | Cloudflare account, workflow input |
| `CF_PAGES_PROJECT` | var | GH Actions | Cloudflare Pages project name |
| `CF_API_TOKEN` | secret | GH Actions secret | Pages:Edit scope only (research.md, Unknown 3) |
| `VIZOALICA_TOKEN_SECRET` | secret | GH Actions secret | set via `wrangler pages secret put`, ≥32 chars per `ingest-token.ts` |

Validation for all of these already exists server-side in the two Pages Functions
(`examples/cloudflare-pages/functions/vizoalica/config.json.ts`,
`.../ingest-token.ts`) — Phase 1 does not change that validation, only how the values reach the
Cloudflare Pages environment.

## Website Deployment Status (new field on an existing console-facing concept)

The admin console's per-website record gains a derived, non-persisted status computed on read
(per research.md, Unknown 4) rather than a new stored column:

| Field | Type | Computed from |
|---|---|---|
| `configEndpointReachable` | boolean | live GET to the website's `/vizoalica/config.json` |
| `configEndpointCheckedAt` | ISO timestamp | time of the check |
| `configEndpointError` | string \| null | short reason when unreachable/misconfigured (e.g. `configuration_unavailable`, network error) |

This is surfaced by `apps/admin-web/src/pages/WebsitesPage.tsx` and computed by a small addition
to `apps/local-ops-api` (a proxied check, since the browser console may not be able to reach an
arbitrary customer origin directly due to CORS — the local ops API performs the fetch server-side
and returns the result, consistent with the existing pattern of `apps/local-ops-api` brokering
outbound calls on the operator's behalf).

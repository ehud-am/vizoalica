# Security and privacy review: dashboard visual refresh

Scope: everything added or changed by `specs/007-dashboard-visual-refresh` (migration `0005`, the
analytics overview endpoint and its Worker/local-proxy/client layers, the time range selector, the
local theme preference store, and the brand/footer assets). Findings are graded **pass** (verified,
no action needed), **finding** (a real gap, with a recommendation), or **not verified** (out of
reach in this environment, flagged rather than assumed).

## Raw metadata leakage

**Pass, verified end-to-end.** `apps/ingest-worker/tests/dashboard-metadata-privacy.test.ts` drives
the real `worker.fetch()` entrypoint with a spoofed `CF-IPCountry`, a fingerprinted User-Agent, and
forwarded-IP-style headers (`X-Forwarded-For`, `CF-Connecting-IP`), and asserts none of those raw
values reach D1 dimension binds, the R2-written payload, or the response body. A companion test
proves `classifyRequest` ignores forwarded-IP headers entirely (country comes only from the
trusted `request.cf` object) and only ever emits taxonomy-whitelisted values - never an echoed raw
header. Classification happens once, at the Worker boundary, from trusted signals only; the
`RequestAnalyticsContext` it produces is passed as a separate argument through the ingestion
pipeline and never attached to the `StoredEvent`/`CloudEvent` that reaches R2 or the ingestion
decision log (`apps/ingest-api/src/ingestion/pipeline.ts`).

Unique-visitor presence uses an HMAC digest (`hmacDigest` in `d1-repositories.ts`) computed
server-side from the digest secret plus project/source/visitor identifiers - the raw
`anonymous_id` never reaches D1 on its own; only the digest does.

## Project/source isolation

**Pass.** `dashboard-admin.contract.test.ts` proves: an unauthenticated request to the overview
endpoint is rejected before the repository is ever called; a project the repository has no data
for returns `404`, not another project's data; the endpoint accepts an optional `source_id` scoped
to the given project (there is no cross-project source lookup path in `getAnalyticsOverview` - it
takes `projectId` and `sourceId` as separate parameters and the D1 query always includes
`project_id = ?`). `dashboard-analytics.integration.test.ts` separately proves a deleted source is
excluded from a scoped query rather than silently returning its data.

## Preference/credential separation

**Pass.** `preferences.ts`'s schema is allowlisted to exactly `{theme, updatedAt}` - both
`readPreferences` and the write path reject any other field, so the preferences file cannot
structurally carry a credential even if something tried to write one into it
(`preferences.test.ts` proves this directly, including with a literal `adminSecret` field in the
input). It is a separate file from the operator's `local-operations.json` credential file
(`resolvePreferencesPath` places it beside, not inside, that file), enforces the same `0600`
permission and symlink-refusal discipline as the credential file, and is written with the same
atomic-rename pattern. The `GET`/`PUT /api/preferences/theme` routes go through the exact same
same-origin + session gate as every other local-ops-api route - there is no separate, weaker path
for preferences.

## Dependency licenses and advisories

**Pass**, run for this report:

- `pnpm audit --audit-level=moderate`: **no known vulnerabilities found** across the whole
  workspace, including the two dependencies this feature newly added (`tailwindcss`, `recharts`,
  plus `@tailwindcss/vite`).
- `license-checker --summary --excludePrivatePackages`: 28 MIT, 7 Apache-2.0, 1 BSD-2-Clause, 1
  BSD-3-Clause, 1 dual MIT/Apache-2.0. No copyleft (GPL/AGPL/LGPL/MPL) or unknown-license
  dependency anywhere in the tree. (The tool's raw output also lists this project's own root
  package as "UNLICENSED" - that is this private, unpublished package having no `license` field
  itself, not a third-party dependency finding.)

## CSP (Content-Security-Policy)

- **Pass, pre-existing.** `apps/local-ops-api/src/server.ts`'s `send()` sets
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` on every response,
  appropriate for a pure loopback JSON API that serves no HTML.
- **Finding, fixed - and self-corrected mid-review.** `admin-web` (the console's actual
  browser-facing SPA) shipped with no CSP at all. The first fix attempted here added a Cloudflare
  Pages `_headers` file - wrong: per `docs/operations/local-analytics.md`, this console is *always*
  run locally via `pnpm admin-web:dev` (Vite's dev server); it is never deployed to Cloudflare
  Pages or any other static host that reads a `_headers` file, so that file would have been
  silently inert. Removed it and added a `<meta http-equiv="Content-Security-Policy">` tag to
  `apps/admin-web/index.html` instead - a mechanism the browser enforces regardless of how the HTML
  is served, matching the console's actual deployment model: `default-src 'self'; script-src
  'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src
  'self' ws://127.0.0.1:5173 ws://localhost:5173; base-uri 'none'; form-action 'self'`, plus a
  `referrer` meta tag for `strict-origin-when-cross-origin`. `style-src` needs `'unsafe-inline'`
  because React's `style={{...}}` props (used by this feature's charts, via Recharts'
  `ResponsiveContainer`) render as inline `style` attributes, which CSP's `style-src` governs the
  same as `<style>` elements; `connect-src` includes both loopback hostnames' `ws:` origins because
  Vite's HMR client needs its WebSocket connection, and this console's dev server *is* its
  deployment, not just a build step. Verified live against the running dev server this session:
  page loads and renders identically, zero `Refused to ...` CSP-violation console messages, and
  Vite's HMR still connects and hot-updates. Also covered by a new
  `ui-accessibility.test.tsx` case asserting the meta tag's presence and content.
  **Known, accepted limitation**: `X-Content-Type-Options` and `X-Frame-Options` cannot be set via
  a `<meta>` tag at all (browsers only honor those as real response headers), and this console has
  no server layer of its own to add them - only the existing loopback-binding requirement
  (`docs/operations/local-analytics.md`: "Do not expose the loopback API or development web server
  to the network") mitigates the clickjacking/MIME-sniffing risk those headers would otherwise
  address, by requiring local code execution to reach the console at all. This is a real,
  documented residual gap, not silently accepted.

## Negative-test coverage

Representative sample from this feature's own test files (all passing, all cited by file/case name
so they can be re-run directly rather than taken on faith):

- Invalid/malformed/missing/reversed/future/over-30-day time ranges: rejected with a field-level
  `{error, field, message}` at both the Worker (`dashboard-range.contract.test.ts`) and local proxy
  (`analytics-range.contract.test.ts`) boundaries, and by the client-side mirror before a request
  is even issued (`time-range-selector.test.tsx`'s "rejects a reversed custom range" case).
- Unauthenticated/cross-origin/expired-session requests to every new route (analytics overview,
  preferences): rejected before touching a repository or the filesystem
  (`dashboard-admin.contract.test.ts`, `preferences.contract.test.ts`).
- A corrupt, wrong-permission, symlinked, or wrong-schema preferences file: rejected or degraded to
  "no preference" rather than crashing the console or exposing partial/garbage data
  (`preferences.test.ts`).
- A batch failure mid-write (`recordDashboardRollups`, `deleteExpiredDashboardData`): propagates
  rather than silently reporting success (`dashboard-rollups.integration.test.ts`,
  `dashboard-retention.test.ts`).
- Storage unavailable for theme persistence: the console keeps the session's chosen theme and
  surfaces a save-failure notice rather than losing the choice or crashing (`theme.test.tsx`).

## Summary

One residual, accepted gap: `X-Content-Type-Options`/`X-Frame-Options` cannot be delivered by a
console with no server of its own and only a `<meta>`-tag CSP, mitigated by (not eliminated by) the
existing loopback-only binding requirement. Everything else in scope is a **pass** backed by a
named, currently-passing automated test or a command run for this report - including the CSP
finding itself, which was fixed twice: once incorrectly (a Pages `_headers` file that would never
have been read, given how this console is actually deployed), caught by re-checking the
deployment docs rather than assuming, and then fixed correctly with a verified, tested meta tag.

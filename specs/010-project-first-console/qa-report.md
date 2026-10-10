# QA Report: Project-First Console and Website Setup

**Date**: 2026-09-13  
**Branch**: `codex/project-first-console`  
**Runtime**: Node.js 22.23.2, pnpm 9.15.4, Wrangler 4.127.1

## Result

The implementation is ready for review. All automated release gates pass, line and branch coverage
remain above the required 90% thresholds, and the local Cloudflare exercise completed without
deploying or changing a Cloudflare account. A production deployment was intentionally not performed;
the quickstart reserves that step for a separately approved supervised release.

## Quickstart evidence

| Scenario | Evidence | Result |
| --- | --- | --- |
| Projects as a primary destination | Component and Chromium tests cover primary navigation, duplicate names with distinct IDs, explicit selection, direct destinations, stale selection reconciliation, and project-scoped loading. | Pass |
| Project-first website creation | Tests cover the first empty required Project control, non-current project creation, named confirmation, zero-project recovery, immutable edit ownership, stale-project failure, and retained safe drafts. | Pass |
| Static installation | Contract tests compare the returned static snippet with the legacy output and verify safe escaping. | Pass |
| Dynamic installation | API, UI, SDK, bundle, Function, verification-script, and documentation tests cover the generic loader, all six public fields, two-mode selection, malformed/stale/mismatched/unreachable configuration, and single initialization. | Pass |
| Cloudflare example | `wrangler pages functions build` compiled the Functions. A local `wrangler pages dev` session returned HTTP 200 from `/vizoalica/config.json` with the v1 six-field payload, `Cache-Control: no-store`, and `X-Content-Type-Options: nosniff`. `_routes.json` includes both config and token routes. | Pass |
| Footer and Local workspace | Unit and Chromium tests cover ready/loading/denied/offline rendering, exact links, current year, version fallback, keyboard disclosure, 320–1440 px layouts, 200% text, centered placement, and non-overlap. | Pass |

## Security, privacy, and accessibility

- Installation responses and browser assets contain public configuration only. Token-secret values
  remain in the website-owned token issuer boundary and are not emitted in snippets, config, commands,
  logs, or generated bundles.
- Dynamic configuration is fetched without cache reuse, requires HTTP(S) URLs and a same-origin token
  URL, validates version and project/source identity, and fails closed without disrupting the host page.
- Website creation stays authenticated and nested under the explicitly chosen project; invalid or
  stale project IDs fail atomically.
- The browser suite reported no serious or critical axe violations on Projects, Overview, or Websites.
- `pnpm audit --prod --audit-level high` reported no known vulnerabilities.

## Release gates

| Command | Result |
| --- | --- |
| `pnpm format:check` | Pass |
| `pnpm lint` | Pass |
| `pnpm typecheck` | Pass |
| `pnpm test` | Pass: 93 files, 445 tests |
| `pnpm coverage` | Pass: 95.83% lines, 90.07% branches, 94.01% statements, 93.73% functions |
| `pnpm build` | Pass |
| `pnpm browser-sdk:build` | Pass; SDK and generic loader built and Pages loader synchronized |
| `pnpm test:e2e` | Pass: 11 Chromium tests |
| `pnpm audit --prod --audit-level high` | Pass: no known vulnerabilities |
| `git diff --check` | Pass |

## Cloudflare boundary

The validation used only local compilation and emulation. It did not run `wrangler pages deploy`,
write production variables or secrets, or send an analytics event to a real project. Before a real
release, an operator must review the account, project, environment, branch, directories, public vars,
and diff, then explicitly approve the deployment described in the quickstart.

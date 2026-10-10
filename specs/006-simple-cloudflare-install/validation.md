# Patch 0.3.1 validation

Date: 2026-09-09. Working checkout: main, with the demo agent's pre-existing changes preserved
and completed. No tag, push, release publication or remote infrastructure mutation performed.

## Automated results

| Check                                         | Result                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| Workspace type checking                       | PASS; `pnpm typecheck` also checks the Pages Function and website verifier              |
| Full test suite with coverage                 | PASS; 59 files, 190 tests                                                               |
| Coverage                                      | PASS; 96.35% lines, 90.59% branches; no threshold reduced                               |
| Pages token Function coverage                 | 100% lines and branches                                                                 |
| Lint                                          | PASS                                                                                    |
| Formatting                                    | PASS                                                                                    |
| All workspace production builds               | PASS                                                                                    |
| Standalone SDK                                | PASS; esbuild IIFE runs in JSDOM, reads attributes, fetches token and sends a page view |
| Pages Function compilation                    | PASS with Wrangler 4.127.1 from `examples/cloudflare-pages` using `--cwd`               |
| Migration rehearsal                           | PASS; 0001–0004 applied in order to temporary SQLite; documented seed SQL succeeds      |
| Dependency audit                              | PASS; no known vulnerabilities after bounded sharp/js-yaml security patches             |
| Diff whitespace and local documentation links | PASS                                                                                    |

The new provider regression initially failed without the placeholder. Snippet tests initially
failed because required HTML was absent. Both now pass. Existing UI/proxy fixtures were updated to
represent actual snippet metadata rather than a missing HTML response or an empty array.

Token tests use the real Worker signature verifier. They cover signed five-minute scope, unique
JWT IDs, wrong signing key, missing/foreign/malformed provenance, Origin precedence, preview origin,
POST rejection and missing configuration. Website checks reject HTML fallback, mismatched scope,
expired/overlong tokens, cacheable tokens, oversized bodies, malformed JSON and invalid script text.
CLI tests ensure only exact HTTPS origins reach fetch and token values do not appear in output.
Local API tests retain the original same-origin GET regression and add malformed/conflicting headers.

The coverage configuration now explicitly includes the new Function and verification utility.
After this surfaced untested failure paths, additional negative tests raised coverage above the
existing 90% requirement. No new code was excluded to satisfy coverage.

## Local build commands

```sh
pnpm typecheck
pnpm coverage
pnpm lint
pnpm format:check
pnpm build
pnpm browser-sdk:build
pnpm audit --audit-level high
WRANGLER_LOG_PATH=/tmp/vizoalica-wrangler-logs pnpm exec wrangler pages functions build --cwd examples/cloudflare-pages --outfile /tmp/vizoalica-pages-worker.js
```

Initial sandboxed registry access was unavailable; the audit and dependency installation succeeded
with the environment's approved network access. Wrangler logs were directed to temporary storage
for the local compile. The installed OneCLI 2.11.0 help independently confirmed the `--gateway`
option; no real agent credentials were inspected or printed.

## Live checks not performed

The reported demo deployment is user-provided evidence, not a deployment performed by this patch.
No claim is made that the new example was deployed to the user's Cloudflare account. An operator
must still verify live resources, secrets, migrations, website MIME/bodies, accepted browser 202,
and console aggregates using the installation guide. OneCLI gateway injection and Pages temporary
JWT behavior were not reproduced against live credentials. The external sample repository was not
modified. Manual screen-reader validation was not performed; automated UI semantics, interaction,
clipboard and consent-before-load tests passed. This is a local patch ready for review, not an
independent go/no-go decision for an official release.

# Quickstart: validating page breakdown and actions

A run guide that proves the feature end to end. It links to contracts and the data model instead of
repeating them. Nothing here touches a real Cloudflare account except the optional upgrade
rehearsal, which is isolated (see the last section).

## Prerequisites

- Node 22 or newer and pnpm 9 (`pnpm install` at the repository root).
- Playwright browsers for the console end-to-end run (`pnpm --filter @vizoalica/admin-web exec playwright install chromium`).
- Work in the feature branch checkout. Never run `git clean -x` in the main checkout: it holds the
  git-ignored production Wrangler config. Use a `git worktree` for clean-tree experiments.

## 1. The quality gates

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test            # unit, contract, integration; coverage must stay above 90% lines and branches
pnpm test:e2e        # console flows and accessibility scans against the mock console
```

**Expect:** all green; `pnpm test -- --coverage` reports at least 90% lines and branches overall.

## 2. Pages report: one entry per screen (Story 1, SC-001)

Automated: the SDK navigation tests drive a jsdom page through five screens (three fragment
routes, two `pushState` routes), then assert one page view per arrival and the exact page keys.

```sh
pnpm vitest run packages/browser-sdk
```

Manual, in a browser: build the SDK and open the sample page.

```sh
pnpm browser-sdk:build
```

Serve `packages/browser-sdk/examples/basic.html` (extended by this feature with a small
fragment-routed sample) from any static server with a local mock endpoint, click between its
screens, and read the captured request bodies in the browser's Network panel.

**Expect:** one `com.vizoalica.page_view.v1` per screen with `url_path` such as `/#/pricing`, no
`?`, and no `#` for a plain anchor.

## 3. Identifier grouping (Story 2, SC-002, SC-003)

```sh
pnpm vitest run packages/privacy apps/ingest-api apps/ingest-worker -t "page path"
```

**Expect:** the fixed corpus in [contracts/page-path-normalization.md](./contracts/page-path-normalization.md)
passes both lists (every listed identifier grouped, every listed word, slug, and date kept), 1,000
distinct `/orders/<number>` views aggregate to a single `/orders/:id` row with count 1,000, and no
identifier value appears in stored events or aggregates.

## 4. Actions collected and reported (Stories 3 and 4, SC-004, SC-006, SC-007)

```sh
pnpm vitest run packages/browser-sdk -t "action"
pnpm vitest run apps/ingest-worker -t "action"
```

**Expect:**

- Clicks and Enter/Space activations on eligible controls yield `com.vizoalica.action.v1` events
  (contract: [contracts/sdk-action-collection.md](./contracts/sdk-action-collection.md)); text inputs, password
  and payment fields, ignored areas, and consent-denied pages yield none.
- Labels containing an email or long digit run are redacted; links carry no query or fragment.
- The listener adds well under 50 ms even for a very large label and never throws into the page.
- Rollups: repeated event ids count once, projects stay isolated, rows expire with retention, and
  deleting a project removes them.

## 5. Console: the Actions page (Stories 3 and 4, SC-005, SC-008)

```sh
pnpm --filter @vizoalica/admin-web test:e2e -- --grep "Actions"
```

**Expect:** the Actions page appears in the Analytics navigation after Pages; it shows the ranked
table, per-action totals, and the correct empty states; choosing a page or action narrows the report
and updates the address (`#/analytics/actions?page=...&action=...`); reloading that address restores
the same view; the page contains no control that changes settings; the axe scan reports zero
violations in light and dark themes; the whole flow works from the keyboard.

## 6. Contracts and compatibility (FR-026, spec edge cases)

```sh
pnpm vitest run packages/event-contracts apps/ingest-api apps/local-ops-api
```

**Expect:** existing page-view and custom-event fixtures still validate unchanged; the action schema
accepts valid events and rejects extra fields, oversized names, and query strings; the admin and
local-ops endpoints reject bad ranges and values with the documented errors.

Version skew: the SDK test that simulates a backend answering `400` for action batches shows page
views still delivered, the rejected batch dropped rather than retried, and no growth of the queue.

## 7. Schema rehearsal (optional, isolated)

Verifies the baseline creates the two action tables on an empty database. Use scratch names and a
separate worktree; never point it at the production database or the production Wrangler config.

```sh
git worktree add --detach ../vizoalica-rehearsal HEAD
cd ../vizoalica-rehearsal
# In a scratch D1 database named vizoalica-rehearsal-config (see docs/operations/cloudflare.md):
pnpm exec wrangler d1 migrations apply vizoalica-rehearsal-config --remote --config <scratch config>
```

**Expect:** `0001` applies and both action tables and their indexes exist. Remove the scratch resources afterwards, in the order in
`docs/operations/cloudflare.md`, and only names that start with `vizoalica-rehearsal-`.

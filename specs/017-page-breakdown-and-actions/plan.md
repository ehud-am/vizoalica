# Implementation Plan: Page Breakdown and Actions Report

**Branch**: `017-page-breakdown-and-actions` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/017-page-breakdown-and-actions/spec.md`

## Summary

Fix the Pages report so each screen is its own page, group pages that differ only by an identifier
(`/orders/:id`), and add a view-only Actions page that reports what visitors click, per page.

The technical approach, with rationale in [research.md](./research.md):

- **Page breakdown.** The SDK currently keeps only `pathname` and reports one page view per load, so
  fragment-routed and history-routed sites all appear as `/`. It will append a sanitized route
  fragment to `url_path` (no contract change, so older backends keep working), and emit a page view
  on `pushState`, `popstate`, and `hashchange` when the page key changes.
- **Identifier grouping.** One pure, idempotent `normalizePagePath` function in `packages/privacy`
  replaces identifier segments with `:id`. It runs in the SDK (identifiers never leave the browser)
  and in the ingestion privacy guard (older SDKs and hostile clients get the same result).
- **Actions.** A new versioned event type, `com.vizoalica.action.v1`, produced by a passive capture
  listener for buttons, links, and button-like controls. Names come from an explicit
  `data-vizoalica-action`, else the control's redacted label; `data-vizoalica-ignore` excludes.
  Collection is always on, gated only by consent and per-control exclusion.
- **Storage and report.** Two additive minute-granularity tables (counts and distinct visitors), a
  read-only admin endpoint with `page` and `action` filters, a matching local-operations proxy, and an
  `analytics/actions` console route whose selection lives in the address.
- **Safety.** Actions travel in their own batches and permanent rejections are dropped, so a newer
  SDK with an older backend never stalls page views.

### Decisions for owner review

1. **No migration (owner decision).** The two new tables go into the `0001` baseline, and this is a
   breaking, fresh-install-only release (0.6.0). The maintainer's live database receives the same two
   `CREATE TABLE` statements once, by hand, so its registrations are kept ([R10](./research.md#r10-schema-policy-fold-into-the-baseline-no-migration-owner-decision)).
2. **Digits-only segments are always grouped** (`/page/2` becomes `/page/:id`), and `/orders/2026/12`
   is kept as a date-shaped run ([R3](./research.md#r3-identifier-grouping-rules-and-where-they-run)).
3. **Rate can exceed 100%.** The "share of page views" is shown as actions per page view, because one
   view can produce several clicks ([R13](./research.md#r13-console-ui)).
4. **Consent** is stricter for the new data only: no actions or in-page navigation views when consent
   is explicitly denied, while the initial page view keeps today's behavior ([R8](./research.md#r8-consent)).
5. **Rollout order** is backend (with the new schema), then website SDK files. The SDK file is
   self-hosted by each website, so adoption is a deliberate upgrade step.

## Technical Context

**Language/Version**: TypeScript 5.7 (ES2022), Node 22 or newer, pnpm 9.15 workspace (ESM)

**Primary Dependencies**: Existing only. Ajv 2020 for event schemas; React 19 and Vite 6 for the
console; esbuild for the SDK bundle; Wrangler 4 for deployment. No new runtime dependency.

**Storage**: Cloudflare D1 (SQLite) for aggregates: two new tables in the `0001_initial.sql` baseline; R2 raw batches (unchanged; action events are stored after the privacy
guard like other events).

**Testing**: Vitest 4 (unit, contract, integration; jsdom for SDK and console), Testing Library,
Playwright with `@axe-core/playwright` for console flows and accessibility. Coverage gate 90% lines
and branches.

**Target Platform**: Browsers (SDK, standalone IIFE bundle); Cloudflare Workers (ingestion and admin
API); Node local operations API; browser console (React SPA, hash-routed).

**Project Type**: Web application in a pnpm monorepo (SDK package, shared packages, Worker, local API,
console).

**Performance Goals**: Click handling adds under 50 ms (target: a few milliseconds); actions report
returns from one batched D1 read with at most 100 grouped rows; ingestion cost per action is about
three D1 rows, fewer than a page view.

**Constraints**: SDK must never block or break the host page; no query values, typed text, or raw
identifiers stored or reported; older backends must keep accepting page views from a newer SDK; all
changes to accepted history are additive; WCAG 2.2 AA for the new page; retention stays 32 days.

**Scale/Scope**: Per-website quotas already bound event volume; report bounded to 100 rows, 50
per-action totals, 30-day maximum range. Roughly 15 source files changed and 12 added, plus docs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: unchanged, all pass.*

| Principle / rule | Assessment | Evidence in this plan |
| ---------------- | ---------- | --------------------- |
| **I. Privacy-minimal analytics** | Pass, with deliverables | New fields (action name, kind, link destination, route fragment in `url_path`) each get a documented purpose, retention, access boundary, and review: `docs/privacy/action-collection-review.md` (R16). Labels redacted and truncated; queries, fragments, typed text, `mailto:`/`tel:` never recorded; raw identifiers never stored; reports are aggregates with no visitor identifiers. |
| **II. Security and abuse resistance** | Pass | New event type is schema-validated with length limits and `additionalProperties: false`; privacy guard re-normalizes before storage; quotas apply before expensive work (unchanged pipeline order); every table and query is keyed by `project_id`; admin endpoint uses existing admin auth; client rate cap and dedup; negative tests listed in R17 (malformed input, oversize, cross-project reads, replay). No secrets added anywhere. |
| **III. Open source, portable interoperability** | Pass | Public versioned JSON Schema for the action event; CloudEvents envelope; contracts documented in the repository; no provider-specific behavior added. |
| **IV. Minimal infrastructure, AI-assisted deployment** | Pass | No new service; two new tables in the baseline schema. The installer keeps working on fresh installs; the release is fresh-install-only, as the 0.5 line already is (R10). |
| **V. Human-readable, AI-ready engineering** | Pass | Small single-purpose modules (normalizer, label redaction, action capture, navigation, action rollups, report query, console page); comments only for non-obvious intent (grouping thresholds, why `replaceState` is ignored, why actions have their own batches); contracts precede code; docs updated with behavior. |
| **Accessible product experience** | Pass, verified by tests | Actions page uses real tables, scroll regions with accessible names, no color-only meaning, keyboard-operable filters; axe scans in both themes plus a manual keyboard check are tasks. |
| **SDK never blocks the host** | Pass | Passive, capturing, bounded, try/catch listener; `pushState` wrapper defers work and calls the original first; failures swallowed as for page views. |
| **Privacy filtering and limits before persistence** | Pass | Guard and quotas run before any storage, as today. |
| **Raw events separate from aggregates; bounded reads** | Pass | Raw batches stay in R2; report reads only minute aggregates with a 100-row cap and 30-day range limit. |
| **Versioned contracts, additive history** | Pass | `com.vizoalica.action.v1`; existing schemas and stored history unchanged. |
| **Testing and release gates** | Pass | Unit, integration, contract, e2e, negative, and accessibility tests planned; coverage stays above 90%. Release-time alignment review, QA report, and human go/no-go remain release activities, not part of this feature. |

No violations requiring justification. The Complexity Tracking table is therefore empty.

## Project Structure

### Documentation (this feature)

```text
specs/017-page-breakdown-and-actions/
├── spec.md                          # Feature specification
├── plan.md                          # This file
├── research.md                      # Phase 0: decisions R1 to R18
├── data-model.md                    # Phase 1: page key, action event, tables, report, route
├── quickstart.md                    # Phase 1: validation guide
├── contracts/
│   ├── action-event.v1.schema.json  # Wire schema for the new event type
│   ├── actions-report-api.md        # Worker admin, local-ops, and console client contract
│   ├── page-path-normalization.md   # Page key rules, examples, and test corpus
│   └── sdk-action-collection.md     # What the SDK collects and developer markings
├── checklists/requirements.md       # Spec quality checklist
└── tasks.md                         # Phase 2 output (/speckit-tasks; not created by this command)
```

### Source Code (repository root)

The repository is a pnpm monorepo: shared packages, a Worker, a local API, and the console. This
feature touches each layer. Paths marked (new) are added; the rest are modified.

```text
packages/
├── privacy/
│   ├── src/page-path.ts                 (new) normalizePagePath, groupIdentifiers, fragment route
│   ├── src/labels.ts                    (new) redactLabel
│   ├── src/redaction.ts                 redactUrl uses normalizePagePath
│   ├── src/index.ts                     export the new modules
│   └── tests/                           corpus tests (SC-003), label redaction (SC-006)
├── event-contracts/
│   ├── schemas/event-data-action.schema.json   (new) from contracts/action-event.v1.schema.json
│   ├── schemas/cloudevent-batch.schema.json    add the type to `type` enum and `data` oneOf
│   ├── src/index.ts                     eventTypes, ActionData, schemas, validator registration
│   └── tests/                           action validity, old events still valid
└── browser-sdk/
    ├── src/navigation.ts                (new) pushState/popstate/hashchange, de-duplication
    ├── src/actions.ts                   (new) capture listener, eligibility, naming, destination
    ├── src/events.ts                    page view uses page key; buildActionEvent
    ├── src/privacy.ts                   currentPage returns the page key
    ├── src/index.ts                     wire navigation and actions; separate action batches
    ├── src/transport.ts, queue.ts       drop 400/413 batches instead of requeueing
    ├── src/types.ts                     VizoalicaEvent gains the action event
    ├── examples/basic.html              add a fragment-routed sample with controls
    └── tests/                           navigation, actions, consent, batching, skew, budget

apps/
├── ingest-api/
│   ├── src/ingestion/privacy-guard.ts   normalize page and action events; reject bad ones
│   ├── src/domain/types.ts              ActionsReport and related types
│   ├── src/storage/repositories.ts      getActionsReport?() on the admin repository
│   └── tests/                           guard normalization and rejection
├── ingest-worker/
│   ├── src/storage/action-rollups.ts    (new) record and query action rollups for D1
│   ├── src/storage/d1-repositories.ts   route action events to action rollups; retention and purge lists
│   ├── src/http/admin-adapter.ts        GET /v1/admin/projects/:id/analytics/actions
│   └── tests/                           rollup, replay, isolation, retention, contract, purge
├── local-ops-api/
│   ├── src/routes/analytics.ts          analyticsActions proxy
│   ├── src/server.ts                    route /api/projects/:id/analytics/actions
│   ├── src/contracts.ts                 ActionsReport type
│   └── tests/                           contract and validation
├── deploy-cli/
│   ├── src/fresh-schema.ts              add the two tables to the inspected list
│   └── tests/contract/                  update fresh-schema contract test
└── admin-web/
    ├── src/router.ts                    analytics/actions route, hash query params
    ├── src/analytics/ActionsPage.tsx    (new) page, filters, empty states
    ├── src/analytics/AnalyticsFrame.tsx (new) frame extracted from AnalyticsView
    ├── src/analytics/AnalyticsView.tsx  uses the extracted frame
    ├── src/analytics/useActionsReport.ts (new) data loading with abort and retry
    ├── src/components/ActionsTable.tsx  (new) ranked table with links and Rate column
    ├── src/api/local-operations.ts      ActionsReport types, getAnalyticsActions
    ├── src/App.tsx                      render the new route
    ├── src/styles.css                   styles for filters and the summary strip
    ├── tests/                           router, page, accessibility, data components, fixtures
    └── e2e/                             mock-console endpoint; actions flows, keyboard, axe

deploy/cloudflare/migrations/
└── 0001_initial.sql                     two tables and indexes added to the baseline

docs/
├── privacy/action-collection-review.md  (new) the constitution's review
└── operations/{browser-sdk,privacy,pages,cost-model,cloudflare,releases}.md   updated

CHANGELOG.md, README.md, llms.txt        updated (behavior change, upgrade notes)
```

**Structure Decision**: Keep the existing monorepo boundaries. Shared logic that both the browser and
the Worker must agree on (page keys, label redaction) lives in `packages/privacy`, the one package
both already depend on, so there is a single implementation and a single test corpus. Action rollup
code goes in its own file next to `d1-repositories.ts` (996 lines already) instead of growing it.
The console reuses its existing shell, scope, range, table, and accessibility patterns; the only
structural change is extracting a small frame from `AnalyticsView` so the new page does not depend
on the overview fetch.

## Delivery order (input to /speckit-tasks)

1. **Foundation** (blocks all stories): page-key module with fragment handling and label redaction
   in `packages/privacy`; action schema and type in `packages/event-contracts`; baseline schema tables.
2. **Story 1, page breakdown (P1)**: SDK page key and in-page navigation; guard accepts fragment keys;
   Pages and Overview display; sample page.
3. **Story 2, identifier grouping (P1)**: grouping in the shared function, SDK, and guard; corpus
   tests; documentation of the rules.
4. **Stories 3 and 5, actions collection and controls (P2, P3)**: SDK capture, naming, markings,
   consent, batching and skew handling; ingestion, rollups, retention, purge.
5. **Story 3, actions report (P2), then Story 4, deep dive (P3)**: endpoint, proxy, client, console
   route, page, filters, empty states, accessibility.
6. **Polish**: privacy review, documentation and changelog, cost model, upgrade notes, fresh-schema
   list, coverage and quality gates, quickstart run.

Stories 1 and 2 can ship alone. Story 3 depends on the foundation and on Stories 1 and 2 only for
the meaning of its page column.

## Complexity Tracking

No constitution violations to justify.

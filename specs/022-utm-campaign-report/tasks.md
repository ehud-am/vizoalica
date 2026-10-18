# Tasks: UTM Campaign Report

**Input**: `specs/022-utm-campaign-report/` (spec.md, plan.md, data-model.md, contracts/)

**Tests**: Included (constitution: negative tests, coverage > 90%, accessibility checks).

**Format**: `- [X] T### [P?] [Story?] Description with path`. Stories: US1 report (P1), US2 MCP (P1), US3 privacy (P1).

## Phase 1: Foundation

- [X] T001 [US3] Add `packages/privacy/src/campaign.ts` (`cleanCampaignValue`, `extractCampaign(search)`) and export it; table-driven tests in `packages/privacy/tests/campaign.test.ts` (email, digits, token, markup, control chars, length 64, idempotence, empty, repeated and mixed-case names, fragment ignored)
- [X] T002 [P] Add optional `campaign` to `packages/event-contracts/schemas/event-data-page-view.schema.json` and `CampaignData` to `PageViewData` in `src/index.ts`; schema tests (valid, empty object rejected, extra key rejected, over-length rejected, non-string rejected)
- [X] T003 [P] Add migration `deploy/cloudflare/migrations/0005_campaign_reports.sql` per data-model.md; case in `apps/ingest-worker/tests/migrations.test.ts` (tables, availability row, additive only)

## Phase 2: Collection (US1, US3)

- [X] T004 [US1] SDK: attach the cleaned campaign to the first page view only (`packages/browser-sdk/src/events.ts`, `index.ts`); tests: landing tagged, 50 route changes record one, manual `page()` first call, no params, parse failure, nothing else from the query is sent
- [X] T005 [US3] Ingestion: re-clean and drop-if-empty `campaign` in `apps/ingest-api/src/ingestion/privacy-guard.ts`; tests for each hostile sample in the spec and replay safety
- [X] T006 Rebuild the generated browser SDK (`pnpm browser-sdk:build`) and confirm `apps/ingest-worker/src/generated/browser-sdk.ts` is current

## Phase 3: Storage and report (US1)

- [X] T007 [US1] `apps/ingest-worker/src/storage/campaign-rollups.ts`: expand page view to item, statements (counts, visitors) guarded by `dashboard_seen_events` nonce, report queries and shaping (rankings 20, rows 50, other, trend, availability); types in `apps/ingest-api/src/domain/types.ts`; repository interface in `storage/repositories.ts`
- [X] T008 [US1] Wire into `d1-repositories.ts` (`recordDashboardRollups`, `getCampaignsReport`, retention list, `PURGE_SOURCE_TABLES`) and bind in `apps/ingest-worker/src/index.ts`
- [X] T009 [US1] Admin route `GET .../analytics/campaigns` in `admin-adapter.ts` (range, filters, scope, 400 on bad filter)
- [X] T010 [US1] Tests: contract test of the route (roles, scope, filters, bounds, 404), integration test of rollups (counts, visitors, replay, filter narrowing, partial availability, 1,000 distinct values bounded, statement count unchanged without campaign) and an end-to-end test through `worker.fetch` on the real schema

## Phase 4: Console and MCP (US1, US2)

- [X] T011 [US1] local-ops-api: contract + route proxy `GET /api/environments/:env/projects/:projectId/campaigns` (`contracts.ts`, `routes/analytics.ts`, `server.ts`) with a contract test
- [X] T012 [US1] Console: API client function, `useCampaignsReport`, `CampaignsPage`, `CampaignsTables`, router entry and Analytics nav item, mock-console data and fixtures; unit tests for loading, empty, partial, error, filters
- [X] T013 [US1] Playwright: add the Campaigns page to the area, responsive and accessibility specs (axe light/dark, 320 px, 200% zoom, keyboard)
- [X] T014 [US2] MCP `get_campaigns` in `apps/cli/src/mcp/server.ts` with tests in `apps/cli/tests/mcp-server.test.ts` (output, scope, 30-day cap, old backend message)

## Phase 5: Documentation and release material

- [X] T015 [P] `docs/operations/campaigns.md` (tagging guide, collected and not collected, limits, update order, privacy); update privacy, browser-sdk, ai, operator-local pages, navigation, `skills/vizoalica/SKILL.md` and reference data model; docs site test list
- [X] T016 [P] Spec-kit housekeeping: mark tasks done, record deviations here, write `qa-report.md` (see release checks in feature 023 tasks, shared)

## Implementation notes and deviations

- The console proxy is `GET /api/projects/:projectId/analytics/campaigns` (not under `/api/environments/...`; the
  console already addresses the current environment). The contract and tests use that path.
- The Worker reaches `cleanCampaign` through `apps/ingest-api/src/ingestion/privacy-guard.ts`
  (`reportableCampaign`), like `reportablePropertyValue`, so `@vizoalica/ingest-worker` takes no new dependency.
- `utm_*` cleaning keeps combining marks (`\p{M}`) so non-Latin scripts survive; found by the QA review (qa-report
  finding 4).
- T016 (QA report) is delivered as `qa-report.md` in this folder, which covers both 0.11.0 features.

## Fixes after the independent QA (qa-report-independent.md)

m2 (digits of any script are mapped to ASCII before redaction), m3 (the cut is by code points; the address builder
survives a label it cannot encode), m4 (the console says to update a backend without the report), m5 (campaign counts
run in their own step, so a database without 0005 loses only those counts, and the report answers
`503 database_update_needed`), m7 (the tool's note, description and the skill say labels are untrusted data), m8 (an
empty filter is `400`). Tests: `campaign.test.ts`, `stale-database.test.ts`, `campaigns-report.contract.test.ts`,
`campaigns-page.test.tsx`.

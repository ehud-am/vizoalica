# Tasks: Basic Analytics Dashboard

## Phase 1: Setup

- [X] T001 Add dashboard operations documentation in `docs/operations/dashboard.md`

## Phase 2: Foundational

- [X] T002 Add daily unique-user aggregate schema and indexes in `deploy/cloudflare/migrations/0003_dashboard.sql`
- [ ] T003 Extend ingestion rollup storage to update privacy-safe daily unique-user aggregates in `apps/ingest-worker/src/storage/d1-repositories.ts`
- [ ] T004 Extend dashboard summary repository contracts in `apps/ingest-api/src/domain/types.ts` and `apps/ingest-api/src/storage/repositories.ts`

## Phase 3: User Story 1 - View website totals (Priority: P1)

**Goal**: Display unique users and page views for one authenticated source.

**Independent Test**: Data from a second source never appears in the selected source summary.

- [ ] T005 [P] [US1] Add source-isolation, privacy, zero-state, and authentication tests in `apps/ingest-worker/tests/dashboard.test.ts`
- [ ] T006 [US1] Implement fixed source dashboard summary queries in `apps/ingest-worker/src/storage/d1-repositories.ts`
- [ ] T007 [US1] Implement authenticated dashboard HTML and summary routes in `apps/ingest-worker/src/http/dashboard-adapter.ts`
- [ ] T008 [US1] Mount dashboard routes in `apps/ingest-worker/src/http/worker-adapter.ts` and `apps/ingest-worker/src/index.ts`

## Phase 4: User Story 2 - Change reporting period (Priority: P2)

**Goal**: Update both metrics for today, 7 days, or 30 days only.

**Independent Test**: Each supported period returns matching totals; invalid periods do not query data.

- [ ] T009 [P] [US2] Add period validation and calendar-boundary tests in `apps/ingest-worker/tests/dashboard.test.ts`
- [ ] T010 [US2] Add fixed period resolution and rendered selector behavior in `apps/ingest-worker/src/http/dashboard-adapter.ts`

## Phase 5: Polish

- [ ] T011 Update `docs/operations/dashboard.md` with metric definitions and limitations
- [ ] T012 Run `pnpm run validate`, `pnpm run lint`, and `specs/003-basic-dashboard/quickstart.md`

## Dependencies & Execution Order

- T002-T004 block the dashboard stories.
- US1 is the MVP; US2 extends the same bounded summary route.
- T011-T012 finish the feature.

## Implementation Strategy

1. Build daily aggregates and source-scoped today totals.
2. Add dashboard HTML and safe summary data.
3. Add 7-day and 30-day selectors without custom ranges.

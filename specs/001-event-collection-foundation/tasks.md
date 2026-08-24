# Tasks: Event Collection Foundation

**Input**: Design documents from `/specs/001-event-collection-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included and test-first because the constitution requires coverage for privacy filtering, schema validation, failure behavior, authorization boundaries, quota enforcement, and tenant/project isolation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Browser SDK: `packages/browser-sdk/`
- Shared schemas/contracts: `packages/event-contracts/`
- Shared privacy utilities: `packages/privacy/`
- Ingestion service: `apps/ingest-api/`
- Demo token issuer: `apps/token-demo/`
- Self-hosting assets: `deploy/compose/`
- Tests live beside each app/package in `tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the TypeScript monorepo and base project structure.

- [X] T001 Create monorepo directories `apps/ingest-api`, `apps/token-demo`, `packages/browser-sdk`, `packages/event-contracts`, `packages/privacy`, `deploy/compose`, and `docs/operations`
- [X] T002 Create root package/workspace configuration in `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json`
- [X] T003 [P] Configure linting and formatting in `eslint.config.js`, `.prettierrc.json`, and `.prettierignore`
- [X] T004 [P] Configure test tooling and shared test scripts in `package.json` and `vitest.config.ts`
- [X] T005 [P] Add TypeScript package manifests for `packages/browser-sdk/package.json`, `packages/event-contracts/package.json`, and `packages/privacy/package.json`
- [X] T006 [P] Add application manifests for `apps/ingest-api/package.json` and `apps/token-demo/package.json`
- [X] T007 [P] Add environment example files in `apps/ingest-api/.env.example` and `apps/token-demo/.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared contracts, schemas, configuration, storage abstractions, and observability that MUST be complete before any user story can be implemented.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T008 Copy draft JSON Schemas from `specs/001-event-collection-foundation/contracts/schemas/` into `packages/event-contracts/schemas/`
- [X] T009 [P] Implement schema exports and type generation entrypoint in `packages/event-contracts/src/index.ts`
- [X] T010 [P] Add schema validation tests for CloudEvents batch, page-view event, custom event, and token claims in `packages/event-contracts/tests/schema-validation.test.ts`
- [X] T011 Implement privacy policy constants for sensitive URL keys, forbidden property names, and field limits in `packages/privacy/src/policy.ts`
- [X] T012 [P] Add privacy policy unit tests for default forbidden keys and limits in `packages/privacy/tests/policy.test.ts`
- [X] T013 Implement shared privacy redaction utilities in `packages/privacy/src/redaction.ts`
- [X] T014 [P] Add privacy redaction tests for URLs, query strings, and property names in `packages/privacy/tests/redaction.test.ts`
- [X] T015 Define ingestion service configuration loader in `apps/ingest-api/src/config.ts`
- [X] T016 [P] Define core data types for Project, Source, SigningKey, QuotaPolicy, EventBatch, Event, and IngestionDecision in `apps/ingest-api/src/domain/types.ts`
- [X] T017 [P] Define storage repository interfaces in `apps/ingest-api/src/storage/repositories.ts`
- [X] T018 [P] Define in-memory storage adapter for local validation in `apps/ingest-api/src/storage/memory.ts`
- [X] T019 [P] Define safe structured logging and metrics interfaces in `apps/ingest-api/src/observability/index.ts`
- [X] T020 Create base HTTP server entrypoint and router skeleton in `apps/ingest-api/src/http/server.ts`
- [X] T021 Create `/healthz` endpoint and health tests in `apps/ingest-api/src/http/health.ts` and `apps/ingest-api/tests/integration/health.test.ts`

**Checkpoint**: Foundation ready — user story implementation can now begin in priority order or in parallel if staffed.

---

## Phase 3: User Story 1 - Embed analytics safely (Priority: P1) 🎯 MVP

**Goal**: A website owner can embed the browser SDK, emit page views/custom events, and the host website keeps working even when ingestion is unavailable.

**Independent Test**: Add the SDK to a test page, trigger page load and custom events, simulate backend failure, and verify the page remains usable with no visitor-facing analytics error.

### Tests for User Story 1

- [X] T022 [P] [US1] Add browser SDK initialization tests in `packages/browser-sdk/tests/init.test.ts`
- [X] T023 [P] [US1] Add browser SDK event queue and batching tests in `packages/browser-sdk/tests/queue.test.ts`
- [X] T024 [P] [US1] Add browser SDK failure-behavior tests for unavailable ingestion in `packages/browser-sdk/tests/failure.test.ts`
- [X] T025 [P] [US1] Add browser SDK event-building tests for CloudEvents page views and custom events in `packages/browser-sdk/tests/events.test.ts`

### Implementation for User Story 1

- [X] T026 [P] [US1] Implement browser SDK public API `init`, `track`, and `flush` in `packages/browser-sdk/src/index.ts`
- [X] T027 [P] [US1] Implement non-blocking bounded event queue in `packages/browser-sdk/src/queue.ts`
- [X] T028 [P] [US1] Implement CloudEvents page-view and custom-event builders in `packages/browser-sdk/src/events.ts`
- [X] T029 [US1] Integrate privacy redaction utilities into event building in `packages/browser-sdk/src/events.ts`
- [X] T030 [US1] Implement safe delivery transport with timeout, retry limits, and silent failure in `packages/browser-sdk/src/transport.ts`
- [X] T031 [US1] Implement token provider hook without exposing signing secrets in `packages/browser-sdk/src/auth.ts`
- [X] T032 [US1] Create browser SDK package build output configuration in `packages/browser-sdk/tsconfig.json`
- [X] T033 [US1] Add minimal example HTML page using the SDK in `packages/browser-sdk/examples/basic.html`
- [X] T034 [US1] Document embed snippet and failure guarantees in `docs/operations/browser-sdk.md`

**Checkpoint**: User Story 1 should be functional and independently demonstrable with a mock or unavailable backend.

---

## Phase 4: User Story 2 - Receive high-volume activity safely (Priority: P1)

**Goal**: The ingestion service receives signed CloudEvents batches, validates them, enforces quotas, and rejects abusive traffic before expensive work.

**Independent Test**: Send sustained valid, invalid, oversized, duplicate, expired-token, and over-quota batches to the ingestion endpoint and verify valid events are accepted while abusive traffic is bounded.

### Tests for User Story 2

- [X] T035 [P] [US2] Add OpenAPI contract tests for `POST /v1/events:batch` in `apps/ingest-api/tests/contract/events-batch.contract.test.ts`
- [X] T036 [P] [US2] Add JWT ingest token verification tests in `apps/ingest-api/tests/unit/token-verifier.test.ts`
- [X] T037 [P] [US2] Add quota policy decision tests in `apps/ingest-api/tests/unit/quota-policy.test.ts`
- [X] T038 [P] [US2] Add ingestion schema rejection tests in `apps/ingest-api/tests/unit/event-validator.test.ts`
- [X] T039 [P] [US2] Add project isolation integration tests in `apps/ingest-api/tests/integration/project-isolation.test.ts`
- [X] T040 [P] [US2] Add abuse/load validation scenario for 1,000 events per second in `apps/ingest-api/tests/load/ingestion-smoke.test.ts`

### Implementation for User Story 2

- [X] T041 [P] [US2] Implement JWT/JOSE ingest token verifier in `apps/ingest-api/src/auth/token-verifier.ts`
- [X] T042 [P] [US2] Implement origin and source authorization checks in `apps/ingest-api/src/auth/source-authorizer.ts`
- [X] T043 [P] [US2] Implement CloudEvents and event-data schema validator in `apps/ingest-api/src/ingestion/event-validator.ts`
- [X] T044 [P] [US2] Implement quota policy evaluator in `apps/ingest-api/src/quotas/quota-policy.ts`
- [X] T045 [US2] Implement replay, expiry, event age, and max-events-per-token checks in `apps/ingest-api/src/auth/token-constraints.ts`
- [X] T046 [US2] Implement event batch ingestion pipeline with early rejection ordering in `apps/ingest-api/src/ingestion/pipeline.ts`
- [X] T047 [US2] Implement `POST /v1/events:batch` HTTP handler in `apps/ingest-api/src/http/events.ts`
- [X] T048 [US2] Persist accepted events and ingestion decisions through repository interfaces in `apps/ingest-api/src/ingestion/pipeline.ts`
- [X] T049 [US2] Emit safe operational metrics for accepted, rejected, throttled, and oversized traffic in `apps/ingest-api/src/observability/metrics.ts`
- [X] T050 [US2] Add demo token issuer for local validation in `apps/token-demo/src/index.ts`
- [X] T051 [US2] Wire ingest API routes into server startup in `apps/ingest-api/src/http/server.ts`

**Checkpoint**: User Story 2 should accept signed valid batches and reject unsafe traffic independently of browser SDK UX work.

---

## Phase 5: User Story 3 - Protect privacy by default (Priority: P1)

**Goal**: Vizoalica prevents sensitive data from being accepted or stored by default across browser and backend paths.

**Independent Test**: Generate activity from pages and payloads containing forms, secret-like query parameters, emails, phone-like values, tokens, and oversized custom properties, then verify they are redacted, rejected, or omitted.

### Tests for User Story 3

- [X] T052 [P] [US3] Add end-to-end privacy integration tests in `apps/ingest-api/tests/integration/privacy-defaults.test.ts`
- [X] T053 [P] [US3] Add browser-side no-form-capture tests in `packages/browser-sdk/tests/privacy.test.ts`
- [X] T054 [P] [US3] Add backend sensitive property rejection tests in `apps/ingest-api/tests/unit/privacy-guard.test.ts`

### Implementation for User Story 3

- [X] T055 [P] [US3] Implement browser-side URL and referrer minimization in `packages/browser-sdk/src/privacy.ts`
- [X] T056 [P] [US3] Implement backend privacy guard for accepted event data in `apps/ingest-api/src/ingestion/privacy-guard.ts`
- [X] T057 [US3] Integrate backend privacy guard before persistence in `apps/ingest-api/src/ingestion/pipeline.ts`
- [X] T058 [US3] Ensure logs and rejection reason codes exclude raw sensitive payload values in `apps/ingest-api/src/observability/index.ts`
- [X] T059 [US3] Document default privacy behavior and unsafe custom property examples in `docs/operations/privacy.md`

**Checkpoint**: User Story 3 should prove sensitive content is not stored by default across client and backend paths.

---

## Phase 6: User Story 4 - Prepare for future analysis and AI (Priority: P2)

**Goal**: Stored events have stable schemas, trust metadata, consent state, project/source boundaries, and optional trace context so future dashboards, exports, and AI-assisted analysis can rely on them.

**Independent Test**: Inspect stored events from multiple projects and verify consistent schema version, trust level, consent state, project/source identity, and optional trace context.

### Tests for User Story 4

- [ ] T060 [P] [US4] Add structured event metadata tests in `apps/ingest-api/tests/integration/event-metadata.test.ts`
- [ ] T061 [P] [US4] Add W3C Trace Context preservation tests in `packages/browser-sdk/tests/trace-context.test.ts`
- [ ] T062 [P] [US4] Add consent state propagation tests in `packages/browser-sdk/tests/consent.test.ts`

### Implementation for User Story 4

- [ ] T063 [P] [US4] Add trust-level and consent-state helpers to event contracts in `packages/event-contracts/src/metadata.ts`
- [ ] T064 [P] [US4] Implement optional W3C Trace Context capture in `packages/browser-sdk/src/trace-context.ts`
- [ ] T065 [P] [US4] Implement consent state configuration in `packages/browser-sdk/src/consent.ts`
- [ ] T066 [US4] Store trust level, consent state, schema version, and trace context with accepted events in `apps/ingest-api/src/storage/repositories.ts`
- [ ] T067 [US4] Add safe event export interface for local validation in `apps/ingest-api/src/http/debug-export.ts`
- [ ] T068 [US4] Document event naming and schema versioning rules in `docs/operations/event-schemas.md`

**Checkpoint**: User Story 4 should make the event foundation ready for future dashboards, exports, and AI-assisted analysis without adding those features yet.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, deployment, validation, and hardening across all user stories.

- [ ] T069 [P] Create Dockerfile for ingestion service in `apps/ingest-api/Dockerfile`
- [ ] T070 [P] Create local Docker Compose deployment in `deploy/compose/docker-compose.yml`
- [ ] T071 [P] Add local deployment documentation in `docs/operations/self-hosting.md`
- [ ] T072 Add quickstart validation script covering signed accept, backend down, invalid token, oversized payload, privacy, quotas, and demo mode in `scripts/validate-quickstart.sh`
- [ ] T073 Run and update `specs/001-event-collection-foundation/quickstart.md` based on actual validation behavior
- [ ] T074 Review all public docs for accurate security wording about browser authenticity limits in `docs/operations/`
- [ ] T075 Run lint, typecheck, unit, contract, integration, and quickstart validation from root `package.json`
- [ ] T076 Update root `README.md` with v0.1.0 development status and links to SDK, ingestion, privacy, and self-hosting docs

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — blocks all user stories.
- **User Stories (Phase 3+)**: Depend on Foundational completion.
- **Polish (Phase 7)**: Depends on desired user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational; no dependency on other stories if tested with mock/unavailable backend.
- **User Story 2 (P1)**: Can start after Foundational; no dependency on browser SDK if tested with direct HTTP clients.
- **User Story 3 (P1)**: Depends on US1 and US2 integration points for full end-to-end validation, but privacy utility work can begin after Foundational.
- **User Story 4 (P2)**: Depends on event contracts and accepted-event persistence from US2; browser helpers can begin after Foundational.

### Within Each User Story

- Tests MUST be written and fail before implementation.
- Shared types/contracts before services.
- Services before HTTP endpoints.
- Browser event builders before transport integration.
- Core implementation before integration and documentation updates.

### Parallel Opportunities

- T003–T007 can run in parallel after T001–T002.
- T009–T014 and T016–T019 can run in parallel after T008.
- US1 tests T022–T025 can run in parallel.
- US2 tests T035–T040 can run in parallel.
- US2 implementation T041–T044 can run in parallel before T045–T048.
- US3 tests T052–T054 can run in parallel.
- US4 tests T060–T062 and implementation T063–T065 can run in parallel.
- Polish tasks T069–T071 can run in parallel.

---

## Parallel Example: User Story 1

```bash
Task: "T022 [P] [US1] Add browser SDK initialization tests in packages/browser-sdk/tests/init.test.ts"
Task: "T023 [P] [US1] Add browser SDK event queue and batching tests in packages/browser-sdk/tests/queue.test.ts"
Task: "T024 [P] [US1] Add browser SDK failure-behavior tests for unavailable ingestion in packages/browser-sdk/tests/failure.test.ts"
Task: "T025 [P] [US1] Add browser SDK event-building tests for CloudEvents page views and custom events in packages/browser-sdk/tests/events.test.ts"
```

## Parallel Example: User Story 2

```bash
Task: "T036 [P] [US2] Add JWT ingest token verification tests in apps/ingest-api/tests/unit/token-verifier.test.ts"
Task: "T037 [P] [US2] Add quota policy decision tests in apps/ingest-api/tests/unit/quota-policy.test.ts"
Task: "T038 [P] [US2] Add ingestion schema rejection tests in apps/ingest-api/tests/unit/event-validator.test.ts"
Task: "T041 [P] [US2] Implement JWT/JOSE ingest token verifier in apps/ingest-api/src/auth/token-verifier.ts"
Task: "T044 [P] [US2] Implement quota policy evaluator in apps/ingest-api/src/quotas/quota-policy.ts"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational.
3. Complete Phase 3: User Story 1 with mocked/unavailable backend validation.
4. Complete Phase 4: User Story 2 with direct HTTP validation.
5. Complete Phase 5: User Story 3 privacy validation.
6. Stop and demo safe end-to-end page view/custom event ingestion.

### Incremental Delivery

1. Setup + Foundational → schemas, privacy policy, storage interfaces, and server skeleton.
2. US1 → browser SDK safely emits batches and tolerates backend failure.
3. US2 → ingestion accepts signed valid data and rejects unsafe traffic.
4. US3 → privacy defaults verified end to end.
5. US4 → metadata foundation for future dashboards/exports/AI.
6. Polish → self-hosting, docs, quickstart validation, hardening.

### Notes

- [P] tasks touch different files and can run in parallel after their dependencies.
- Each task includes an exact file path for LLM execution.
- Commit after each task or logical group.
- Do not add dashboards, session replay, in-app guides, or AI insight generation in this feature.

---

## Phase 8: Cost-Optimized Raw Storage & Parquet Foundation

**Purpose**: Implement the v0.1.0 ultra-low-cost raw storage path with JSON wire batches and bounded Parquet chunk files.

- [X] T077 [P] Add JSONL gzip batch sink unit tests in `apps/ingest-api/tests/unit/jsonl-gzip-batch.test.ts`
- [X] T078 [P] Add ingestion-to-JSONL-gzip sink integration test in `apps/ingest-api/tests/integration/jsonl-gzip-sink.test.ts`
- [X] T079 [P] Implement Parquet-ready raw record conversion in `apps/ingest-api/src/storage/jsonl-gzip-batch.ts`
- [X] T080 Implement compressed JSONL batch file sink with project/date/hour partitions in `apps/ingest-api/src/storage/jsonl-gzip-batch.ts`
- [X] T081 Integrate optional accepted-event sink into ingestion pipeline in `apps/ingest-api/src/ingestion/pipeline.ts`
- [X] T082 Update specification, plan, and research notes for JSON wire format, bounded Parquet storage, and optional JSONL gzip fallback in `specs/001-event-collection-foundation/`
- [X] T083 Update README mission and architecture/cost notes in `README.md`
- [X] T084 Update GCP hosting doc with ≤$0.50 per 1M visits target, loss-rate metric, and Parquet chunk strategy in `docs/operations/gcp-hosting.md`
- [X] T085 [P] Add Parquet chunk sink unit tests in `apps/ingest-api/tests/unit/parquet-chunk.test.ts`
- [X] T086 Implement bounded in-memory Parquet chunk sink in `apps/ingest-api/src/storage/parquet-chunk.ts`
- [X] T087 Make Parquet the default durable sink when `VIZOALICA_STORAGE_ROOT` is configured in `apps/ingest-api/src/http/server.ts`


## Phase 9: DuckDB MVP Analysis

**Purpose**: Complete an end-to-end MVP from browser-shaped JSON ingestion to Parquet persistence to DuckDB summaries.

- [X] T088 [P] Add analytics CLI workspace package in `apps/analytics-cli/`
- [X] T089 Implement DuckDB Parquet summary queries in `apps/analytics-cli/src/duckdb-analysis.ts`
- [X] T090 Add analytics CLI entry point in `apps/analytics-cli/src/index.ts`
- [X] T091 Add end-to-end ingestion → Parquet → DuckDB integration test in `apps/analytics-cli/tests/integration/end-to-end-analysis.test.ts`
- [X] T092 Add storage flush/tuning environment options to the ingest API
- [X] T093 Update README/spec/plan/tasks for the MVP end-to-end flow

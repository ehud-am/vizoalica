---
description: "Cloudflare-native event collection foundation tasks"
---

# Tasks: Event Collection Foundation

**Input**: Design documents in `/specs/001-event-collection-foundation/`

**Tests**: Required for validation, privacy, failure behavior, authorization, quotas, tenant isolation, and durable storage.

**Organization**: Tasks are grouped by user story after shared Cloudflare foundation work.

## Phase 1: Setup

- [X] T001 Create Worker source and test directories in `apps/ingest-worker/src/` and `apps/ingest-worker/tests/`.
- [X] T002 Create Cloudflare deployment configuration in `deploy/cloudflare/wrangler.toml`.
- [X] T003 Add Wrangler, Worker test support, and workspace scripts in `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json`.
- [X] T004 [P] Define Worker bindings in `apps/ingest-worker/src/env.ts`.
- [X] T005 [P] Configure Worker test setup in the repository Vitest configuration and `apps/ingest-worker/tests/`.

## Phase 2: Foundational

**Purpose**: Runtime-neutral ingestion core and Cloudflare adapters; blocks all stories.

- [X] T006 Define runtime-neutral HTTP and storage ports in `apps/ingest-api/src/http/events.ts` and `apps/ingest-api/src/storage/repositories.ts`.
- [X] T007 Refactor ingestion orchestration into `apps/ingest-api/src/ingestion/pipeline.ts`.
- [X] T008 [P] Define D1 schemas for configuration and counters in `deploy/cloudflare/migrations/0001_initial.sql`.
- [X] T009 [P] Implement D1 configuration, quota, and bounded dashboard-rollup repositories in `apps/ingest-worker/src/storage/d1-repositories.ts`.
- [X] T010 [P] Implement R2 immutable batch persistence with safe keys in `apps/ingest-worker/src/storage/r2-event-batches.ts`.
- [X] T011 Implement Worker HTTP adapters in `apps/ingest-worker/src/http/worker-adapter.ts`.
- [X] T012 Implement Worker routes in `apps/ingest-worker/src/index.ts`.
- [X] T013 Add payload-safe metrics and errors in `apps/ingest-worker/src/observability.ts`.
- [X] T014 Validate Worker bindings and secrets in `apps/ingest-worker/src/config.ts`.
- [X] T015 Add foundational adapter tests in `apps/ingest-worker/tests/foundation.test.ts`.

## Phase 3: User Story 1 - Embed analytics safely (Priority: P1) 🎯 MVP

**Goal**: The SDK delivers bounded batches to a Worker and remains non-blocking.

**Independent Test**: A test page sends a signed page view; an unavailable Worker never breaks the page.

- [X] T016 [P] [US1] Support configured Worker endpoints in `packages/browser-sdk/src/transport.ts`.
- [X] T017 [P] [US1] Validate source and token configuration in `packages/browser-sdk/src/index.ts`.
- [X] T018 [P] [US1] Add accepted-batch contract coverage in `packages/event-contracts/tests/schema-validation.test.ts` and Worker durable-ingestion coverage.
- [X] T019 [P] [US1] Add unreachable-endpoint SDK tests in `packages/browser-sdk/tests/failure.test.ts`.
- [X] T020 [US1] Connect the Worker to shared validation in `apps/ingest-worker/src/index.ts`.
- [X] T021 [US1] Add browser SDK and Worker ingestion integration coverage across `packages/browser-sdk/tests/` and `apps/ingest-worker/tests/durable-ingestion.integration.test.ts`.
- [X] T022 [US1] Document Cloudflare endpoint configuration in `docs/operations/browser-sdk.md`.

## Phase 4: User Story 2 - Receive high-volume activity safely (Priority: P1)

**Goal**: The Worker authenticates, limits, isolates, and durably persists accepted batches.

**Independent Test**: Mixed valid and abusive traffic persists only valid in-quota batches.

- [X] T023 [P] [US2] Implement Web Crypto token verification in `apps/ingest-worker/src/auth/token-verifier.ts`.
- [X] T024 [P] [US2] Implement D1-backed origin authorization in `apps/ingest-api/src/auth/source-authorizer.ts` and `apps/ingest-worker/src/storage/d1-repositories.ts`.
- [X] T025 [P] [US2] Implement D1-backed quota evaluation in `apps/ingest-worker/src/storage/d1-repositories.ts`.
- [X] T026 [P] [US2] Test authorization and quota isolation in `apps/ingest-api/tests/integration/project-isolation.test.ts`.
- [X] T027 [P] [US2] Test pre-persistence rejection in `apps/ingest-api/tests/unit/` and Worker adapter coverage.
- [X] T028 [US2] Persist accepted batches to R2 and then update D1 dashboard rollups through `apps/ingest-api/src/ingestion/pipeline.ts`.
- [X] T029 [US2] Map documented status responses in `apps/ingest-worker/src/http/worker-adapter.ts`.
- [X] T030 [US2] Prove acknowledgement follows R2 write in `apps/ingest-worker/tests/durable-ingestion.integration.test.ts`.
- [X] T031 [US2] Add bounded 1,000-event load coverage in `apps/ingest-api/tests/load/ingestion-smoke.test.ts`.

## Phase 5: User Story 3 - Protect privacy by default (Priority: P1)

**Goal**: Persisted data and observability remain privacy-minimal.

**Independent Test**: Sensitive browser and operational identifiers never appear in object keys, metadata, or logs.

- [X] T032 [P] [US3] Extend privacy filter tests in `packages/privacy/tests/redaction.test.ts`.
- [X] T033 [P] [US3] Test R2 object key and metadata privacy in `apps/ingest-worker/tests/r2-privacy.test.ts`.
- [X] T034 [P] [US3] Test payload-safe observability in `apps/ingest-worker/tests/observability.test.ts`.
- [X] T035 [US3] Apply privacy filtering before serialization in `apps/ingest-api/src/ingestion/pipeline.ts`.
- [X] T036 [US3] Exclude raw payloads from D1 state in `apps/ingest-worker/src/storage/d1-repositories.ts`.
- [X] T037 [US3] Add privacy end-to-end coverage in `apps/ingest-api/tests/integration/privacy-defaults.test.ts` and Worker R2 privacy coverage.

## Phase 6: User Story 4 - View bounded dashboard rollups (Priority: P2)

**Goal**: Stored batches are versioned, isolated, lifecycle-managed, and paired with bounded D1 dashboard counters.

**Independent Test**: Two projects produce isolated retained batches and correctly scoped daily D1 rollups.

- [X] T038 [P] [US4] Serialize trust, consent, and schema metadata in `apps/ingest-worker/src/storage/r2-event-batches.ts`.
- [X] T039 [P] [US4] Test project isolation in `apps/ingest-api/tests/integration/project-isolation.test.ts` and R2 privacy coverage.
- [X] T040 [P] [US4] Test schema versions in `packages/event-contracts/tests/schema-validation.test.ts`.
- [X] T041 [US4] Document retention and partition conventions in `deploy/cloudflare/wrangler.toml` and `docs/operations/cloudflare.md`.
- [X] T042 [US4] Update storage mapping in `specs/001-event-collection-foundation/data-model.md`.
- [X] T043 [US4] Add retained-batch integration coverage in `apps/ingest-worker/tests/durable-ingestion.integration.test.ts`.
- [X] T044 [US4] Add a `dashboard_rollups` migration and durable-ingestion test coverage in `deploy/cloudflare/migrations/0001_initial.sql` and `apps/ingest-worker/tests/durable-ingestion.integration.test.ts`.

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T045 [P] Document deployment, migrations, bindings, rollback, and dashboard-rollup limits in `docs/operations/cloudflare.md`.
- [X] T046 [P] Update Cloudflare deployment status and remove obsolete analytics tooling from `README.md`.
- [X] T047 Add a Cloudflare validation script in `scripts/validate-cloudflare-quickstart.sh`.
- [ ] T048 Update real validation outcomes in `specs/001-event-collection-foundation/quickstart.md`.
- [X] T049 Run quality checks from `package.json`.
- [X] T050 Review privacy, security, cost, and portability claims in `docs/operations/` and `apps/ingest-worker/`.

## Dependencies & Execution Order

- Setup → Foundational → US1 and US2 → US3 → US4 → Polish.
- US1 and US2 can begin in parallel after the foundational phase; US3 and US4 require US2 durable persistence.
- Tasks marked `[P]` are parallelizable after their stated prerequisites.

## Parallel Example: User Story 2

```text
T023 token verification, T024 origin authorization, T025 quotas, and T027 early-rejection tests can proceed in parallel.
```

## Implementation Strategy

1. Complete setup and foundational ports/adapters.
2. Validate US1 safe browser-to-Worker delivery.
3. Deliver US2 trusted and durable R2 ingestion.
4. Add privacy controls, then retained-data isolation and bounded dashboard rollups.

## Notes

- All tasks use the required checkbox, ID, optional parallel marker, story label, and exact path format.
- Cloudflare is the only v0.1.0 deployment profile; no GCP or self-hosted implementation tasks are included.

## Phase 8: Convergence

- [X] T051 Enforce atomic per-project and per-source per-second, per-day, and storage-growth quotas through D1 before R2 persistence per FR-011 and FR-012 (partial).
- [X] T052 Bound streamed Worker request-body reads and reject an over-limit body before JSON parsing when `Content-Length` is missing or untrustworthy per FR-008 and Constitution II (partial).
- [X] T053 Add authorization, early-rejection, quota-isolation, and sustained load/abuse coverage across the Worker durable-ingestion tests and shared ingestion-core tests per US2/AC2 and SC-003, SC-005, and SC-006 (partial).
- [X] T054 Implement and test the planned Worker HTTP adapter, including the documented status-response mapping, per plan: Worker HTTP adapters and FR-018 (partial).
- [ ] T055 Run the Cloudflare quickstart validation against a configured test deployment and record the actual results in `specs/001-event-collection-foundation/quickstart.md` per SC-009 (partial).

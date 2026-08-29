---
description: "Cloudflare-native event collection foundation tasks"
---

# Tasks: Event Collection Foundation

**Input**: Design documents in `/specs/001-event-collection-foundation/`

**Tests**: Required for validation, privacy, failure behavior, authorization, quotas, tenant isolation, and durable storage.

**Organization**: Tasks are grouped by user story after shared Cloudflare foundation work.

## Phase 1: Setup

- [ ] T001 Create Worker source and test directories in `apps/ingest-worker/src/` and `apps/ingest-worker/tests/`.
- [ ] T002 Create Cloudflare deployment configuration in `deploy/cloudflare/wrangler.toml`.
- [ ] T003 Add Wrangler, Worker test support, and workspace scripts in `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json`.
- [ ] T004 [P] Define Worker bindings in `apps/ingest-worker/src/env.ts`.
- [ ] T005 [P] Configure Worker test setup in `vitest.config.ts` and `apps/ingest-worker/tests/setup.ts`.

## Phase 2: Foundational

**Purpose**: Runtime-neutral ingestion core and Cloudflare adapters; blocks all stories.

- [ ] T006 Define runtime-neutral HTTP and storage ports in `apps/ingest-api/src/http/types.ts` and `apps/ingest-api/src/storage/repositories.ts`.
- [ ] T007 Refactor ingestion orchestration into `apps/ingest-api/src/ingestion/handler.ts`.
- [ ] T008 [P] Define D1 schemas for configuration and counters in `deploy/cloudflare/migrations/0001_initial.sql`.
- [ ] T009 [P] Implement D1 configuration and quota repositories in `apps/ingest-worker/src/storage/d1-repositories.ts`.
- [ ] T010 [P] Implement R2 immutable batch persistence with safe keys in `apps/ingest-worker/src/storage/r2-event-batches.ts`.
- [ ] T011 Implement Worker HTTP adapters in `apps/ingest-worker/src/http/worker-adapter.ts`.
- [ ] T012 Implement Worker routes in `apps/ingest-worker/src/index.ts`.
- [ ] T013 Add payload-safe metrics and errors in `apps/ingest-worker/src/observability.ts`.
- [ ] T014 Validate Worker bindings and secrets in `apps/ingest-worker/src/config.ts`.
- [ ] T015 Add foundational adapter tests in `apps/ingest-worker/tests/foundation.test.ts`.

## Phase 3: User Story 1 - Embed analytics safely (Priority: P1) 🎯 MVP

**Goal**: The SDK delivers bounded batches to a Worker and remains non-blocking.

**Independent Test**: A test page sends a signed page view; an unavailable Worker never breaks the page.

- [ ] T016 [P] [US1] Support configured Worker endpoints in `packages/browser-sdk/src/transport.ts`.
- [ ] T017 [P] [US1] Validate source and token configuration in `packages/browser-sdk/src/index.ts`.
- [ ] T018 [P] [US1] Add accepted-batch Worker contract tests in `apps/ingest-worker/tests/events.contract.test.ts`.
- [ ] T019 [P] [US1] Add unreachable-endpoint SDK tests in `packages/browser-sdk/tests/failure.test.ts`.
- [ ] T020 [US1] Connect the Worker to shared validation in `apps/ingest-worker/src/index.ts`.
- [ ] T021 [US1] Add SDK-to-Worker integration coverage in `apps/ingest-worker/tests/sdk-ingestion.integration.test.ts`.
- [ ] T022 [US1] Document Cloudflare endpoint configuration in `docs/operations/browser-sdk.md`.

## Phase 4: User Story 2 - Receive high-volume activity safely (Priority: P1)

**Goal**: The Worker authenticates, limits, isolates, and durably persists accepted batches.

**Independent Test**: Mixed valid and abusive traffic persists only valid in-quota batches.

- [ ] T023 [P] [US2] Implement Web Crypto token verification in `apps/ingest-worker/src/auth/token-verifier.ts`.
- [ ] T024 [P] [US2] Implement D1-backed origin authorization in `apps/ingest-worker/src/auth/source-authorizer.ts`.
- [ ] T025 [P] [US2] Implement D1-backed quota evaluation in `apps/ingest-worker/src/quotas/quota-policy.ts`.
- [ ] T026 [P] [US2] Test authorization and quota isolation in `apps/ingest-worker/tests/authorization-and-quotas.test.ts`.
- [ ] T027 [P] [US2] Test pre-persistence rejection in `apps/ingest-worker/tests/early-rejection.test.ts`.
- [ ] T028 [US2] Persist accepted batches to R2 in `apps/ingest-worker/src/ingestion/persist-accepted-batch.ts`.
- [ ] T029 [US2] Map documented status responses in `apps/ingest-worker/src/http/worker-adapter.ts`.
- [ ] T030 [US2] Prove acknowledgement follows R2 write in `apps/ingest-worker/tests/durable-ingestion.integration.test.ts`.
- [ ] T031 [US2] Add Worker load and abuse coverage in `apps/ingest-worker/tests/load/ingestion-smoke.test.ts`.

## Phase 5: User Story 3 - Protect privacy by default (Priority: P1)

**Goal**: Persisted data and observability remain privacy-minimal.

**Independent Test**: Sensitive browser and operational identifiers never appear in object keys, metadata, or logs.

- [ ] T032 [P] [US3] Extend privacy filter tests in `packages/privacy/tests/redaction.test.ts`.
- [ ] T033 [P] [US3] Test R2 object key and metadata privacy in `apps/ingest-worker/tests/r2-privacy.test.ts`.
- [ ] T034 [P] [US3] Test payload-safe observability in `apps/ingest-worker/tests/observability.test.ts`.
- [ ] T035 [US3] Apply privacy filtering before serialization in `apps/ingest-worker/src/ingestion/persist-accepted-batch.ts`.
- [ ] T036 [US3] Exclude raw payloads from D1 state in `apps/ingest-worker/src/storage/d1-repositories.ts`.
- [ ] T037 [US3] Add privacy end-to-end coverage in `apps/ingest-worker/tests/privacy.integration.test.ts`.

## Phase 6: User Story 4 - Prepare for future analysis and AI (Priority: P2)

**Goal**: Stored batches are versioned, isolated, lifecycle-managed, and portable.

**Independent Test**: Two projects produce isolated, schema-valid retained batches.

- [ ] T038 [P] [US4] Serialize trust, consent, and schema metadata in `apps/ingest-worker/src/storage/r2-event-batches.ts`.
- [ ] T039 [P] [US4] Test R2 project partitions in `apps/ingest-worker/tests/project-isolation.test.ts`.
- [ ] T040 [P] [US4] Test schema versions in `apps/ingest-worker/tests/event-contracts.test.ts`.
- [ ] T041 [US4] Document retention and partition conventions in `deploy/cloudflare/wrangler.toml` and `docs/operations/cloudflare.md`.
- [ ] T042 [US4] Update storage mapping in `specs/001-event-collection-foundation/data-model.md`.
- [ ] T043 [US4] Add retained-batch integration coverage in `apps/ingest-worker/tests/retention-and-isolation.integration.test.ts`.

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T044 [P] Document deployment, migrations, bindings, secrets, and rollback in `docs/operations/cloudflare.md`.
- [ ] T045 [P] Document cost and retention guardrails in `docs/operations/cloudflare.md`.
- [ ] T046 [P] Update Cloudflare deployment status in `README.md`.
- [ ] T047 Add a Cloudflare validation script in `scripts/validate-cloudflare-quickstart.sh`.
- [ ] T048 Update real validation outcomes in `specs/001-event-collection-foundation/quickstart.md`.
- [ ] T049 Run quality checks from `package.json`.
- [ ] T050 Review privacy, security, cost, and portability claims in `docs/operations/` and `apps/ingest-worker/`.

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
4. Add privacy controls, then portable retained-data behavior.

## Notes

- All tasks use the required checkbox, ID, optional parallel marker, story label, and exact path format.
- Cloudflare is the only v0.1.0 deployment profile; no GCP or self-hosted implementation tasks are included.

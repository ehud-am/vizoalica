# Tasks: Local Analytics Operations — Web Console Slice

**Input**: Design documents from `/specs/004-local-analytics-operations/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [local API contract](./contracts/local-operations-api.md),
and [quickstart.md](./quickstart.md)

**Scope note**: This iteration implements the local web console and its shared loopback operations
API. The MCP server from User Story 4 is deliberately deferred by the approved plan; its future
adapter MUST call this API rather than the Worker.

**Tests**: Required. The constitution requires risk-appropriate unit, integration, contract, and
end-to-end tests, including negative security tests and WCAG 2.2 AA validation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the two local applications and their reproducible development commands.

- [X] T001 Create workspace manifests and TypeScript/Vite configuration for `apps/local-ops-api/package.json`, `apps/local-ops-api/tsconfig.json`, `apps/admin-web/package.json`, `apps/admin-web/tsconfig.json`, and `apps/admin-web/vite.config.ts`.
- [X] T002 Add `local-ops-api:dev`, `admin-web:dev`, build, typecheck, test, lint, and format scripts to `package.json`.
- [X] T003 [P] Create loopback API source/test directories in `apps/local-ops-api/src/` and `apps/local-ops-api/tests/`.
- [X] T004 [P] Create React console source/test directories in `apps/admin-web/src/{api,components,pages}/` and `apps/admin-web/tests/`.
- [X] T005 [P] Document local launch configuration, file permissions, and credential handling in `apps/local-ops-api/.env.example`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the remote aggregate and administration capabilities, then secure the sole local
connection to them. No user-story work begins until these tasks are complete.

- [X] T006 Create hourly page-view and keyed visitor-presence D1 tables and indexes in `deploy/cloudflare/migrations/0004_local_operations.sql`.
- [X] T007 [P] Extend aggregate and administrative domain types and repository interfaces in `apps/ingest-api/src/domain/types.ts` and `apps/ingest-api/src/storage/repositories.ts`.
- [X] T008 Implement parameterized D1 persistence and fixed-window aggregate reads in `apps/ingest-worker/src/storage/d1-repositories.ts`.
- [X] T009 Update accepted-event aggregation to write hourly page-view and private visitor-digest presence rows in `apps/ingest-worker/src/storage/d1-repositories.ts`.
- [X] T010 Implement Worker routes for project/source mutation, safe snippet metadata, status, and fixed `24h`, `7d`, and `30d` analytics summaries in `apps/ingest-worker/src/http/admin-adapter.ts`.
- [X] T011 Add Worker contract and integration tests for aggregation, fixed windows, no raw-event fallback, project/source isolation, and redaction in `apps/ingest-worker/tests/local-operations.integration.test.ts`.
- [X] T012 Implement user-only configuration loading, strict loopback binding, origin validation, local-session cookies, and structured safe error responses in `apps/local-ops-api/src/config.ts` and `apps/local-ops-api/src/server.ts`.
- [X] T013 Implement the sole credential-owning, timeout-bounded Worker client in `apps/local-ops-api/src/remote-client/worker-client.ts`.
- [X] T014 Add API request schemas and shared response types matching the contract in `apps/local-ops-api/src/contracts.ts`.
- [X] T015 Add foundational negative tests for malformed input, non-loopback binding, disallowed origin, missing/expired session, remote credential leakage, and Worker authorization failures in `apps/local-ops-api/tests/security.test.ts`.

**Checkpoint**: The local API is the only local remote-data client; Worker administration and
aggregates are bounded, private, and testable.

---

## Phase 3: User Story 1 — Inspect Product Analytics Locally (Priority: P1) 🎯 MVP

**Goal**: An authorized operator can view safe page-view and unique-user aggregates for one
website over each supported rolling window without a hosted dashboard.

**Independent Test**: Seed accepted events for two projects, open the local console, select a
website and window, and verify exact scoped aggregates plus distinct processing and unavailable
states without deploying a customer-facing console.

- [X] T016 [P] [US1] Add local API analytics contract tests for valid windows, cross-project rejection, processing labels, unavailable responses, and no digest/raw-event fields in `apps/local-ops-api/tests/analytics.contract.test.ts`.
- [X] T017 [P] [US1] Add Worker integration tests for unique-user deduplication across each rolling window and visitor-digest non-disclosure in `apps/ingest-worker/tests/hourly-analytics.integration.test.ts`.
- [X] T018 [US1] Implement the project/source lookup and fixed-window analytics route in `apps/local-ops-api/src/routes/analytics.ts` using only `worker-client.ts`.
- [X] T019 [P] [US1] Implement typed browser requests that call only loopback API routes in `apps/admin-web/src/api/local-operations.ts`.
- [X] T020 [P] [US1] Implement the project and website selector controls in `apps/admin-web/src/components/WebsiteSelector.tsx`.
- [X] T021 [P] [US1] Implement rolling-window selection and accessible result-status messaging in `apps/admin-web/src/components/AnalyticsSummary.tsx`.
- [X] T022 [US1] Compose analytics loading, empty, complete, processing, expired-access, and unavailable states in `apps/admin-web/src/pages/AnalyticsPage.tsx`.
- [X] T023 [US1] Register the analytics route and local-session bootstrap in `apps/admin-web/src/App.tsx` and `apps/admin-web/src/main.tsx`.
- [X] T024 [US1] Add browser UI tests for the 24-hour, 7-day, 30-day, processing, unavailable, and manipulated cross-project URL flows in `apps/admin-web/tests/analytics.test.tsx`.
- [X] T025 [US1] Add keyboard, semantic-name, focus, contrast, and responsive-reflow accessibility tests for analytics controls in `apps/admin-web/tests/analytics.accessibility.test.tsx`.

**Checkpoint**: User Story 1 is independently usable and safe. This is the MVP boundary.

---

## Phase 4: User Story 2 — Maintain a Project Locally (Priority: P2)

**Goal**: An operator can safely create, update, disable, and inspect websites and their
operational status through the same local API.

**Independent Test**: Create a project and website, review its status, change its allowed origins,
disable it, and confirm the visible result and Worker audit entry are project-scoped.

- [X] T026 [P] [US2] Add Worker contract tests for source update, soft deletion, safe snippet output, status, and audit records in `apps/ingest-worker/tests/admin-operations.test.ts`.
- [X] T027 [P] [US2] Add local API contract tests for project/website CRUD validation, audit outcomes, and interrupted remote maintenance in `apps/local-ops-api/tests/websites.contract.test.ts`.
- [X] T028 [US2] Implement project, website, snippet, status, and maintenance proxy routes in `apps/local-ops-api/src/routes/websites.ts`.
- [X] T029 [US2] Implement audit-safe outcomes and retry guidance for interrupted maintenance requests in `apps/local-ops-api/src/routes/websites.ts`.
- [X] T030 [P] [US2] Implement the website list, create, edit, disable, and soft-delete form controls in `apps/admin-web/src/components/WebsiteForm.tsx` and `apps/admin-web/src/components/WebsiteList.tsx`.
- [X] T031 [P] [US2] Implement safe integration-snippet display and copy feedback without credentials or issued tokens in `apps/admin-web/src/components/IntegrationSnippet.tsx`.
- [X] T032 [P] [US2] Implement collection, aggregation, configuration, and data-access health presentation in `apps/admin-web/src/components/OperationalStatus.tsx`.
- [X] T033 [US2] Compose maintenance actions, confirmation, audit outcome, failure, and retry states in `apps/admin-web/src/pages/WebsitesPage.tsx`.
- [X] T034 [US2] Add browser UI tests for website lifecycle, snippet secrecy, status distinctions, and interrupted-action recovery in `apps/admin-web/tests/websites.test.tsx`.
- [X] T035 [US2] Add keyboard and assistive-technology regression tests for forms, destructive-action confirmations, status announcements, and copy feedback in `apps/admin-web/tests/websites.accessibility.test.tsx`.

**Checkpoint**: User Stories 1 and 2 work through one local API; every mutation is remote-audited
and browser code holds no administrative credential.

---

## Phase 5: User Story 3 — Control Local Access and Credentials (Priority: P3)

**Goal**: An operator can protect the local workspace, rotate/revoke its remote authorization, and
see that follow-up operations are denied.

**Independent Test**: Start with a working local session, revoke its configured remote credential,
and verify that the console receives an understandable denied state without revealing the secret.

- [X] T036 [P] [US3] Add local API tests for session expiry, configuration removal/rotation, revoked remote credentials, and zero credential exposure in `apps/local-ops-api/tests/access-control.test.ts`.
- [X] T037 [US3] Implement safe local credential lifecycle commands and atomic user-only configuration updates in `apps/local-ops-api/src/config.ts` and `apps/local-ops-api/src/cli.ts`.
- [X] T038 [US3] Implement revocation-aware error mapping and local-session invalidation in `apps/local-ops-api/src/server.ts`.
- [X] T039 [US3] Implement console reauthorization guidance and denied-access presentation in `apps/admin-web/src/components/AccessState.tsx` and `apps/admin-web/src/App.tsx`.
- [X] T040 [US3] Add browser UI tests proving revoked or expired access cannot display data or execute maintenance in `apps/admin-web/tests/access-state.test.tsx`.

**Checkpoint**: Revoked access is denied end-to-end and the recovery path is understandable.

---

## Phase 6: User Story 4 — Use the Same Operations Through AI Tools (Priority: P3, Deferred)

**Goal**: Preserve the shared local API as the only future MCP data/administration path.

**Independent Test**: Deferred to the MCP feature iteration; the current slice verifies the
documented API can serve as its sole integration boundary.

- [X] T041 [US4] Document the deferred MCP adapter boundary, supported future operations, and prohibition on direct Worker access in `docs/operations/local-analytics.md`.

**Checkpoint**: The deferred MCP scope is explicit; no MCP transport, tool, or separate business
logic is added in this web-console slice.

---

## Phase 7: Polish and Cross-Cutting Concerns

**Purpose**: Finish operational documentation, portability, verification, and release evidence.

- [X] T042 [P] Document local setup, cost model, backup/recovery, export/migration path, and teardown procedure in `docs/operations/local-analytics.md`.
- [X] T043 [P] Update the user-facing architecture and local-operation guidance in `README.md` and `docs/operations/dashboard.md`.
- [X] T044 [P] Add end-to-end quickstart coverage for the local Worker, API, and console in `apps/admin-web/tests/local-operations.e2e.test.tsx`.
- [X] T045 Add coverage thresholds and CI commands enforcing at least 90% line and branch coverage (with documented exclusions only) in `package.json` and `vitest.config.ts`.
- [X] T046 Run formatting, linting, typechecking, dependency/security scanning, and all feature tests; record results in `specs/004-local-analytics-operations/quickstart.md`.
- [X] T047 Perform and record representative manual keyboard/assistive-technology checks in `specs/004-local-analytics-operations/quickstart.md`.
- [X] T048 Conduct the required pre-release alignment review and contrarian AI QA review; save evidence in `specs/004-local-analytics-operations/release-readiness.md`.

---

## Phase 8: Release-Gate Remediation

**Purpose**: Resolve the repository-wide coverage deficit surfaced by the newly enforced gate.

- [X] T049 Add meaningful tests for previously uncovered repository code until `pnpm coverage` passes at least 90% line and branch coverage without weakening thresholds or excluding application code.

---

## Dependencies and Execution Order

```text
Setup → Foundational → US1 (MVP) → US2 → US3 → Polish
                                  └→ US4 documentation only (MCP implementation deferred)
```

- Setup tasks T001–T005 can begin immediately.
- Foundational tasks T006–T015 depend on the setup and block the web console.
- US1 is the first independently shippable increment and depends on T006–T015.
- US2 builds on the same local API and remote administration boundary after US1.
- US3 depends on the local API/session foundation and validates revocation across US1/US2 routes.
- US4 has no implementation dependency in this slice; T041 documents its future boundary.
- Polish begins after the desired user-story scope is complete.

## Parallel Opportunities

- Setup: T003–T005 can run alongside T001–T002 after paths are agreed.
- Foundational: T006, T007, T012, and T014 touch separate concerns; T011 and T015 can begin once
  their corresponding contracts are stable.
- US1: T016–T017 and T019–T021 are separate test/UI/API workstreams; T024–T025 follow the UI.
- US2: T026–T027 and T030–T032 are parallel once the Worker and API route contracts are fixed.
- US3: T036 can be prepared alongside the local credential-lifecycle implementation.
- Polish: T042–T044 can run in parallel; T046–T048 require completed implementation evidence.

## Implementation Strategy

### MVP first

1. Complete Phases 1 and 2.
2. Deliver and independently validate US1 (T016–T025).
3. Stop for a local end-to-end privacy, authorization, and accessibility review before adding
   maintenance functionality.

### Incremental delivery

1. Add US2 for website lifecycle and operational maintenance.
2. Add US3 for credential/session revocation and recovery.
3. Keep MCP implementation out of this slice; use T041 to make the next feature’s API dependency
   explicit.
4. Complete cross-cutting release gates and retain the evidence.

## Format Validation

Every implementation task above uses the required checklist format: checkbox, sequential ID,
optional `[P]` marker only where work is independently parallelizable, user-story label for
story-specific work, and an exact repository file path.

# Tasks: Secure Admin and MCP Access

**Input**: Design documents from `/specs/002-admin-mcp-access/`

## Phase 1: Setup

- [X] T001 Add the MCP TypeScript SDK dependency and update lockfile in `package.json` and `pnpm-lock.yaml`
- [ ] T002 [P] Add operator/MCP deployment guidance in `docs/operations/cloudflare.md`

## Phase 2: Foundational

- [X] T003 Add the `administrative_audit` table, source policy reference, and rollup index in `deploy/cloudflare/migrations/0002_admin_mcp.sql`
- [X] T004 Add administrator secret configuration and environment typing in `apps/ingest-worker/src/config.ts` and `apps/ingest-worker/src/env.ts`
- [X] T005 [P] Implement constant-time administrator bearer verification in `apps/ingest-worker/src/auth/admin-verifier.ts`
- [ ] T006 Extend project/source, aggregate, and audit repository interfaces in `apps/ingest-api/src/domain/types.ts` and `apps/ingest-api/src/storage/repositories.ts`
- [ ] T007 Implement fixed, parameterized D1 administration, aggregate, and audit methods in `apps/ingest-worker/src/storage/d1-repositories.ts`
- [ ] T008 Prefer source-specific policies during ingestion in `apps/ingest-api/src/ingestion/pipeline.ts`
- [ ] T009 Require the administrator secret in `scripts/deploy-check.sh` and `deploy/cloudflare/wrangler.example.toml`

## Phase 3: User Story 1 - Configure an analytics website (Priority: P1)

**Goal**: An authenticated operator can create/list projects and sources and disable a source.

**Independent Test**: Create two isolated project/source pairs; deny unauthenticated changes and
confirm disabling one source does not affect the other.

- [ ] T010 [P] [US1] Add admin credential, origin validation, isolation, and disable tests in `apps/ingest-worker/tests/admin-routes.test.ts`
- [ ] T011 [US1] Implement protected project/source administration routes in `apps/ingest-worker/src/http/admin-adapter.ts`
- [ ] T012 [US1] Mount administration routes without browser CORS in `apps/ingest-worker/src/http/worker-adapter.ts` and `apps/ingest-worker/src/index.ts`
- [ ] T013 [US1] Add source-policy ingestion coverage in `apps/ingest-worker/tests/durable-ingestion.integration.test.ts`

## Phase 4: User Story 2 - Inspect basic analytics through MCP (Priority: P2)

**Goal**: An authenticated MCP client can list websites and retrieve bounded source page-view totals.

**Independent Test**: Return one source's aggregate counts while rejecting cross-project,
unauthenticated, and over-31-day requests.

- [ ] T014 [P] [US2] Add MCP discovery, authentication, range, isolation, and privacy tests in `apps/ingest-worker/tests/mcp.test.ts`
- [ ] T015 [US2] Implement the two stateless read-only MCP tools in `apps/ingest-worker/src/http/mcp-adapter.ts`
- [ ] T016 [US2] Mount `/mcp` before ingestion fallback in `apps/ingest-worker/src/http/worker-adapter.ts` and `apps/ingest-worker/src/index.ts`

## Phase 5: User Story 3 - Audit administrative access (Priority: P3)

**Goal**: Allowed and denied administration/MCP operations have privacy-safe audit records.

**Independent Test**: Inspect one allowed and denied record and confirm prohibited fields are absent.

- [ ] T017 [P] [US3] Add safe allowed/denied audit tests in `apps/ingest-worker/tests/admin-audit.test.ts`
- [ ] T018 [US3] Record safe audit outcomes from `apps/ingest-worker/src/http/admin-adapter.ts` and `apps/ingest-worker/src/http/mcp-adapter.ts`

## Phase 6: Polish

- [ ] T019 Update `docs/operations/cloudflare.md` with the final admin/MCP setup, rotation, and bounded-query workflow
- [ ] T020 Run `pnpm run validate`, deploy preflight, and all scenarios in `specs/002-admin-mcp-access/quickstart.md`

## Dependencies & Execution Order

- Setup T001-T002 precedes foundational T003-T009.
- T003-T009 block US1 and US2.
- US1 is the MVP. US2 requires the shared repository and authentication foundation; US3 follows the adapters.
- T019-T020 follow all desired stories.

## Parallel Opportunities

- T002, T005, T006, T010, T014, and T017 can run in parallel when their prerequisites are met.

## Implementation Strategy

1. Implement and validate US1 to create safely isolated website configurations.
2. Add read-only MCP aggregate querying with the same operator credential.
3. Add audit assertions and complete operational validation.

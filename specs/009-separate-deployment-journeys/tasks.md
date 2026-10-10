# Tasks: Separate Deployment Journeys

**Input**: Design documents from `/specs/009-separate-deployment-journeys/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Focused contract and integration tests are required because the specification requires
objective fresh-schema rejection, baseline completeness, and cross-document consistency.

**Organization**: Tasks are grouped by user story so each journey remains independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes a different file and has no incomplete dependency
- **[Story]**: Maps the task to US1, US2A, US2B, or US3

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish test coverage and confirm repository hygiene before behavior changes.

- [X] T001 Verify Git, Node, Docker, ESLint, Prettier, and npm ignore coverage against the implementation plan in `.gitignore`, `.dockerignore`, `eslint.config.js`, `.prettierignore`, and `.npmignore`
- [X] T002 [P] Add failing fresh-baseline and schema-inspection contract tests in `apps/deploy-cli/tests/contract/fresh-schema.contract.test.ts`
- [X] T003 [P] Add failing four-journey and fresh-only documentation contract tests in `apps/deploy-cli/tests/contract/deployment-docs.contract.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the shared non-destructive database freshness guard before any journey is
rewritten around the fresh-only promise.

- [X] T004 Implement bounded D1 inspection parsing and the known-schema table set in `apps/deploy-cli/src/fresh-schema.ts`
- [X] T005 Add the read-only `d1.schema.inspect` operation and Wrangler command mapping in `apps/deploy-cli/src/types.ts` and `apps/deploy-cli/src/providers/provider.ts`
- [X] T006 Enforce fresh-schema inspection during profile preflight and immediately before apply in `apps/deploy-cli/src/commands/preflight.ts` and `apps/deploy-cli/src/commands/apply.ts`
- [X] T007 Add native freshness inspection in `scripts/check-fresh-d1.ts`, expose it through `package.json`, and call it from `scripts/deploy-check.sh` and `scripts/deploy-apply.sh`
- [X] T008 Update deployment fixtures and tests for empty, existing, ambiguous, and rechecked schema states in `apps/deploy-cli/tests/support.ts`, `apps/deploy-cli/tests/contract/onecli-provider.contract.test.ts`, and `apps/deploy-cli/tests/integration/apply-verify.test.ts`

**Checkpoint**: Both deployment paths fail closed on existing or ambiguous D1 schema before their
first mutation.

---

## Phase 3: User Story 1 - Set Up the Customer Backend (Priority: P1) 🎯 MVP

**Goal**: Provide one complete fresh-backend journey that runs once per customer environment and
produces a redacted handoff for later stories.

**Independent Test**: Starting with an empty target and US1 prerequisites, a tester can initialize
the current schema, deploy, verify health, and identify all handoff values using only US1.

- [X] T009 [US1] Replace the historical SQL sequence with the complete fresh schema in `deploy/cloudflare/migrations/0001_initial.sql` and remove `deploy/cloudflare/migrations/0002_admin_mcp.sql`, `0003_dashboard.sql`, `0004_local_operations.sql`, and `0005_dashboard_visual_refresh.sql`
- [X] T010 [US1] Rewrite the scope, frequency, prerequisites, ordered setup, checkpoints, fresh-only stop, recovery, and handoff in `docs/operations/cloudflare.md`
- [X] T011 [P] [US1] Align migration cost terminology with the fresh baseline in `docs/operations/cost-model.md` and `scripts/dashboard-performance-fixture.mjs`
- [X] T012 [P] [US1] Replace upgrade-era migration guidance with fresh-only release policy in `docs/operations/releases.md`, `docs/releases/v0.5.0.md`, and `docs/operations/public-release.md`
- [X] T013 [US1] Update backend and interrupted-deployment diagnostics for the freshness guard in `docs/operations/troubleshooting.md`
- [X] T014 [US1] Run the fresh-schema and US1 documentation contract tests in `apps/deploy-cli/tests/contract/fresh-schema.contract.test.ts` and `apps/deploy-cli/tests/contract/deployment-docs.contract.test.ts`

**Checkpoint**: US1 is complete and independently testable for a new customer backend.

---

## Phase 4: User Story 2A - Set Up an Operator Workstation (Priority: P2)

**Goal**: Provide one complete direct-credential workstation journey, run once per operator who
does not use OneCLI.

**Independent Test**: Given only the US1 handoff and administrator credential access, a tester can
configure, start, verify, stop, and remove a local direct-credential console using only US2A.

- [X] T015 [US2A] Rewrite `docs/operations/local-analytics.md` as the self-contained non-OneCLI workstation journey with direct credential storage, loopback boundaries, console verification, lifecycle, and scoped troubleshooting
- [X] T016 [US2A] Extend documentation contract coverage for US2A completeness and mutual exclusivity in `apps/deploy-cli/tests/contract/deployment-docs.contract.test.ts`

**Checkpoint**: US2A reaches a verified local console without OneCLI instructions or hidden setup
steps.

---

## Phase 5: User Story 2B - Set Up an Operator Workstation with OneCLI (Priority: P2)

**Goal**: Provide one complete OneCLI workstation journey, run once per operator who selects that
credential path.

**Independent Test**: Given only the US1 handoff and an authorized OneCLI environment, a tester can
configure the dedicated grant, start and verify the console, and revoke access using only US2B.

- [X] T017 [US2B] Rewrite `docs/operations/ops-cli.md` as the self-contained OneCLI workstation journey with guided setup, narrow grant, placeholder configuration, gateway checks, console verification, fail-closed behavior, and revocation
- [X] T018 [US2B] Extend documentation contract coverage for US2B completeness, safe placeholder handling, and no implicit fallback in `apps/deploy-cli/tests/contract/deployment-docs.contract.test.ts`

**Checkpoint**: US2B reaches the same verified console outcome as US2A while keeping the real
administrator credential out of local Vizoalica configuration.

---

## Phase 6: User Story 3 - Connect One Website (Priority: P3)

**Goal**: Provide one complete website journey that repeats once for every website and proves
content, token scope, a real event, and host-site resilience.

**Independent Test**: Given the US1/operator handoff and control of one website, a tester can
register, deploy, and verify collection using only US3.

- [X] T019 [US3] Rewrite `docs/operations/pages.md` with per-website frequency, registration inputs, SDK and trusted token issuer setup, Git/Direct Upload deployment, consent, verification, rotation, removal, and repeat guidance
- [X] T020 [P] [US3] Align the advanced integration reference and example entry point with the self-contained website journey in `docs/operations/browser-sdk.md` and `examples/cloudflare-pages/README.md`
- [X] T021 [US3] Extend documentation contract coverage for website registration, secret boundaries, real-event proof, and failure isolation in `apps/deploy-cli/tests/contract/deployment-docs.contract.test.ts`

**Checkpoint**: US3 can be repeated for another website without rerunning US1, US2A, or US2B.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Make story selection authoritative, remove contradictions, and run all release gates.

- [X] T022 Update the authoritative story order, frequency matrix, credential lanes, fresh-only release boundary, and handoff flow in `README.md`
- [X] T023 Audit active Markdown and scripts for retired migration names, upgrade/backfill/rollback instructions, cross-story dependencies, and inconsistent story labels across `README.md`, `docs/`, `scripts/`, and `deploy/`
- [X] T024 Run focused deployment CLI, website, and documentation tests plus shell syntax and baseline validation from `specs/009-separate-deployment-journeys/quickstart.md`
- [X] T025 Run `pnpm format:check`, `pnpm lint`, `pnpm validate`, `pnpm build`, and `pnpm coverage`, resolving all regressions while preserving repository-wide 90% line and branch coverage
- [X] T026 Record final verification evidence and any manual-only release checks in `specs/009-separate-deployment-journeys/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on the failing contract tests from Phase 1 and blocks all
  journey promises about safe fresh deployment.
- **US1 (Phase 3)**: Depends on the foundational freshness guard.
- **US2A and US2B (Phases 4-5)**: Depend on the stable US1 handoff contract but are alternatives
  and independently testable after that handoff exists.
- **US3 (Phase 6)**: Depends on the US1 handoff and one working operator path for website
  registration, but does not depend on both US2 paths.
- **Polish (Phase 7)**: Depends on all four journeys.

### User Story Dependencies

```text
US1 ──┬── US2A ──┐
      │          ├── US3
      └── US2B ──┘
```

Each primary guide remains independently executable once its explicitly documented input handoff
is supplied.

### Parallel Opportunities

- T002 and T003 can be authored in parallel.
- T011 and T012 can proceed in parallel after the baseline shape is known.
- US2A and US2B document different files and can proceed in parallel after US1.
- T020 can proceed alongside the main US3 guide after its terminology is fixed.

## Parallel Examples

### User Story 1

```text
Task: "Align fresh-baseline cost terminology in docs/operations/cost-model.md"
Task: "Replace upgrade-era release guidance in docs/operations/releases.md"
```

### Operator Alternatives

```text
Task: "Complete US2A in docs/operations/local-analytics.md"
Task: "Complete US2B in docs/operations/ops-cli.md"
```

## Implementation Strategy

### MVP First

1. Add failing safety and documentation tests.
2. Implement the shared fresh-schema guard.
3. Consolidate the schema baseline.
4. Complete and validate US1 as the first deployable documentation increment.

### Incremental Delivery

1. US1: one safe fresh backend and redacted handoff.
2. US2A: direct local workstation option.
3. US2B: OneCLI local workstation option.
4. US3: repeatable website collection.
5. README selection, consistency audit, and full release gates.

## Notes

- All cloud-facing tests use mocks or local SQLite; no task authorizes a real customer mutation.
- The checklist in `checklists/requirements.md` is a read-only implementation gate.
- Tasks must be marked `[X]` only after their described change and verification complete.

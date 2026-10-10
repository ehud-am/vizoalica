# Tasks: OneCLI Cloudflare Credentials

**Input**: Design documents from `/specs/005-onecli-cloudflare-credentials/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Security, contract, integration, and end-to-end tests are required by FR-020 and the
project constitution. Test tasks precede their corresponding implementation tasks.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified as
an independent increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it targets different files with no incomplete dependency.
- **[Story]**: Maps the task to the corresponding prioritized user story.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the deployment CLI workspace and non-secret configuration surface.

- [X] T001 Create the deployment CLI package and compiler configuration in `apps/deploy-cli/package.json` and `apps/deploy-cli/tsconfig.json`.
- [X] T002 Register deployment CLI build and command scripts plus the TypeScript project reference in `package.json` and `tsconfig.json`.
- [X] T003 [P] Add the versioned non-secret example profile and ignore active operator artifacts in `deploy/cloudflare/deployment-profile.example.json` and `.gitignore`.
- [X] T004 [P] Add reusable fake-process and temporary-state test support in `apps/deploy-cli/tests/support.ts`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the shared types, validation, safe process boundary, planning, and audit
infrastructure required by every user story.

**⚠️ CRITICAL**: No user story work begins until these security-sensitive foundations pass tests.

- [X] T005 [P] Add contract tests for valid OneCLI/native profiles and rejected secret, mixed-provider, and malformed fields in `apps/deploy-cli/tests/contract/profile.contract.test.ts`.
- [X] T006 [P] Add unit tests for credential redaction, bounded output, shell-free arguments, ambient Cloudflare credential removal, timeout, and interruption in `apps/deploy-cli/tests/unit/process-security.test.ts`.
- [X] T007 Define deployment profiles, health states, plans, receipts, results, audit records, operations, and stable errors in `apps/deploy-cli/src/types.ts`.
- [X] T008 Implement strict profile/config loading, atomic user-only writes, safe path handling, and Wrangler target parsing in `apps/deploy-cli/src/config.ts`.
- [X] T009 [P] Implement credential and authorization-data redaction with allowlisted safe messages in `apps/deploy-cli/src/redaction.ts`.
- [X] T010 Implement the bounded shell-free child-process runner, environment sanitizer, timeout handling, and injectable test executor in `apps/deploy-cli/src/process.ts`.
- [X] T011 [P] Define the credential-provider interface, closed Wrangler operation catalog, and stable failure mapping in `apps/deploy-cli/src/providers/provider.ts`.
- [X] T012 Implement canonical plan/profile/config digests and 15-minute receipt validation primitives in `apps/deploy-cli/src/plan.ts`.
- [X] T013 [P] Implement operator-only allowlisted NDJSON audit append/read/prune behavior in `apps/deploy-cli/src/audit.ts`.
- [X] T014 Implement shared CLI argument parsing, JSON/human rendering, exit-code mapping, and help output in `apps/deploy-cli/src/cli.ts`.

**Checkpoint**: Profiles, processes, artifacts, and audit records can be handled without accepting or
leaking credential values.

---

## Phase 3: User Story 1 - Connect Cloudflare without exposing a token (Priority: P1) 🎯 MVP

**Goal**: Select and validate one deterministic OneCLI Cloudflare connection and run non-mutating
deployment checks without Vizoalica receiving the raw token or falling back to native credentials.

**Independent Test**: Configure a test OneCLI profile, generate a local plan, run preflight through
fake OneCLI/Wrangler processes, verify the expected account and grants, and assert that raw and
ambient token sentinels appear nowhere in commands, artifacts, output, or audit records.

### Tests for User Story 1

- [X] T015 [P] [US1] Add OneCLI inspection contract tests for version, project, connection, attached grant, effective credential, agent identity, and ambiguity in `apps/deploy-cli/tests/contract/onecli-provider.contract.test.ts`.
- [X] T016 [P] [US1] Add configure and local plan command tests for user-only files, deterministic digests, forbidden secret flags, replacement, and native/OneCLI discrimination in `apps/deploy-cli/tests/integration/configure-plan.test.ts`.
- [X] T017 [P] [US1] Add preflight integration tests for healthy access and each safe failure category in `apps/deploy-cli/tests/integration/preflight.test.ts`.
- [X] T018 [US1] Add an explicit no-fallback and zero-credential-exposure test with hostile ambient variables and upstream output in `apps/deploy-cli/tests/integration/no-fallback.test.ts`.

### Implementation for User Story 1

- [X] T019 [US1] Implement OneCLI version/auth/connection/grant/effective-access inspection and wrapped Wrangler execution in `apps/deploy-cli/src/providers/onecli.ts`.
- [X] T020 [P] [US1] Implement non-secret interactive/non-interactive profile creation and replacement in `apps/deploy-cli/src/commands/configure.ts`.
- [X] T021 [P] [US1] Implement offline closed-catalog deployment plan generation in `apps/deploy-cli/src/commands/plan.ts`.
- [X] T022 [US1] Implement account/resource/secret/dry-run preflight and receipt creation in `apps/deploy-cli/src/commands/preflight.ts`.
- [X] T023 [US1] Wire `configure`, `plan`, and `check` command dispatch in `apps/deploy-cli/src/index.ts`.
- [X] T024 [US1] Route `deploy:configure`, `deploy:plan`, and existing `deploy:check` entry points through the new CLI in `package.json` and `scripts/deploy-check.sh`.

**Checkpoint**: User Story 1 is independently usable as the safe OneCLI connection and preflight
MVP, with no Cloudflare mutation.

---

## Phase 4: User Story 2 - Deploy through a least-privilege connection (Priority: P2)

**Goal**: Bind approved mutations to the reviewed plan and current OneCLI authorization while
preserving native-provider compatibility and safe interruption recovery.

**Independent Test**: Approve a current test plan, apply it through a least-privilege fake OneCLI
connection, verify migrations precede Worker deployment, then prove stale approval, denied tools,
account changes, and interruptions stop safely with accurate completed/pending operations.

### Tests for User Story 2

- [X] T025 [P] [US2] Add plan/receipt contract tests for approval matching, expiry, tampering, actor/provider/account/config binding, and state transitions in `apps/deploy-cli/tests/contract/plan-receipt.contract.test.ts`.
- [X] T026 [P] [US2] Add apply/verify integration tests for operation ordering, revalidation, least-privilege denial, partial completion, timeout, health failure, and safe retry guidance in `apps/deploy-cli/tests/integration/apply-verify.test.ts`.
- [X] T027 [P] [US2] Add Cloudflare-native compatibility tests proving explicit provider selection and unchanged wrapper behavior in `apps/deploy-cli/tests/integration/native-provider.test.ts`.

### Implementation for User Story 2

- [X] T028 [US2] Complete receipt creation, persistence, expiry, and exact binding checks in `apps/deploy-cli/src/plan.ts`.
- [X] T029 [P] [US2] Implement the Cloudflare-native adapter through the shared operation/redaction contract in `apps/deploy-cli/src/providers/cloudflare-native.ts`.
- [X] T030 [US2] Implement explicit approval, immediate access/account recheck, ordered migrations/deploy, and partial-result reporting in `apps/deploy-cli/src/commands/apply.ts`.
- [X] T031 [P] [US2] Implement bounded HTTPS Worker health verification in `apps/deploy-cli/src/commands/verify.ts`.
- [X] T032 [US2] Wire `apply` and `verify` dispatch and compatibility entry points in `apps/deploy-cli/src/index.ts`, `scripts/deploy-apply.sh`, and `scripts/deploy-verify.sh`.
- [X] T033 [US2] Document the minimum Cloudflare permissions and OneCLI allow/approval matrix in `docs/operations/cloudflare.md`.

**Checkpoint**: User Stories 1 and 2 independently support reviewed, approved, least-privilege
deployment through either explicit provider.

---

## Phase 5: User Story 3 - Rotate, revoke, and recover access (Priority: P3)

**Goal**: Make rotation transparent, revocation immediate at the provider boundary, and recovery or
retry understandable without changing profiles or exposing old credentials.

**Independent Test**: Reuse an unchanged profile after simulated token rotation, revoke/detach its
connection and verify immediate denial, attach a valid same-account replacement, and confirm status
and pruned audit evidence accurately describe each outcome.

### Tests for User Story 3

- [X] T034 [P] [US3] Add rotation, detach, revocation, same-account recovery, different-account denial, and local/CI identity tests in `apps/deploy-cli/tests/integration/credential-lifecycle.test.ts`.
- [X] T035 [P] [US3] Add status, allowlisted audit serialization, user-only permission, and 90-day retention tests in `apps/deploy-cli/tests/integration/status-audit.test.ts`.

### Implementation for User Story 3

- [X] T036 [US3] Add lifecycle-aware OneCLI health mapping and pre-mutation effective-access revalidation in `apps/deploy-cli/src/providers/onecli.ts` and `apps/deploy-cli/src/commands/apply.ts`.
- [X] T037 [P] [US3] Implement local safe status reporting in `apps/deploy-cli/src/commands/status.ts` and wire it in `apps/deploy-cli/src/index.ts`.
- [X] T038 [US3] Complete audit retention pruning and lifecycle outcome recording in `apps/deploy-cli/src/audit.ts` and all command handlers in `apps/deploy-cli/src/commands/`.
- [X] T039 [US3] Document OneCLI rotation, revocation, compromised-machine recovery, provider migration, rollback, and CI identity separation in `docs/operations/cloudflare.md`.

**Checkpoint**: All three user stories are independently functional and credential lifecycle is
covered end to end.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Complete the agent workflow, documentation, end-to-end validation, coverage, and
release evidence across all stories.

- [X] T040 Create and validate the concise versioned deployment skill with its human approval stop in `.agents/skills/vizoalica-cloudflare-deploy/SKILL.md`.
- [X] T041 [P] Update architecture, setup, cost, security responsibility, backup, and teardown guidance in `README.md` and `docs/operations/cloudflare.md`.
- [X] T042 Add a fake-binary end-to-end test covering configure → plan → check → apply → verify → status in `apps/deploy-cli/tests/e2e/deployment-flow.test.ts`.
- [X] T043 Add focused tests for any uncovered deployment CLI branches until `pnpm coverage` remains above 90% for lines and branches without exclusions in `apps/deploy-cli/tests/`.
- [X] T044 Run formatting, linting, type checking, all tests, production builds, coverage, dependency audit, and contract validation; record evidence in `specs/005-onecli-cloudflare-credentials/quickstart.md`.
- [X] T045 Conduct alignment and contrarian security QA review covering credential exposure, provider fallback, account isolation, approval bypass, interruption, and revocation; record it in `specs/005-onecli-cloudflare-credentials/release-readiness.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks all stories.
- **User Story 1 (Phase 3)**: Depends on Foundational and establishes the OneCLI MVP.
- **User Story 2 (Phase 4)**: Depends on the plan/preflight surface from US1.
- **User Story 3 (Phase 5)**: Depends on provider inspection and apply revalidation from US1/US2.
- **Polish (Phase 6)**: Depends on all stories.

### User Story Dependencies

- **US1 (P1)**: No story dependency after Foundational; independently delivers safe connection and
  preflight.
- **US2 (P2)**: Uses US1's provider and plan artifacts but remains independently testable with a
  prebuilt valid profile/receipt.
- **US3 (P3)**: Uses the shared provider and audit interfaces but remains independently testable
  through lifecycle state changes.

### Within Each User Story

- Write contract, unit, and integration tests before implementation.
- Implement shared entities before providers and commands.
- Validate provider state before Cloudflare operations.
- Generate and review a plan before preflight receipt or mutation.
- Recheck authorization immediately before mutation.
- Complete each story checkpoint before moving to the next priority.

### Parallel Opportunities

- T003 and T004 can run in parallel after T001/T002.
- T005 and T006 can run in parallel; T009, T011, and T013 target independent foundations.
- T015–T017 can be prepared in parallel before T018 integrates their security guarantees.
- T020 and T021 can run in parallel after shared foundations.
- T025–T027 can run in parallel; T029 and T031 target separate provider/verification files.
- T034 and T035 can run in parallel; T037 can proceed separately from provider lifecycle work.
- T041 can proceed alongside the final end-to-end test once command behavior is stable.

---

## Parallel Example: User Story 1

```text
Task: "Add OneCLI inspection contract tests in apps/deploy-cli/tests/contract/onecli-provider.contract.test.ts"
Task: "Add configure and plan tests in apps/deploy-cli/tests/integration/configure-plan.test.ts"
Task: "Add preflight failure-category tests in apps/deploy-cli/tests/integration/preflight.test.ts"
```

## Parallel Example: User Story 2

```text
Task: "Add plan and receipt contract tests in apps/deploy-cli/tests/contract/plan-receipt.contract.test.ts"
Task: "Add apply and verify tests in apps/deploy-cli/tests/integration/apply-verify.test.ts"
Task: "Add native-provider compatibility tests in apps/deploy-cli/tests/integration/native-provider.test.ts"
```

## Parallel Example: User Story 3

```text
Task: "Add credential lifecycle tests in apps/deploy-cli/tests/integration/credential-lifecycle.test.ts"
Task: "Add status and audit retention tests in apps/deploy-cli/tests/integration/status-audit.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup and Foundational phases.
2. Implement OneCLI inspection, profile creation, offline planning, and non-mutating preflight.
3. Validate zero credential exposure and strict no-fallback behavior.
4. Demonstrate safe account identification without any Cloudflare mutation.

### Incremental Delivery

1. Foundation → safe typed process and artifact boundary.
2. US1 → OneCLI connection and preflight MVP.
3. US2 → approved least-privilege deployment and native compatibility.
4. US3 → rotation, revocation, status, and recovery.
5. Polish → versioned skill, documentation, full QA, and release evidence.

### Single-Run Execution

The user requested the complete specification in one run. Execute every phase sequentially, use
the marked parallel opportunities only where file ownership remains independent, and stop only for
an actual external authorization boundary or an unrecoverable failed gate.

## Notes

- Completed tasks must be marked `[X]` immediately after verification.
- Never add real credentials to tests, fixtures, command history, or generated artifacts.
- Live Cloudflare mutation is not part of automated implementation validation; use fake processes
  and an isolated non-production manual quickstart for that boundary.
- Do not infer deployment approval from the presence of a valid OneCLI connection or credential.

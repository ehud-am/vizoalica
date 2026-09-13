# Tasks: Quality and Simplicity Patch Release (v0.5.2) — Iteration 1 (QA/Deployment Engineer)

**Input**: Design documents from `/specs/011-quality-simplicity-release/`

**Scope of this task list**: User Stories 1-3 only (the deployment-engineer review iteration),
per the confirmed check-in cadence. User Stories 4 (security) and 5 (docs alignment) get their
own tasks.md amendment at their respective check-ins, since their scope depends on this
iteration's findings.

**Tests**: Included — the constitution requires automated tests for new/modified behavior and
negative tests for security-relevant paths (credential/config handling).

## Phase 1: Setup

- [ ] T001 Confirm `pnpm exec wrangler whoami` and `gh auth status` succeed in the working
      environment (already verified during planning; re-confirm before hands-on work).
- [ ] T002 [P] Create a throwaway Cloudflare Pages project and a throwaway GitHub repo to use as
      the Phase 1 validation target, so `ehud-am/gitlocal` is only touched once the design is
      proven and the user has given explicit go-ahead.

## Phase 2: Foundational

**⚠️ BLOCKS all user stories below**

- [ ] T003 Write `.github/workflows/deploy-vizoalica-pages.yml` as a `workflow_call` reusable
      workflow implementing the contract in
      `specs/011-quality-simplicity-release/contracts/deploy-workflow-contract.md`: input
      validation (fail-fast on missing/malformed vars/secrets), second checkout of this repo at
      the pinned ref, copy of `functions/vizoalica/*.ts` + `vizoalica-loader.js` into the site
      directory, ephemeral `wrangler.toml` generation, `wrangler pages secret put`, `wrangler
      pages deploy`.
- [ ] T004 [P] Add a lint/dry-run check for the new workflow YAML to
      `.github/workflows/ci.yml` (e.g. `actionlint`) so malformed workflow syntax is caught the
      same way other code is linted.

**Checkpoint**: reusable workflow exists and passes YAML lint; ready for story work.

## Phase 3: User Story 1 - Automated Website Deployment for Customers (P1) 🎯 MVP

**Goal**: A customer push to their site path deploys their site + vizoalica Functions to
Cloudflare Pages automatically, with zero real config values in their committed source.

**Independent Test**: Follow `quickstart.md` steps 1-3 and the "Expected failure-path check"
against the throwaway repo from T002.

### Implementation for User Story 1

- [ ] T005 [US1] Implement the variable/secret presence + format validation step in the workflow
      (fail with the exact missing/malformed name — FR-004), matching the existing validation
      logic already present in `examples/cloudflare-pages/functions/vizoalica/config.json.ts`
      (`validIdentity`, `validHttpUrl`) and `.../ingest-token.ts` so the workflow rejects the same
      malformed inputs the Functions would reject at runtime, just earlier.
- [ ] T006 [US1] Implement the ephemeral `wrangler.toml` generation step (research.md, Unknown 1)
      — write to the job's temp workspace only, never to a path that gets committed.
- [ ] T007 [US1] Implement the Functions/loader vendoring step (research.md, Unknown 2) copying
      from the pinned-ref checkout into the site's build output.
- [ ] T008 [US1] Implement the `wrangler pages secret put VIZOALICA_TOKEN_SECRET` and `wrangler
      pages deploy` steps, surfacing `wrangler`'s own success/failure output as the job's
      status (no swallowed errors).
- [ ] T009 [US1] Run `quickstart.md`'s validation steps 1-3 and the failure-path check against the
      throwaway repo/project from T002; fix issues found.
- [ ] T010 [US1] Confirm the existing static integration path (a website not using the new
      workflow) is unaffected — run the existing `apps/deploy-cli` and `scripts/verify-website.ts`
      checks against a static-mode test website (FR-005 regression guard).

**Checkpoint**: User Story 1 independently deployed and validated against a throwaway repo.

---

## Phase 4: User Story 2 - Clear Console Guidance for Connecting a Website (P2)

**Goal**: The console's website integration panel leads with CI/CD variable/secret guidance and
shows live reachability status instead of a raw shell-command wall.

**Independent Test**: `quickstart.md` step 4; a first-time operator can identify the required
values and current status from the console alone.

### Tests for User Story 2

- [ ] T011 [P] [US2] Unit test for the new config-endpoint reachability check in
      `apps/local-ops-api/tests/` (mock fetch: reachable, unreachable, malformed-response cases).
- [ ] T012 [P] [US2] Component test update in `apps/admin-web/tests/` for the redesigned
      `IntegrationSnippet.tsx` (renders CI/CD checklist as primary path; shows reachability
      status; static-mode panel still renders unchanged).

### Implementation for User Story 2

- [ ] T013 [US2] Add the config-endpoint reachability check to `apps/local-ops-api/src/routes/`
      per `data-model.md`'s `configEndpointReachable`/`configEndpointCheckedAt`/
      `configEndpointError` fields, following the existing pattern of `apps/local-ops-api`
      brokering outbound calls (see `snippet.ts` for the existing route style).
- [ ] T014 [US2] Rewrite `apps/local-ops-api/src/routes/snippet.ts` to emit the required
      variables/secrets list + the starter workflow YAML snippet (from the contract) instead of
      the `steps[]` shell-command generator, keeping the static-mode snippet output unchanged.
- [ ] T015 [US2] Redesign `apps/admin-web/src/components/IntegrationSnippet.tsx`: CI/CD panel
      leads with the copyable variables/secrets checklist and starter workflow snippet; replace
      the vague `safely()` catch-all error text for this panel with specific messages.
- [ ] T016 [US2] Update `apps/admin-web/src/pages/WebsitesPage.tsx` to surface
      `configEndpointReachable`/`configEndpointCheckedAt` per website.
- [ ] T017 [US2] WCAG 2.2 AA pass on the redesigned panel (keyboard operability, accessible
      names, visible focus, status not conveyed by color alone) — constitution's Accessible
      Product Experience section requires this for material interface changes.
- [ ] T018 [US2] Run `pnpm --filter @vizoalica/admin-web test:e2e` against the updated pages.

**Checkpoint**: Console panel redesigned, tested, and accessible; User Stories 1 and 2 both work
independently and together.

---

## Phase 5: User Story 3 - One-Command Backend and Operator Setup (P3)

**Goal**: Backend + operator console setup collapses into one linear, timeable sequence.

**Independent Test**: `quickstart.md`-style timed run of the consolidated sequence from a fresh
Cloudflare account.

### Implementation for User Story 3

- [ ] T019 [US3] Extend `scripts/vizoalica-ops.ts` (building on the already-committed `status`
      command) with the missing linking steps identified by re-reading
      `docs/operations/cloudflare.md` end-to-end, so the ~9 backend stages collapse into a short
      numbered script-driven sequence.
- [ ] T020 [US3] Rewrite `docs/operations/pages.md` around the new CI/CD path as the primary
      route, keeping the static path documented as the supported fallback (FR-005).
- [ ] T021 [US3] Update `docs/operations/cloudflare.md` and `docs/operations/releases.md` to
      reference the consolidated sequence from T019.
- [ ] T022 [US3] Time the full backend+operator+website sequence end-to-end (real run, not
      estimated) and record the result against SC-001's 5-minute target; iterate on T019/T020 if
      over budget.

**Checkpoint**: All three Phase 1 user stories independently functional; SC-001 measured.

---

## Phase N: Polish & Cross-Cutting (this iteration)

- [ ] T023 [P] Update `apps/deploy-cli` only if T019-T022 reveal a genuine gap the script can't
      cover cleanly (e.g., a `deploy website` companion subcommand that prints the exact
      variables/secrets for a given project) — do not add speculative CLI surface.
- [ ] T024 Run `pnpm validate` and `pnpm coverage`; confirm coverage stays >90% per the
      constitution's Development Workflow gate.
- [ ] T025 Write the Phase 1 findings/changes summary for the user check-in (per the overall
      plan's cadence) before starting the security-architect iteration (User Story 4).

## Dependencies & Execution Order

- Setup (T001-T002) → Foundational (T003-T004, blocks everything else) → US1 (T005-T010) → US2
  (T011-T018, can start once US1's workflow exists since it documents/consumes that same
  contract) → US3 (T019-T022, independent of US1/US2 file-wise but shares the "5 minute" success
  metric, so validated last) → Polish (T023-T025).
- Within US1: T005-T008 can proceed in parallel (different steps/files inside the same new
  workflow file are logically separable even though they land in one file); T009-T010 depend on
  T005-T008 being complete.
- Within US2: T011-T012 (tests) before T013-T017 (implementation), per the constitution's
  "write tests first" expectation for security/behavior-relevant paths; T018 last.

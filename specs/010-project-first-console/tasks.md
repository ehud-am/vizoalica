# Tasks: Project-First Console and Website Setup

**Input**: Design documents from `/specs/010-project-first-console/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/console-and-installation.md`, `quickstart.md`

**Tests**: Tests are required by the feature specification and Vizoalica constitution. Write each
story's tests first, confirm they fail for the intended reason, then implement.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated
independently after the small shared foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no dependency on an
  incomplete task in the same phase.
- **[Story]**: Maps the task to a user story in `spec.md`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish shared test data and feature types without changing user-visible behavior.

- [X] T001 Add reusable two-project, duplicate-name, empty-project, and installation-guidance fixtures in apps/admin-web/tests/fixtures/console.ts and apps/local-ops-api/tests/fixtures/installation.ts
- [X] T002 [P] Add versioned dynamic-config fixtures for valid, malformed, mismatched, and secret-leak cases in packages/browser-sdk/tests/fixtures/dynamic-config.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define shared discriminated contracts used by the console, local API, SDK, and tests.

**⚠️ CRITICAL**: Complete this phase before user-story implementation.

- [X] T003 Define StaticInstallation, DynamicInstallation, DynamicConfigV1, CloudflareGuidance, and InstallationGuidance types and validators in apps/local-ops-api/src/contracts.ts
- [X] T004 Mirror the safe installation response types in apps/admin-web/src/api/local-operations.ts and retain a documented transitional html alias if needed
- [X] T005 [P] Define provider-neutral DynamicConfigV1 validation and duplicate-initialization guard interfaces in packages/browser-sdk/src/dynamic-config.ts

**Checkpoint**: Shared contracts compile and contain no field capable of carrying private credentials.

---

## Phase 3: User Story 1 - Work Through Projects (Priority: P1) 🎯 MVP

**Goal**: Make Projects a first-class destination with explicit, isolated current-project context.

**Independent Test**: With two projects, including duplicate names, select each from Projects and
open its Overview/Websites data; then remove the selected ID from the available list and verify the
console clears stale child data before reconciling context.

### Tests for User Story 1

- [X] T006 [P] [US1] Add failing component tests for Projects navigation, list/create/select, duplicate names, current context, and direct Overview/Websites actions in apps/admin-web/tests/projects.test.tsx
- [X] T007 [P] [US1] Add failing interaction tests for project refresh reconciliation and removal of stale website/analytics content in apps/admin-web/tests/ui-interactions.test.tsx
- [X] T008 [P] [US1] Extend keyboard, aria-current, responsive navigation, and axe scenarios to include Projects in apps/admin-web/e2e/responsive-accessibility.spec.ts

### Implementation for User Story 1

- [X] T009 [P] [US1] Implement the project list, create form, explicit selection, and direct destination actions in apps/admin-web/src/pages/ProjectsPage.tsx
- [X] T010 [US1] Add the projects view and one authoritative reconciled current-project context in apps/admin-web/src/App.tsx
- [X] T011 [US1] Remove duplicate unsynchronized project selection behavior while preserving scoped loading in apps/admin-web/src/pages/AnalyticsPage.tsx and apps/admin-web/src/pages/WebsitesPage.tsx
- [X] T012 [US1] Add project navigation, list, selected-context, empty, loading, and compact responsive styles in apps/admin-web/src/styles.css

**Checkpoint**: Projects is independently usable for view/create/select and never displays mixed
project-bound information. Rename/delete remain out of scope.

---

## Phase 4: User Story 2 - Add a Website to an Explicit Project (Priority: P1)

**Goal**: Require a valid project as the first question of every new-website flow.

**Independent Test**: Open creation with an existing browsing context, confirm the first field is
an empty required project dropdown, create in another project, and prove zero-project and stale-
project attempts create no website or partial record.

### Tests for User Story 2

- [X] T013 [P] [US2] Add failing form tests for first-control project selection, required/error associations, edit-mode immutability, success clearing, and failure retention in apps/admin-web/tests/websites.test.tsx
- [X] T014 [P] [US2] Add failing flow tests for explicit non-current project creation, named confirmation, zero-project CTA, and stale-project failure in apps/admin-web/tests/ui-interactions.test.tsx
- [X] T015 [P] [US2] Extend nested project validation, atomic failure, URL encoding, and cross-project isolation tests in apps/local-ops-api/tests/websites.contract.test.ts and apps/local-ops-api/tests/validation.test.ts
- [X] T016 [P] [US2] Add keyboard and assistive-technology checks for the project-first create flow and empty-project recovery in apps/admin-web/e2e/responsive-accessibility.spec.ts

### Implementation for User Story 2

- [X] T017 [US2] Split create behavior from edit behavior and make Project the empty, required first field in apps/admin-web/src/components/WebsiteForm.tsx
- [X] T018 [US2] Submit the form-selected project ID, reconcile browsing context on success, announce website/project names, and render the zero-project CTA in apps/admin-web/src/pages/WebsitesPage.tsx
- [X] T019 [US2] Route the zero-project action to Projects and preserve drafts across actionable nested-route failures in apps/admin-web/src/App.tsx and apps/admin-web/src/api/local-operations.ts

**Checkpoint**: Every website has an explicitly confirmed available project and failed submissions
leave no partial website while preserving safe draft input.

---

## Phase 5: User Story 3 - Choose Static or Dynamic Installation (Priority: P2)

**Goal**: Preserve the current static snippet and add a portable dynamic loader/config path with
reviewable Cloudflare Pages instructions.

**Independent Test**: Validate unchanged static output, then use one byte-identical generic loader
across two projects, a Cloudflare Pages example, and a non-Cloudflare adapter; all invalid dynamic
configurations fail without an event, fallback client, duplicate initialization, or host-page error.

### Tests for User Story 3

- [X] T020 [P] [US3] Expand local API contract tests for exact legacy static output, identical dynamic snippets, six scoped public values, Cloudflare steps, escaping, and forbidden private material in apps/local-ops-api/tests/snippet.test.ts
- [X] T021 [P] [US3] Add dynamic loader tests for v1 validation, HTTPS and same-origin rules, consent enums, no-store fetch, failure containment, no fallback, and initialize-once behavior in packages/browser-sdk/tests/dynamic-config.test.ts
- [X] T022 [P] [US3] Extend SDK bundle and host-failure tests to cover the generated loader artifact and non-blocking config/SDK failures in packages/browser-sdk/tests/bundle.test.ts and packages/browser-sdk/tests/failure.test.ts
- [X] T023 [P] [US3] Add Pages config Function tests for binding mapping, response headers, placeholder rejection, method rejection, and secret exclusion in apps/token-demo/tests/pages-config.test.ts
- [X] T024 [P] [US3] Add console tests for exactly two accessible choices, static default/copy, dynamic preview/copy, ordered Cloudflare guidance, and switch warning in apps/admin-web/tests/websites.test.tsx
- [X] T025 [P] [US3] Extend documentation contract tests for both modes, public-variable terminology, Cloudflare review/deploy/verify order, other-host mapping, and forbidden credentials in apps/deploy-cli/tests/contract/deployment-docs.contract.test.ts

### Implementation for User Story 3

- [X] T026 [US3] Generate the discriminated static/dynamic response, public variable map, safely quoted target placeholders, and ordered Cloudflare guidance in apps/local-ops-api/src/routes/snippet.ts
- [X] T027 [US3] Preserve authenticated project-scoped snippet routing and map validation failures to safe non-success responses in apps/local-ops-api/src/server.ts
- [X] T028 [US3] Implement the same-origin config fetcher, complete v1 validator, SDK element creation, failure containment, and duplicate guard in packages/browser-sdk/src/dynamic-config.ts
- [X] T029 [US3] Add a dedicated generic loader build entry and deterministic vizoalica-loader.js output in scripts/build-browser-sdk.mjs and packages/browser-sdk/package.json
- [X] T030 [P] [US3] Implement the Cloudflare Pages public config adapter with no-store/nosniff responses and no partial output in examples/cloudflare-pages/functions/vizoalica/config.json.ts
- [X] T031 [US3] Add the loader asset, config Function route, non-secret vars, and consent-gated static/dynamic example selection in examples/cloudflare-pages/public/index.html, examples/cloudflare-pages/public/_routes.json, and examples/cloudflare-pages/wrangler.example.toml
- [X] T032 [US3] Render Static snippet and Dynamic configuration as accessible mutually exclusive options with per-mode copy status, public values, target inputs, commands, warnings, and portable notes in apps/admin-web/src/components/IntegrationSnippet.tsx
- [X] T033 [US3] Extend website verification to recognize the selected installation mode and validate loader/config content without printing tokens or private material in scripts/verify-website.ts
- [X] T034 [P] [US3] Document both modes, Cloudflare Pages vars/commands, Git versus Direct Upload, provider-neutral adapters, consent, CSP, switching, and recovery in docs/operations/browser-sdk.md and docs/operations/pages.md
- [X] T035 [P] [US3] Align the runnable Pages example and failure recovery guidance with the dual-mode contract in examples/cloudflare-pages/README.md and docs/operations/troubleshooting.md

**Checkpoint**: Both installation options work independently; static remains backward compatible;
dynamic is portable, reviewable, consent-gated, and fail-closed.

---

## Phase 6: User Story 4 - Use a Stable, Informative Console Shell (Priority: P3)

**Goal**: Keep support/version information at the bottom without overlays and explain the real
local-versus-remote workspace boundary.

**Independent Test**: In every access state and supported responsive/zoom condition, verify the
footer's position, links, year/version and no-overlap behavior, then open the Local workspace
explanation entirely by keyboard and confirm its accurate boundary wording.

### Tests for User Story 4

- [X] T036 [P] [US4] Add failing footer tests for exact links, current year/version, unavailable-version wording, and every access state in apps/admin-web/tests/footer-version.test.tsx
- [X] T037 [P] [US4] Add failing semantic, keyboard, focus-return, and accurate boundary-wording tests for Local workspace in apps/admin-web/tests/ui-accessibility.test.tsx
- [X] T038 [P] [US4] Add short/long page, centered footer, no-overlap, 320px, 200%-zoom, and focus-order browser assertions in apps/admin-web/e2e/responsive-accessibility.spec.ts

### Implementation for User Story 4

- [X] T039 [P] [US4] Implement the accessible Local workspace disclosure with local console/service and possibly remote backend/data wording in apps/admin-web/src/components/WorkspaceContextHelp.tsx
- [X] T040 [P] [US4] Add the centered product/repository links, year, injected version, and explicit unavailable fallback in apps/admin-web/src/components/AppFooter.tsx
- [X] T041 [US4] Render the disclosure and footer across ready, loading, denied, and offline states in apps/admin-web/src/App.tsx
- [X] T042 [US4] Implement the non-overlay sticky-footer column, centered container, disclosure positioning, focus visibility, and responsive reflow in apps/admin-web/src/styles.css
- [X] T043 [P] [US4] Align operator documentation with the Local workspace boundary in docs/operations/local-analytics.md and docs/operations/ops-cli.md

**Checkpoint**: Footer/support context is always available, unobscured, centered, accurate, and
keyboard/assistive-technology operable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Close security, documentation, coverage, and release-readiness gates across stories.

- [X] T044 [P] Extend loopback, origin, authorization, cross-project, and forbidden-secret response tests for changed local routes in apps/local-ops-api/tests/security.test.ts
- [X] T045 [P] Add repository-wide static checks that browser assets, generated commands, examples, and logs contain no private credential values in apps/deploy-cli/tests/unit/process-security.test.ts
- [X] T046 [P] Update README project-first navigation and dual-installation entry points and lock their terminology in README.md and apps/deploy-cli/tests/contract/deployment-docs.contract.test.ts
- [X] T047 Run the complete scenarios in specs/010-project-first-console/quickstart.md and record implementation, security/privacy, accessibility, and Cloudflare dry-run evidence in specs/010-project-first-console/qa-report.md
- [X] T048 Run pnpm format:check, pnpm lint, pnpm typecheck, pnpm test, pnpm coverage, pnpm build, pnpm browser-sdk:build, pnpm test:e2e, and pnpm audit --prod --audit-level high; resolve failures without lowering the 90% line/branch thresholds and record final results in specs/010-project-first-console/qa-report.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks story implementation.
- **US1 and US2 (Phases 3–4)**: Both depend on Foundation. Implement US1 before the final US2
  integration because US2's empty-state action targets Projects; their tests and isolated
  components may be written in parallel.
- **US3 (Phase 5)**: Depends on Foundation only and can run in parallel with US1/US2.
- **US4 (Phase 6)**: Depends on Foundation only and can run in parallel with US1–US3, with final
  `App.tsx` and `styles.css` integration coordinated after US1/US2 changes.
- **Polish (Phase 7)**: Depends on every story selected for release.

### User Story Dependencies

- **US1 (P1)**: Independent after Foundation; suggested MVP.
- **US2 (P1)**: Its form/API behavior is independently testable after Foundation; final CTA and
  current-context integration use US1.
- **US3 (P2)**: Independent after Foundation; changes installation guidance only.
- **US4 (P3)**: Independent after Foundation; final shell-file merge must include US1/US2 state.

### Within Each User Story

- Write and observe failing tests before implementation.
- Define/validate data before rendering it.
- Implement core behavior before examples and documentation.
- Run the independent checkpoint before starting dependent integration work.

## Parallel Opportunities

- T001 and T002 can run in parallel.
- T005 can run alongside T003–T004 until cross-package type integration.
- US1 tests T006–T008 and ProjectsPage T009 can be prepared in parallel.
- US2 tests T013–T016 can be written in parallel before T017–T019.
- US3 tests T020–T025 can be written in parallel; Pages Function T030 and documentation T034–T035
  can proceed alongside core loader work after the contract is fixed.
- US4 tests T036–T038 and components T039–T040 can run in parallel.
- Cross-cutting T044–T046 can run in parallel before sequential validation T047–T048.
- After Phase 2, US1, US3, and US4 can be assigned independently; US2's component/API slice can
  also proceed while US1 navigation is under construction.

## Parallel Example: User Story 3

```text
Task: "Expand local snippet API contract tests in apps/local-ops-api/tests/snippet.test.ts"
Task: "Add dynamic loader tests in packages/browser-sdk/tests/dynamic-config.test.ts"
Task: "Add Pages config Function tests in apps/token-demo/tests/pages-config.test.ts"
Task: "Add dual-mode console tests in apps/admin-web/tests/websites.test.tsx"
Task: "Add dual-mode documentation contract tests in apps/deploy-cli/tests/contract/deployment-docs.contract.test.ts"
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundation.
2. Implement US1 to make Projects a first-class destination.
3. Run the US1 independent checkpoint.
4. Add US2 immediately afterward to enforce the project boundary at website creation.

### Incremental Delivery

1. Foundation → shared safe types and fixtures.
2. US1 → project-first browsing and navigation MVP.
3. US2 → project-gated website creation safety.
4. US3 → static compatibility plus optional dynamic configuration.
5. US4 → persistent support/version shell and clear local context.
6. Polish → security, documentation, quickstart, coverage, and release gates.

### Parallel Team Strategy

After Foundation, one contributor can own US1/US2 console context, one can own US3 local API/SDK,
one can own the US3 Cloudflare example/docs, and one can own US4. Coordinate shared edits to
`App.tsx`, `styles.css`, and the documentation contract test before final validation.

## Notes

- `[P]` means the task has no incomplete same-file dependency at its planned start.
- Story labels provide traceability to `spec.md`.
- Cloudflare commands are generated for review; the console never executes cloud mutations.
- Browser-required values are public configuration. Only true credentials use secret storage.
- Commit after each coherent task group and stop at story checkpoints for independent validation.

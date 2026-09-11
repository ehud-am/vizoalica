# Tasks: Modern Developer Console Design

**Input**: Design documents from `/specs/008-modernize-console-design/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/console-visual-system.md`, `quickstart.md`

**Tests**: Required by the specification and constitution. Story tests are written before their implementation and must demonstrate the expected failure or gap before being made to pass.

**Organization**: Tasks are grouped by user story so brand, scanability, theme parity, and responsive operation remain independently testable increments.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and has no dependency on an incomplete task.
- **[Story]**: Maps the task to a user story from `spec.md`.
- Every task names its concrete file path.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare repository hygiene and browser-test tooling without changing production behavior.

- [X] T001 Verify Node, build, coverage, environment, editor, and generated-output exclusions in `.gitignore`, `.prettierignore`, and `eslint.config.js`
- [X] T002 Add dev-only Playwright and axe dependencies plus browser-test scripts in `package.json`, `apps/admin-web/package.json`, and `pnpm-lock.yaml`
- [X] T003 Create the local web-server and browser-project configuration in `apps/admin-web/playwright.config.ts`

**Checkpoint**: Existing build and unit tests still run, and browser-test configuration is discoverable without affecting the production bundle.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the non-deployed brand source and shared icon vocabulary required by every visual story.

**⚠️ CRITICAL**: Complete this phase before user-story work.

- [X] T004 Move the concept artwork out of deployed public assets and create the canonical path-only design source in `design/brand/vizoalica-master.svg` and `design/brand/references/vizoalica-logo-concept.png`
- [X] T005 [P] Add the source-owned 16/20-pixel SVG icon vocabulary in `apps/admin-web/src/components/Icons.tsx`
- [X] T006 [P] Add semantic and decorative icon contract tests in `apps/admin-web/tests/icons.test.tsx`

**Checkpoint**: The canonical concept is non-deployed, shared icons are available, and no analytics or API behavior has changed.

---

## Phase 3: User Story 1 - Recognize a Cohesive Developer Product (Priority: P1) 🎯 MVP

**Goal**: Replace the magnifying-glass identity with the approved V-and-analytics favicon, mark, and light/dark lockups.

**Independent Test**: Open the console in both themes and compact/full widths; verify the correct crisp logo, one accessible product name, and recognizable 16/32-pixel favicon.

### Tests for User Story 1

- [X] T007 [P] [US1] Rewrite production SVG contract tests for path-only V/graph geometry, stable variants, monochrome ink, and favicon constraints in `apps/admin-web/tests/brand-assets.test.ts`
- [X] T008 [P] [US1] Add theme selection, compact/full presentation, accessible naming, and no-remount tests in `apps/admin-web/tests/brand-logo.test.tsx`

### Implementation for User Story 1

- [X] T009 [US1] Replace the five production SVG variants with canonical V-and-analytics artwork in `apps/admin-web/public/brand/favicon.svg`, `apps/admin-web/public/brand/vizoalica-mark.svg`, `apps/admin-web/public/brand/vizoalica-lockup-light.svg`, `apps/admin-web/public/brand/vizoalica-lockup-dark.svg`, and `apps/admin-web/public/brand/vizoalica-monochrome.svg`
- [X] T010 [US1] Implement resolved-theme and compact/full logo rendering in `apps/admin-web/src/components/BrandLogo.tsx`
- [X] T011 [US1] Integrate the named Overview brand action and theme-aware logo into `apps/admin-web/src/App.tsx`
- [X] T012 [US1] Update universal favicon metadata in `apps/admin-web/index.html`
- [X] T013 [US1] Rewrite production identity, palette, minimum-size, clear-space, and accessible-use guidance in `docs/brand.md`

**Checkpoint**: User Story 1 passes independently and provides the complete production brand set.

---

## Phase 4: User Story 2 - Scan Analytics Like a Developer Tool (Priority: P1)

**Goal**: Introduce a compact, coherent developer-console hierarchy for navigation, controls, analytics, technical values, and state feedback.

**Independent Test**: On a populated overview, identify scope, range, primary totals, leading result, and warning state within 30 seconds; confirm equivalent controls and states match across pages.

### Tests for User Story 2

- [X] T014 [P] [US2] Add typography, spacing, radius, elevation, semantic color, chart token, and no-decorative-serif contracts in `apps/admin-web/tests/visual-system.test.ts`
- [X] T015 [P] [US2] Update semantic icon and state accessibility expectations in `apps/admin-web/tests/ui-accessibility.test.tsx` and `apps/admin-web/tests/analytics.accessibility.test.tsx`
- [X] T016 [P] [US2] Add theme-token and non-color chart contract tests in `apps/admin-web/tests/dashboard.accessibility.test.tsx`

### Implementation for User Story 2

- [X] T017 [US2] Refactor foundations, graphite palette, typography roles, spacing, radii, elevation, controls, panels, statuses, tables, code, and chart roles in `apps/admin-web/src/styles.css`
- [X] T018 [US2] Replace Unicode/emoji presentation with shared icons in `apps/admin-web/src/components/AccessState.tsx`, `apps/admin-web/src/components/ThemeToggle.tsx`, `apps/admin-web/src/components/IntegrationSnippet.tsx`, `apps/admin-web/src/components/OperationalStatus.tsx`, and `apps/admin-web/src/pages/AnalyticsPage.tsx`
- [X] T019 [US2] Apply tabular technical typography and clearer metric/ranking hierarchy in `apps/admin-web/src/components/MetricCard.tsx`, `apps/admin-web/src/components/RankedTable.tsx`, and `apps/admin-web/src/components/WebsiteList.tsx`
- [X] T020 [US2] Replace literal chart colors with semantic theme roles and accessible series styling in `apps/admin-web/src/components/TrafficTrend.tsx` and `apps/admin-web/src/components/DistributionChart.tsx`
- [X] T021 [US2] Refine page headings, filters, forms, details, state groups, and footer hierarchy in `apps/admin-web/src/pages/AnalyticsPage.tsx`, `apps/admin-web/src/pages/WebsitesPage.tsx`, `apps/admin-web/src/components/DashboardFilters.tsx`, `apps/admin-web/src/components/WebsiteForm.tsx`, and `apps/admin-web/src/components/AppFooter.tsx`

**Checkpoint**: User Story 2 passes independently with the same product workflows and a coherent developer-centric visual hierarchy.

---

## Phase 5: User Story 3 - Work Comfortably in Light and Dark Environments (Priority: P2)

**Goal**: Make light and dark themes intentional, accessible, and synchronized across logos, surfaces, charts, controls, and feedback.

**Independent Test**: Exercise every page and state in both themes, including keyboard navigation, reduced motion, forced colors, and theme persistence.

### Tests for User Story 3

- [X] T022 [P] [US3] Extend resolved-theme and persistence tests for synchronized document and brand state in `apps/admin-web/tests/theme.test.tsx` and `apps/admin-web/tests/theme-toggle.test.tsx`
- [X] T023 [P] [US3] Add both-theme token completeness, focus, reduced-motion, and forced-colors contracts in `apps/admin-web/tests/visual-system.test.ts`

### Implementation for User Story 3

- [X] T024 [US3] Consolidate light/dark semantic mappings and add focus, reduced-motion, forced-colors, disabled, overlay, and chart treatments in `apps/admin-web/src/styles.css`
- [X] T025 [US3] Synchronize the document theme and theme-control presentation without changing persistence behavior in `apps/admin-web/src/theme.ts` and `apps/admin-web/src/components/ThemeToggle.tsx`

**Checkpoint**: User Story 3 passes independently in both themes with no persistent mixed-theme state.

---

## Phase 6: User Story 4 - Use the Console Across Working Viewports (Priority: P2)

**Goal**: Preserve every console workflow from 320 through 1440+ pixels, 200% zoom, touch input, orientation changes, safe areas, and on-screen keyboards.

**Independent Test**: Complete Overview and Websites flows across all responsive bands and resize between them without overflow, clipped actions, hover dependency, or lost task state.

### Tests for User Story 4

- [X] T026 [P] [US4] Add component resize-state and stable-DOM tests in `apps/admin-web/tests/responsive-state.test.tsx`
- [X] T027 [P] [US4] Add table/code overflow and range-selector focus/viewport contracts in `apps/admin-web/tests/dashboard.accessibility.test.tsx`, `apps/admin-web/tests/websites.accessibility.test.tsx`, and `apps/admin-web/tests/time-range-selector.test.tsx`
- [X] T028 [P] [US4] Create real-browser width, touch, theme, overflow, focus, resize-state, and axe scenarios in `apps/admin-web/e2e/responsive-accessibility.spec.ts`

### Implementation for User Story 4

- [X] T029 [US4] Implement compact, medium, standard, and wide shell/content bands with stable DOM order, dynamic viewport units, safe-area insets, 44-pixel targets, and contained overflow in `apps/admin-web/src/styles.css`
- [X] T030 [US4] Add stable responsive grouping hooks without viewport-driven remounts in `apps/admin-web/src/App.tsx`, `apps/admin-web/src/pages/AnalyticsPage.tsx`, and `apps/admin-web/src/pages/WebsitesPage.tsx`
- [X] T031 [US4] Add named keyboard-focusable overflow regions for ranked and exact-value tables and long technical content in `apps/admin-web/src/components/RankedTable.tsx`, `apps/admin-web/src/components/TrafficTrend.tsx`, and `apps/admin-web/src/components/IntegrationSnippet.tsx`
- [X] T032 [US4] Make the range selector safe-area/dynamic-viewport aware while preserving draft state, dismissal, validation, and focus return in `apps/admin-web/src/components/TimeRangeSelector.tsx` and `apps/admin-web/src/styles.css`
- [X] T033 [US4] Add compact chart tick/legend behavior, wrapping, and animation suppression in `apps/admin-web/src/components/TrafficTrend.tsx`, `apps/admin-web/src/components/DistributionChart.tsx`, and `apps/admin-web/src/styles.css`

**Checkpoint**: All four stories are independently functional and the browser suite proves the responsive contract.

---

## Phase 7: User Story 5 - Operate with Guided Commands (Priority: P1)

**Goal**: Provide one safe, guided entry point for OneCLI console setup/runtime and native Wrangler
Direct Upload Pages deployment while preserving the existing Worker/D1/R2 approval gate.

**Independent Test**: Verify rejected secret flags and Docker-only gateways, inspect the no-change
Pages plan, and confirm generated process arguments keep the three credential lanes separate.

- [X] T039 [P] [US5] Add failing safety and command-routing tests for secret flags, Worker origins, host gateways, OneCLI console arguments, and native Wrangler Pages arguments in `apps/deploy-cli/tests/unit/ops-cli.test.ts`
- [X] T040 [US5] Implement guided setup, diagnostic, combined console runtime, deployment preview/confirmation, and native Pages verification commands in `scripts/vizoalica-ops.ts` and `package.json`
- [X] T041 [US5] Document the three credential lanes, parameter sources, OneCLI card, one-terminal console flow, and Direct Upload confirmation flow in `docs/operations/ops-cli.md`
- [X] T042 [P] [US5] Correct and cross-link the installation, console, Pages, and troubleshooting guidance in `README.md`, `docs/operations/cloudflare.md`, `docs/operations/local-analytics.md`, `docs/operations/pages.md`, and `docs/operations/troubleshooting.md`

**Checkpoint**: The common operations path is guided and independently testable without changing
Cloudflare or exposing a secret.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Align documentation, validate the complete implementation, and produce release evidence.

- [X] T034 [P] Align implementation guidance and runnable commands in `specs/008-modernize-console-design/quickstart.md` and `specs/008-modernize-console-design/contracts/console-visual-system.md`
- [X] T035 [P] Update affected console test fixtures and obsolete old-brand assertions across `apps/admin-web/tests/`
- [X] T036 Run formatting, linting, type checking, unit/integration tests, coverage, build, browser tests, and dependency/security checks from `package.json` and `apps/admin-web/package.json`
- [X] T037 Perform visual, keyboard, zoom, touch, favicon, theme, and contrarian QA review and record results in `specs/008-modernize-console-design/qa-report.md`
- [X] T038 Reconcile specification, plan, tasks, UI contract, brand guide, implementation, and validation evidence in `specs/008-modernize-console-design/` and `docs/brand.md`
- [X] T043 Validate operations tests, type checking, linting, formatting, and the complete repository suite through `package.json`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks every user story.
- **User Story 1 (Phase 3)**: Depends on Foundational; establishes production brand assets used by later theme/responsive work.
- **User Story 2 (Phase 4)**: Depends on Foundational and may proceed alongside User Story 1 except where `App.tsx` and `styles.css` integration overlaps.
- **User Story 3 (Phase 5)**: Depends on the semantic visual foundation from User Story 2 and brand selection from User Story 1.
- **User Story 4 (Phase 6)**: Depends on the shared shell and visual roles from User Stories 1–3; responsive behavior then remains independently testable.
- **Polish (Phase 7)**: Depends on all selected stories.

### User Story Dependencies

- **US1 (P1)**: Foundational only; independently delivers recognizable brand identity.
- **US2 (P1)**: Foundational only; independently delivers developer-centric information hierarchy, though final header integration must preserve US1.
- **US3 (P2)**: Uses US1 lockups and US2 semantic roles.
- **US4 (P2)**: Reflows the completed shell/components from US1–US3 without changing their state or behavior.
- **US5 (P1)**: Reuses existing package commands and is independently testable after repository setup; it does not depend on the visual stories.

### Within Each User Story

- Write and run the story's tests before its implementation tasks.
- Complete shared assets/tokens before component integration.
- Complete component integration before story-level validation.
- Tasks that touch `styles.css`, `App.tsx`, or the same component must run sequentially.

### Parallel Opportunities

- T005 and T006 can proceed in parallel after T004's directories exist.
- T007 and T008 are parallel test authoring for US1.
- T014, T015, and T016 are parallel test authoring for US2.
- T022 and T023 are parallel test authoring for US3.
- T026, T027, and T028 are parallel test authoring for US4.
- T034 and T035 can proceed in parallel before the final full validation.
- T039 and T042 can proceed in parallel before T040/T043 integration validation.

---

## Parallel Example: User Story 1

```text
Task: "Rewrite production SVG contract tests in apps/admin-web/tests/brand-assets.test.ts"
Task: "Add logo behavior tests in apps/admin-web/tests/brand-logo.test.tsx"
```

## Parallel Example: User Story 2

```text
Task: "Add visual-system token contracts in apps/admin-web/tests/visual-system.test.ts"
Task: "Update icon/state accessibility expectations in apps/admin-web/tests/ui-accessibility.test.tsx"
Task: "Add chart theme/non-color contracts in apps/admin-web/tests/dashboard.accessibility.test.tsx"
```

## Parallel Example: User Story 4

```text
Task: "Add stable responsive-state tests in apps/admin-web/tests/responsive-state.test.tsx"
Task: "Add overflow and range-selector contracts in existing accessibility tests"
Task: "Create real-browser responsive scenarios in apps/admin-web/e2e/responsive-accessibility.spec.ts"
```

---

## Implementation Strategy

### MVP First: User Story 1

1. Complete Setup and Foundational phases.
2. Write US1 brand tests and confirm they expose the old identity.
3. Replace the production asset set and integrate `BrandLogo`.
4. Validate favicon, light lockup, dark lockup, compact mark, and accessible naming independently.

### Incremental Delivery

1. Brand identity establishes the visual source of truth.
2. Developer-centric typography, palette, hierarchy, icons, and charts establish the shared language.
3. Theme parity makes both modes intentional and synchronized.
4. Responsive behavior adapts the stable interface across widths and input modes.
5. Cross-cutting verification and QA close the feature.

### Single-Agent Execution

Execute phase by phase in task order. Parallel markers identify independent files, but tasks sharing the same worktree must still preserve test-before-code ordering and avoid simultaneous edits to shared files.

## Notes

- `[P]` tasks touch separate files or independent tests.
- `[US#]` labels provide requirement traceability.
- Production code remains inside `apps/admin-web`; no backend or analytics contract changes are allowed.
- Mark completed work with `[X]` only after its relevant validation succeeds.

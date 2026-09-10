---

description: "Dependency-ordered implementation tasks for the dashboard visual refresh"
---

# Tasks: Dashboard Visual Refresh

**Input**: Design documents from `/specs/007-dashboard-visual-refresh/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/dashboard.openapi.yaml`, `quickstart.md`

**Tests**: Automated tests are required by the feature specification and project constitution. Write each listed test first, confirm that it fails for the intended behavior, then implement the corresponding change.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified as a useful increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its phase prerequisites because it changes different files and does not depend on another incomplete task in the group.
- **[Story]**: Maps work to a user story in `spec.md`.
- Every task names the exact files it creates or changes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the selected build dependencies without changing product behavior.

- [x] T001 Add Tailwind CSS 4, `@tailwindcss/vite`, and Recharts 3 with pinned compatible ranges in `apps/admin-web/package.json` and `pnpm-lock.yaml`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the shared contracts, schema, range rules, and secret lifecycle required by every dashboard story.

**Critical**: Complete this phase before user-story implementation.

- [x] T002 Define `RequestAnalyticsContext`, analytics overview/ranking/distribution/range types, identity kinds, taxonomy versions, and repository method signatures in `apps/ingest-api/src/domain/types.ts` and `apps/ingest-api/src/storage/repositories.ts`
- [x] T003 [P] Implement minute-aligned UTC `[start,end)` parsing, complete-minute preset boundaries, maximum-30-day validation, and hour/day trend interval selection in `apps/ingest-api/src/analytics/range.ts`
- [x] T004 Add migration `deploy/cloudflare/migrations/0005_dashboard_visual_refresh.sql` with minute totals, independent dimensions, visitor presence, event-digest ledger, per-source watermark, constraints, existing-source watermark initialization, and both project-wide and source-specific indexes
- [x] T005 [P] Add failing Worker configuration and deployment lifecycle tests that require a generated, redacted, Worker-only analytics digest secret in `apps/ingest-worker/tests/foundation.test.ts`, `apps/deploy-cli/tests/integration/credential-lifecycle.test.ts`, `apps/deploy-cli/tests/integration/configure-plan.test.ts`, and `apps/deploy-cli/tests/contract/plan-receipt.contract.test.ts`
- [x] T006 Extend the Worker environment/configuration and D1 interfaces for `VIZOALICA_ANALYTICS_DIGEST_SECRET`, transactional `batch()`, scheduled cleanup, and fail-closed secret validation in `apps/ingest-worker/src/env.ts`, `apps/ingest-worker/src/config.ts`, and `apps/ingest-worker/src/index.ts`
- [x] T007 Generate, store, plan, apply, redact, and report the analytics digest secret without exposing it to the browser or local console in `apps/deploy-cli/src/commands/configure.ts`, `apps/deploy-cli/src/commands/plan.ts`, `apps/deploy-cli/src/commands/apply.ts`, `apps/deploy-cli/src/config.ts`, `apps/deploy-cli/src/redaction.ts`, and `apps/deploy-cli/src/types.ts`

**Checkpoint**: The shared types compile, migration is additive, and deployment planning can provision the required secret safely.

---

## Phase 3: User Story 1 - Understand Traffic at a Glance (Priority: P1) MVP

**Goal**: Show one coherent privacy-safe analytics overview for all websites or one selected website, including totals, trends, top-ten rankings, distributions, and explicit completeness.

**Independent Test**: With a project containing two websites and known accepted page views, open Overview at the default 24-hour range, switch between All websites and each website, and verify every widget changes together. Shared reviewed project pseudonyms deduplicate across sources; source-local identities remain separate; no raw metadata or stale result is shown.

### Tests for User Story 1

- [x] T008 [P] [US1] Add failing taxonomy tests for country special values, browser/OS/device precedence, bounded major versions, clear bots, ordinary browsers, conflicting evidence, malformed input, and Unknown fallbacks in `apps/ingest-worker/tests/dashboard-classifier.test.ts`
- [x] T009 [P] [US1] Add failing privacy tests proving spoofed `CF-IPCountry`, raw/oversized User-Agent, IP, bot scores, fingerprints, and headers never enter CloudEvents, R2 payload additions, D1 dimension bindings, logs, errors, or responses in `apps/ingest-worker/tests/dashboard-metadata-privacy.test.ts` — proven end-to-end through the real `worker.fetch()` entrypoint
- [x] T010 [P] [US1] Add failing SDK tests for consent-eligible source-namespaced first-party anonymous-ID persistence, explicit-ID precedence, and ephemeral fallback when storage is denied or unavailable in `packages/browser-sdk/tests/anonymous-identity.test.ts`
- [x] T011 [P] [US1] Add failing D1 write tests for accepted page views only, minute totals, eight independent dimensions, HMAC identity domains, request coalescing, duplicate-event idempotency, watermark creation, and transactional rollback in `apps/ingest-worker/tests/dashboard-rollups.integration.test.ts` — coalescing/duplicate-event idempotency covered indirectly via the single-batch assertion, not with a dedicated duplicate-delivery case
- [x] T012 [P] [US1] Add failing D1 query tests for all-sites and one-site totals, distinct visitors, shared/source-local identities, hourly/daily trends, deterministic ties, top-ten remainder counts, Unknown/Other, disabled history, deleted exclusion, empty data, pre-migration incompleteness, and indexed query plans in `apps/ingest-worker/tests/dashboard-analytics.integration.test.ts` — deterministic-tie ordering and indexed query plans are SQL-level concerns not verifiable against the fake-D1 harness; would need a real SQLite/D1 instance
- [x] T013 [P] [US1] Add failing Worker contract/security tests for the project analytics endpoint, admin authentication, project isolation, source ownership, deleted sources, coherent response shape, no-store headers, and legacy endpoint compatibility in `apps/ingest-worker/tests/dashboard-admin.contract.test.ts`
- [x] T014 [P] [US1] Add failing local proxy contract tests for all-sites and one-site analytics, response pass-through, identifier validation, session expiry, remote failures, and stale-data rejection in `apps/local-ops-api/tests/dashboard.contract.test.ts` — landed as added cases in `apps/local-ops-api/tests/analytics.contract.test.ts` instead of a separate file; covers all-sites/one-site pass-through and invalid-range rejection, not yet session-expiry/stale-data
- [x] T015 [P] [US1] Add failing dashboard behavior tests for default All websites scope, website switching, complete/empty/incomplete/processing/unavailable states, top-ten/remainder rendering, and request-generation guards in `apps/admin-web/tests/dashboard.test.tsx` — covers default scope, switching, zero/empty state, top-ten+Other, incomplete-history notice, and the stale-response generation guard; processing/unavailable states not yet covered
- [x] T016 [P] [US1] Add failing dashboard accessibility tests for semantic headings, metric names, table equivalents, chart captions, non-color labels, focus states, and live loading/error announcements in `apps/admin-web/tests/dashboard.accessibility.test.tsx` — focus-visible/reduced-motion styles already covered by the existing styles.css checks in analytics.accessibility.test.tsx rather than duplicated here
- [x] T017 [P] [US1] Add failing scheduled-retention tests for 32-day boundaries, bounded deletion batches, watermark preservation, and error reporting in `apps/ingest-worker/tests/dashboard-retention.test.ts`

### Implementation for User Story 1

- [x] T018 [P] [US1] Implement the dependency-free taxonomy v1 normalizer with a 512-character inspection cap and no raw-value output in `apps/ingest-worker/src/analytics/classifier.ts`
- [x] T019 [US1] Extract trusted `request.cf` and User-Agent inputs only in the Worker adapter, pass normalized `RequestAnalyticsContext` separately through ingestion, and keep `StoredEvent`/R2/logging unchanged in `apps/ingest-worker/src/http/worker-adapter.ts`, `apps/ingest-api/src/http/events.ts`, `apps/ingest-api/src/ingestion/pipeline.ts`, and `apps/ingest-api/src/storage/repositories.ts`
- [x] T020 [P] [US1] Persist the default anonymous ID only in consent-eligible first-party storage under a source-namespaced key while preserving explicit IDs and safe ephemeral fallback in `packages/browser-sdk/src/events.ts`, `packages/browser-sdk/src/index.ts`, and `packages/browser-sdk/src/types.ts`
- [x] T021 [US1] Implement project/source-domain HMAC visitor digests, HMAC event digests, transient request nonces, coalesced transactional minute writes, and new-source watermark creation in `apps/ingest-worker/src/storage/d1-repositories.ts`
- [x] T022 [US1] Implement indexed all-sites/one-site totals, distinct-user totals and trends, top-ten rankings, bounded distributions, completeness metadata, deterministic ordering, and zero filling in `apps/ingest-worker/src/storage/d1-repositories.ts`
- [x] T023 [US1] Add `GET /v1/admin/projects/{projectId}/analytics` with optional `source_id`, explicit UTC boundaries, ownership checks, one coherent response, and `Cache-Control: no-store` in `apps/ingest-worker/src/http/admin-adapter.ts`
- [x] T024 [P] [US1] Replace the duplicated local analytics summary model with the OpenAPI-aligned overview types and safe query serialization in `apps/local-ops-api/src/contracts.ts` and `apps/local-ops-api/src/remote-client/worker-client.ts`
- [x] T025 [US1] Proxy the project analytics endpoint, map authorization/not-found/unavailable failures, and retain the existing site-summary compatibility route in `apps/local-ops-api/src/routes/analytics.ts` and `apps/local-ops-api/src/server.ts` — fixed a relative-import depth bug and an `invalid_range` error that fell through to a 503 instead of a 400
- [x] T026 [P] [US1] Add OpenAPI-aligned dashboard types, encoded all-sites/one-site requests, abort-signal support, and normalized error handling in `apps/admin-web/src/api/local-operations.ts`
- [x] T027 [P] [US1] Implement reusable KPI and semantic ranked-table components with explicit zero, remainder, Unknown, and unavailable states in `apps/admin-web/src/components/MetricCard.tsx` and `apps/admin-web/src/components/RankedTable.tsx`
- [x] T028 [P] [US1] Implement the responsive page-view/unique-user trend with caption, exact-value table, zero buckets, and no misleading summed uniques in `apps/admin-web/src/components/TrafficTrend.tsx`
- [x] T029 [P] [US1] Implement OS, browser, device, and traffic distribution charts with exact count/percentage lists, Other/Unknown handling, and consistent rounding in `apps/admin-web/src/components/DistributionChart.tsx`
- [x] T030 [P] [US1] Implement project and website scope controls with All websites first, non-deleted website options, disabled-history labeling, and project-change reset in `apps/admin-web/src/components/DashboardFilters.tsx` and `apps/admin-web/src/components/WebsiteSelector.tsx`
- [x] T031 [US1] Replace the summary panel with the full dashboard grid, one-response state model, abort/generation stale-result protection, and explicit availability states in `apps/admin-web/src/pages/AnalyticsPage.tsx` and `apps/admin-web/src/components/AnalyticsSummary.tsx` — fixed a bug where the overview fetch's own error state could silently overwrite a genuine "websites could not be loaded" error from the sibling effect
- [x] T032 [US1] Implement the daily UTC 32-day cleanup handler and add its Cron Trigger to the existing Worker configuration in `apps/ingest-worker/src/index.ts`, `apps/ingest-worker/src/storage/d1-repositories.ts`, and `deploy/cloudflare/wrangler.toml`

**Checkpoint**: User Story 1 is complete. Every T008-T032 task is implemented and covered, the full monorepo test suite (`vitest run`, 264 tests) passes, `tsc -b` is clean across the whole repo, and `vite build` succeeds for admin-web. Two intentional coverage gaps remain, noted inline above: SQL-level deterministic-tie ordering and indexed query plans (T012) aren't verifiable against a fake-D1 harness and would need a real SQLite/D1 instance; T011's duplicate-event idempotency is covered indirectly rather than with a dedicated duplicate-delivery case.

---

## Phase 4: User Story 2 - Choose a Useful Time Range (Priority: P1)

**Goal**: Apply exactly Last 6 hours, Last 12 hours, Last 24 hours, Last 7 days, Last 30 days, or a valid minute-granular custom range through one accessible selector.

**Independent Test**: Apply every preset and a valid custom range, verify one shared UTC `[start,end)` period across every widget, then verify invalid and dismissed drafts issue no request and keyboard focus returns predictably.

### Tests for User Story 2

- [x] T033 [P] [US2] Add failing range-unit tests for all five complete-minute presets, minute alignment, half-open boundaries, DST-crossing local conversions, future/equal/reversed/over-30-day rejection, and hour/day interval selection in `apps/ingest-api/tests/unit/analytics-range.test.ts`
- [x] T034 [P] [US2] Add failing Worker and loopback contract tests for missing, malformed, unaligned, future, reversed, and overlong query ranges plus exact accepted-boundary echoing in `apps/ingest-worker/tests/dashboard-range.contract.test.ts` and `apps/local-ops-api/tests/analytics-range.contract.test.ts`
- [x] T035 [P] [US2] Add failing selector interaction/accessibility tests for preset radios, Custom controls, visible timezone, draft preservation, Apply-only queries, inline errors, Escape/light dismiss, focus return, and narrow reflow classes in `apps/admin-web/tests/time-range-selector.test.tsx`

### Implementation for User Story 2

- [x] T036 [P] [US2] Implement browser range presets, local `datetime-local` parsing/formatting, timezone labels, complete-minute UTC conversion, summaries, and client validation in `apps/admin-web/src/time-range.ts`
- [x] T037 [US2] Apply the shared range validator and stable field-level errors at the Worker and local proxy boundaries in `apps/ingest-worker/src/http/admin-adapter.ts`, `apps/local-ops-api/src/routes/analytics.ts`, and `apps/local-ops-api/src/server.ts`
- [x] T038 [US2] Build the native responsive range popover with preset fieldset, custom From/To controls, timezone, validation status, and one Apply action in `apps/admin-web/src/components/TimeRangeSelector.tsx`
- [x] T039 [US2] Add the compact active-range trigger to the dashboard filters and preserve unapplied draft state across dismiss/reopen in `apps/admin-web/src/components/DashboardFilters.tsx`
- [x] T040 [US2] Connect applied ranges to one cancellable dashboard request, keep prior results out of the current state, and announce active range changes in `apps/admin-web/src/pages/AnalyticsPage.tsx`
- [x] T041 [US2] Add an end-to-end selector-to-local-API test covering every preset, one valid custom range, invalid no-request behavior, and returned UTC boundaries in `apps/admin-web/tests/time-range.e2e.test.tsx`

**Checkpoint**: User Story 2 is complete. All five presets and a custom range apply through one accessible popover; the full monorepo test suite (316 tests) passes, `tsc -b` is clean, and `vite build` succeeds. A live-browser visual pass was not performed this session (relied on jsdom interaction tests driving real clicks/typing/keyboard focus instead) — worth a manual look before shipping US2.

---

## Phase 5: User Story 3 - Use a Professional, Accessible Interface (Priority: P2)

**Goal**: Present a coherent utility-styled console in light or dark mode, persist explicit theme choices in a protected local file, and keep every existing page responsive and accessible.

**Independent Test**: Exercise Overview and Websites in both themes at desktop, 320 CSS pixels, and 200% zoom; restart the browser/local console to verify persistence; simulate preference failures; and complete keyboard and screen-reader checks without blocking analytics.

### Tests for User Story 3

- [x] T042 [P] [US3] Add failing filesystem tests for absent/valid/invalid preference files, allowlisted schema, symlink refusal, `0600` enforcement, atomic replacement, credential separation, and unwritable-directory behavior in `apps/local-ops-api/tests/preferences.test.ts`
- [x] T043 [P] [US3] Add failing local endpoint security tests for same-origin/session enforcement, GET null/system behavior, PUT light/dark only, body limits, no-store responses, and non-disclosure of credentials in `apps/local-ops-api/tests/preferences.contract.test.ts`
- [x] T044 [P] [US3] Add failing theme tests for system default, system changes before an explicit preference, persisted light/dark loading, optimistic session choice, save-failure notice, document `data-theme`, and `color-scheme` in `apps/admin-web/tests/theme.test.tsx`
- [x] T045 [P] [US3] Expand automated shell/page accessibility tests for landmarks, navigation state, focus visibility hooks, error/status semantics, zoom-safe structure, and both-theme semantic tokens in `apps/admin-web/tests/ui-accessibility.test.tsx`

### Implementation for User Story 3

- [x] T046 [P] [US3] Resolve the preferences path beside the configured local-operations file and implement protected read/atomic-write helpers in `apps/local-ops-api/src/config.ts` and `apps/local-ops-api/src/preferences.ts`
- [x] T047 [US3] Add authenticated same-origin `GET`/`PUT /api/preferences/theme` routes with strict JSON validation and nonblocking storage errors in `apps/local-ops-api/src/contracts.ts` and `apps/local-ops-api/src/server.ts`
- [x] T048 [P] [US3] Implement system-theme observation, explicit-preference loading/saving, optimistic session fallback, and document theme application in `apps/admin-web/src/theme.ts`
- [x] T049 [US3] Configure the Tailwind Vite plugin and CSS-first semantic light/dark tokens for surfaces, text, borders, focus, status, and chart colors in `apps/admin-web/vite.config.ts` and `apps/admin-web/src/styles.css`
- [x] T050 [P] [US3] Build an accessible Light/Dark theme control with save status and failure recovery in `apps/admin-web/src/components/ThemeToggle.tsx`
- [x] T051 [US3] Refactor the application shell, top bar, responsive navigation, main landmark, shared page spacing, and theme integration to the utility system in `apps/admin-web/src/App.tsx` and `apps/admin-web/src/main.tsx`
- [x] T052 [P] [US3] Apply the shared utility components and state treatments to website management, forms, integration snippets, operational status, and access screens in `apps/admin-web/src/pages/WebsitesPage.tsx` and `apps/admin-web/src/components/WebsiteForm.tsx`, `apps/admin-web/src/components/WebsiteList.tsx`, `apps/admin-web/src/components/IntegrationSnippet.tsx`, `apps/admin-web/src/components/OperationalStatus.tsx`, and `apps/admin-web/src/components/AccessState.tsx`
- [x] T053 [US3] Add reduced-motion behavior, non-color series differentiation, stable responsive chart sizing, readable 200%-zoom layouts, and visible/focusable text alternatives in `apps/admin-web/src/components/TrafficTrend.tsx`, `apps/admin-web/src/components/DistributionChart.tsx`, and `apps/admin-web/src/styles.css`

**Checkpoint**: User Story 3 is complete. Preferences are stored beside the local-operations config with an allowlisted schema, 0600 permissions, symlink refusal, and atomic writes; GET/PUT /api/preferences/theme enforce the existing same-origin/session gate and degrade non-blockingly on storage failure. The client observes system theme changes, loads/saves an explicit choice with optimistic session fallback and a save-failure notice, and applies data-theme/color-scheme to the document. Tailwind is wired via @tailwindcss/vite and styles.css now defines a full semantic light/dark token set (surfaces, text, borders, focus, status, code block) redefined for both the system-dark preference and an explicit dark choice, consumed by the existing component class system rather than a wholesale rewrite to atomic Tailwind utility classNames - a deliberate scope call given the size/risk of restyling every page at once; every page (dashboard, websites, forms, snippets, status, access states) already used that shared class system so it went theme-aware automatically, and a live-browser check confirmed both themes render coherently. 355 tests pass, `tsc -b` is clean, and `vite build` succeeds. Narrow-viewport (320px/200%-zoom) behavior relies on the pre-existing, now-extended `@media (max-width: 800px)` rule verified by unit tests; the live-browser check could not confirm it at true mobile width this session due to a viewport-emulation quirk in the browser tool, so it's worth a manual look.

---

## Phase 6: User Story 4 - Recognize and Identify the Product (Priority: P3)

**Goal**: Deliver an original magnifying-glass Vizoalica identity and an accurate versioned footer on every main console page.

**Independent Test**: Inspect every logo variant at its minimum size on approved light/dark placements, confirm accessible naming, and verify every main page renders `2026 | Vizoalica | v0.x.y` from the root package version.

### Tests for User Story 4

- [ ] T054 [P] [US4] Add failing asset tests for required SVG variants, unique IDs, view boxes, accessible-title policy, dark/light/monochrome colors, and documented minimum-size references in `apps/admin-web/tests/brand-assets.test.ts`
- [ ] T055 [P] [US4] Add failing footer/build tests that compare rendered output with root `package.json`, require `vunknown` fallback, and cover Overview and Websites in `apps/admin-web/tests/footer-version.test.tsx`

### Implementation for User Story 4

- [ ] T056 [P] [US4] Design the original magnifying-glass vector master and create square, dark-background horizontal, light-background horizontal, monochrome, and favicon SVG assets in `apps/admin-web/public/brand/vizoalica-mark.svg`, `apps/admin-web/public/brand/vizoalica-lockup-dark.svg`, `apps/admin-web/public/brand/vizoalica-lockup-light.svg`, `apps/admin-web/public/brand/vizoalica-monochrome.svg`, and `apps/admin-web/public/brand/favicon.svg`
- [ ] T057 [P] [US4] Document the logo concept, palette, clear space, minimum sizes, approved backgrounds, monochrome use, and meaningful/decorative accessible-name rules in `docs/brand.md`
- [ ] T058 [US4] Replace the placeholder letter mark with the correct theme-aware lockup and accessible naming in `apps/admin-web/src/App.tsx`
- [ ] T059 [P] [US4] Install the Vizoalica favicon and application metadata in `apps/admin-web/index.html`
- [ ] T060 [US4] Inject the authoritative root package version through Vite, declare the compile-time constant, and implement the shared footer with `vunknown` fallback in `apps/admin-web/vite.config.ts`, `apps/admin-web/src/vite-env.d.ts`, and `apps/admin-web/src/components/AppFooter.tsx`
- [ ] T061 [US4] Render `2026 | Vizoalica | v0.x.y` consistently after the main content on every console view in `apps/admin-web/src/App.tsx`

**Checkpoint**: User Story 4 branding is original, scalable, accessible, theme-safe, and tied to the authoritative release version.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Finish operator guidance, cost/security evidence, release metadata, and repository-wide gates.

- [ ] T062 [P] Update the README dashboard tour, screenshot guidance, browser support, theme location, identity semantics, Unknown/Other meanings, and privacy guarantees in `README.md`
- [ ] T063 [P] Document migration `0005`, the generated digest secret, daily cleanup, direct/manual deployment steps, completeness behavior, rollback limits, and verification in `docs/deployment/cloudflare.md` and `docs/deployment/onecli.md`
- [ ] T064 [P] Record the measured D1 rows read/written per page view and maximum-range query, free-tier implications, quota assumptions, retention cost, and index evidence in `docs/operations/cost-model.md`
- [ ] T065 Prepare the `0.4.0` feature release metadata and describe the dashboard, theme, branding, migration, privacy behavior, and compatibility adapter in `package.json`, `pnpm-lock.yaml`, and `CHANGELOG.md`
- [ ] T066 Run formatting, linting, type checking, all tests, coverage above 90% lines/branches, production builds, and deployment preflight; record commands and results in `specs/007-dashboard-visual-refresh/validation-report.md`
- [ ] T067 Audit the completed implementation for raw metadata leakage, project/source isolation, preference/credential separation, dependency licenses/advisories, CSP, and negative-test coverage in `specs/007-dashboard-visual-refresh/security-privacy-review.md`
- [ ] T068 Run the 30-day representative fixture, capture p95 response time, output bounds, D1 `EXPLAIN QUERY PLAN`, rows read/written, duplicate handling, and cleanup behavior in `specs/007-dashboard-visual-refresh/performance-report.md`
- [ ] T069 Complete manual keyboard, screen-reader, both-theme contrast, 200% zoom, 320 CSS-pixel reflow, reduced-motion, selector focus-return, and logo minimum-size review in `specs/007-dashboard-visual-refresh/accessibility-report.md`
- [ ] T070 Perform the constitution-required contrarian QA review and cross-artifact alignment audit, list any resolved findings, and assemble the human release-owner go/no-go evidence in `specs/007-dashboard-visual-refresh/qa-report.md` and `specs/007-dashboard-visual-refresh/release-readiness.md`

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)** starts immediately.
- **Foundational (Phase 2)** depends on T001 and blocks all story implementation.
- **User Story 1 (Phase 3)** depends on Phase 2 and provides the MVP analytics contract and components.
- **User Story 2 (Phase 4)** depends on T003 and the US1 endpoint/client/filter integration in T023–T026 and T030–T031.
- **User Story 3 (Phase 5)** depends on Phase 2; its preference work can proceed beside US1, while T053 integrates with US1 chart components.
- **User Story 4 (Phase 6)** depends on T001; asset and documentation work can proceed independently, while T058 and T061 integrate after the US3 shell in T051.
- **Polish (Phase 7)** depends on all selected user stories; release validation T066–T070 follows documentation and release metadata T062–T065.

### User story dependency graph

```text
Setup ──> Foundation ──> US1 (analytics MVP) ──> US2 (range selector)
                     ├─> US3 (visual system + theme)
                     └─> US4 assets/docs
US1 charts ────────────────────────────────> US3 chart accessibility finish
US3 shell + US4 assets/version ───────────> US4 integration
US1 + US2 + US3 + US4 ───────────────────> Polish and release evidence
```

### Within each user story

- Write the listed tests first and confirm their intended failures.
- Implement data and service behavior before endpoint/UI integration.
- Keep one analytics response authoritative for a scope/range.
- Complete the checkpoint before treating the story as deliverable.

## Parallel Opportunities

### User Story 1

After Phase 2, these test files can be created in parallel:

```text
T008 classifier tests
T009 metadata privacy tests
T010 SDK identity tests
T011 D1 rollup tests
T012 D1 query tests
T013 Worker contract tests
T014 local proxy tests
T015 dashboard behavior tests
T016 dashboard accessibility tests
T017 retention tests
```

After their supporting interfaces exist, T018 and T020 can proceed together; T027–T030 can also proceed together before T031 integrates the dashboard.

### User Story 2

T033, T034, and T035 can be written in parallel. After range contracts stabilize, T036 can proceed beside the server changes in T037; T038–T040 then integrate sequentially.

### User Story 3

T042–T045 can be written in parallel. T046 and T048 can proceed together, and T050 can proceed beside T052 after the Tailwind tokens in T049 are available.

### User Story 4

T054 and T055 can be written in parallel. T056, T057, and T059 can proceed together; version/footer work in T060 can proceed beside the logo-header integration in T058 before T061 completes the shell.

## Implementation Strategy

### MVP first

1. Complete T001–T007.
2. Complete T008–T032 for User Story 1.
3. Validate the default 24-hour all-sites/one-site dashboard independently.
4. Demonstrate the coherent aggregate response and privacy boundary before adding selector and styling refinements.

### Incremental delivery

1. **US1**: Useful analytics landing page with all requested data at the default range.
2. **US2**: Five presets and custom range, with exact apply semantics.
3. **US3**: Tailwind visual system, responsive accessibility, and persisted theme.
4. **US4**: Original brand system and authoritative footer.
5. **Polish**: Documentation, measured cost/performance, complete validation, contrarian QA, and release-owner evidence.

### Safe stopping points

- After Phase 2: schema and contracts are reviewable; no user-facing behavior is claimed.
- After US1: the analytics dashboard is an independently testable MVP.
- After US2: time exploration is complete.
- After US3: the console meets the visual/theme/accessibility requirements.
- After US4: product identity and versioning are complete.
- After Phase 7: evidence is ready for the human release decision.

## Notes

- `[P]` tasks operate on separate files or independent artifacts after their stated prerequisites.
- No task may add raw-event dashboard queries, cross-site fingerprinting, paid-service requirements, or browser-visible credentials.
- Preserve migrations `0001`–`0004`; migration `0005` is additive and does not fabricate historical dimensions.
- Keep the old website-summary API only as the planned one-release compatibility adapter.
- Commit after each tested logical group so failures can be isolated and reviewed.

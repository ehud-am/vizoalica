---

description: "Task list for Website Administration Pages and Installation Flow"
---

# Tasks: Website Administration Pages and Installation Flow

**Input**: `/specs/013-admin-website-pages/` (spec, design, plan, contracts)

**Tests**: Included (constitution: tests for new behavior, more than 90% coverage, accessibility checks).

Console paths are under `apps/admin-web/`. Do not commit or push unless asked.

## Phase 1: Foundations (block every story)

- [X] T001 Router: add `manage/websites/new`, `manage/websites/:id`, `/edit`, `/install`; remove `manage/installation`; `useRoute()` returns `{ path, websiteId? }`; `hrefFor(path, id?)`; `NAV_ROUTES`; `navKey()`; per-route scope-control config in `src/router.ts`
- [X] T002 [P] Scope provider: derive `websitesLoading` (true until a list has loaded for the current project) in `src/scope/ScopeProvider.tsx`
- [X] T003 [P] `src/shell/FlashProvider.tsx`: `show(message)` (cleared on next route change) and `carry(message)` (survives exactly one route change), plus `FlashMessage`
- [X] T004 [P] `src/components/PageHeader.tsx`: breadcrumb, heading, optional back link, actions
- [X] T005 [P] `src/components/CopyButton.tsx` and `CodeBlock.tsx`: per-block copy, in-place "Copied", live announcement, unavailable-clipboard message
- [X] T006 [P] `src/components/Tabs.tsx`: tab-pattern primitives (roving focus, arrows, Home/End, `aria-selected`, `aria-controls`)
- [X] T007 [P] `src/manage/useDirtyGuard.tsx`: confirm-on-leave for the page's own back link and Cancel using `ConfirmDialog`
- [X] T008 Shell: `AreaNav` from `NAV_ROUTES` with Websites current on website routes; `ScopeBar` gains `showWebsite`; `App.tsx` routes, provider, and scope-control config
- [X] T009 [P] Tests: router, flash, tabs, copy/code block, dirty guard, scope `websitesLoading` in `tests/`

## Phase 2: US1 Browse and open (P1) 🎯

- [X] T010 [US1] `src/components/WebsiteCard.tsx` and `src/manage/WebsitesPage.tsx` as list only (cards, "Add website", empty state, no form fields); remove `WebsiteList.tsx`
- [X] T011 [US1] `src/manage/WebsitePage.tsx`: hub with breadcrumb, details, identifiers with copy, actions (Edit, Install, View analytics), status card, Enable, danger zone, not-found and loading states
- [X] T012 [P] [US1] Tests: list content and no fields, card link, open by address and after reload, not-found, empty state, breadcrumb, no Website selector on website pages

## Phase 3: US2 and US3 Edit and add pages (P1)

- [X] T013 [US2] `WebsiteForm`: dirty tracking, field-level validation (name required, exact http/https origin, at least one), cancel slot, save disabled until changed
- [X] T014 [US2] `src/manage/WebsiteEditPage.tsx`: back link, focus first field, save then return with flash, failure keeps entries, dirty guard
- [X] T015 [US3] `src/manage/WebsiteAddPage.tsx`: project first, no-project state, create in chosen project, land on Install with flash, project-unavailable handling, dirty guard
- [X] T016 [P] [US2] [US3] Tests: edit flow (dirty prompt, keep editing default, save, failure, validation), add flow (project first, other project, 404, no project)

## Phase 4: US4 Install (P1)

- [X] T017 [US4] `src/manage/install/PathPicker.tsx`: two path cards using tab semantics, Recommended badge, technical name as small text, unavailable state, remembered per website (guarded storage)
- [X] T018 [US4] `src/manage/install/GithubPath.tsx`: loader, workflow, settings step with GitHub-website or `gh` toggle and a variables/secrets table, deploy, check
- [X] T019 [US4] `src/manage/install/SnippetPath.tsx`: snippet, SDK and token endpoint (identifiers, shared-secret note, guide link), deploy, check; disclosure for the generic loader and configuration document
- [X] T020 [US4] `src/manage/install/InstallCheck.tsx`: "Check now" (24h page views and, on the GitHub path, reachability), three outcomes with next steps, failed-check wording
- [X] T021 [US4] `src/manage/InstallPage.tsx`: header, persistent one-path line, path picker, steps, reference section for identifiers, error with retry; remove `InstallationPage.tsx` and `IntegrationSnippet.tsx`
- [X] T022 [P] [US4] Tests: default and remembered path, one-path line, step counts and code blocks per step (max 5 and 1), toggle, copy announcements, check outcomes, missing dynamic mode, load error and retry

## Phase 5: US5 Consistency and polish

- [X] T023 [US5] Analytics no-data hint targets the website's Install page or the list (`AnalyticsView`), and Health links use website pages
- [X] T024 [P] CSS for cards, page header, path cards, steps, code blocks, tables, responsive and forced-colors behavior in `src/styles.css`
- [X] T025 [P] Update existing tests that reference removed pieces (`manage-flows`, `area-separation`, `scope-shell`, `websites.*`, e2e specs) and keep the Analytics separation checks
- [X] T026 [P] Playwright e2e in `e2e/website-pages.spec.ts`: list to page to edit to back, add to install, install path and check, axe on every new page in light and dark, 320px and 200% zoom, keyboard-only edit/add/install
- [X] T027 [P] Docs: README, operator guide, `docs/operations/pages.md` (panel steps), CHANGELOG (Unreleased), UX review notes; no reference to the removed Installation destination
- [X] T028 Gates: typecheck, lint, format, test, coverage above 90%, build, e2e, audit; screenshots reviewed in light, dark, and phone; write `qa-report.md`

## Implementation notes (deviations from the plan)

- The path picker lives in `InstallPage.tsx` rather than its own file; `Tabs.tsx` provides the
  tab semantics for both the path cards and the "In GitHub / With the gh command" toggle.
- Added `components/IdentifierList.tsx` (shared by the website page, the Install page, and the
  paste path) and `manage/WebsiteGate.tsx` (resolves a website from its address, with loading,
  error, and not-found states).
- The variables-and-secrets table became a short list, because a three-column table was
  unreadable at phone width.
- `manage/HealthPage.tsx` now links each website's name to its page.
- Filled buttons and step badges use a new `--color-action` token (darker blue) because white on
  the brand blue was 4.36:1, below the 4.5:1 requirement; this affects every primary button.
- `apps/deploy-cli/tests/contract/deployment-docs.contract.test.ts` was updated: its project-first
  check now looks for "Add website" followed by "empty, required project choice".
- Test files: `website-pages`, `install-page`, `page-primitives`, `websites`, `router`,
  `scope-shell`, `area-separation`, `manage-flows` (health and startup), plus `e2e/website-pages.spec.ts`.


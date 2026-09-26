# Tasks: Simpler Website Management and Install

**Input**: Design documents in `/specs/020-simpler-website-install/` (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: Included. The constitution requires automated tests for changed behaviour, negative tests for security paths, accessibility checks for interface changes, and coverage above 90%.

**Format**: `- [X] T### [P?] [Story?] Description with file path`. `[P]` = different files, no dependency on an unfinished task.

**Stories**: US1 short embed (P1) · US2 add website (P1) · US6 header scope (P1) · US3 GitHub path (P2) · US4 install check (P2) · US7 projects home (P2) · US5 one website page (P3) · US8 Health + access keys (P3). Stories numbered as in spec.md.

Paths are relative to the repository root. `web` = `apps/admin-web`, `api` = `apps/local-ops-api`, `sdk` = `packages/browser-sdk`.

## Phase 1: Setup

- [X] T001 Read `examples/cloudflare-pages/functions/vizoalica/ingest-token.ts` and the `token_source_mismatch` rule in `apps/ingest-api/src/auth/source-authorizer.ts`; record in research.md R8 whether the token claim needs the project ID (decides SC-002 target 5 vs 6; update spec.md SC-002 if it becomes 6)
- [X] T002 [P] Run `pnpm typecheck && pnpm lint && pnpm test` on the clean tree and note the coverage baseline in `specs/020-simpler-website-install/quickstart.md` under "Baseline"
- [X] T003 [P] Add shared test helpers for the new header (environments + projects fixtures with a long name, an unusable environment, no-project case) in `web/tests/fixtures/console.ts`

## Phase 2: Foundational (blocks the user stories)

- [X] T004 Extend route definitions in `web/src/router.ts`: add a `header` flag (false only for `manage/projects`), set `nav: false` for `manage/projects`, `manage/backend`, `manage/access`, and make `manage/backend` render Health (alias); update `web/tests/router.test.tsx`
- [X] T005 [P] Create `web/src/components/origins.ts` exporting `normalizeOrigin(input): { origin?: string; error?: string }` and `wwwCounterpart(origin)` per research.md R9 (trim; add `https://` if no scheme; lowercase host; drop path/query/hash/trailing slash; keep non-default port; reject non-http(s)); reuse `isExactOrigin` from `web/src/components/WebsiteForm.tsx`
- [X] T006 [P] Unit tests for `origins.ts` in `web/tests/origins.test.ts` covering a test set of at least 20 common forms (path, query, trailing slash, uppercase, no scheme, `www`, port, IDN, IP, `ftp:`, empty) with a check that ≥ 90% of the common-form set normalises (SC-005)
- [X] T007 [P] Create the reusable menu button primitive `web/src/components/MenuButton.tsx` (disclosure button + `role="menu"` list, `menuitemradio` items with `aria-checked`, arrow/Home/End/Escape/Enter, focus return, reserved chevron column, second-line detail text, disabled items, footer items) with `web/tests/menu-button.test.tsx`; styles in `web/src/styles.css`

**Checkpoint**: router flags, origin helper and menu primitive exist; stories can proceed.

## Phase 3: US1 - Embed a website with one identifying value (P1) 🎯 MVP

**Goal**: the recommended embed needs at most two copied values; old embeds unchanged.
**Independent test**: copy the short embed onto a page on an allowed origin and see events arrive; an old six-attribute tag still works.

- [X] T008 [P] [US1] Contract tests in `sdk/tests/embed-defaults.test.ts` per contracts/embed-defaults.md: absent `data-token-url` → token fetched from `/vizoalica/ingest-token`; `"none"` → no fetch; 404 token → events sent unsigned without throwing; absent `data-project` → no project field; old six-attribute tag unchanged
- [X] T009 [P] [US1] Tests in `sdk/tests/dynamic-config.test.ts` for a config document without `data-project`, `data-token-url`, `data-consent` (defaults filled) and an old full document (validated exactly as before, non-local `http` and cross-origin token URL still refused)
- [X] T010 [US1] Implement the defaults in `sdk/src/embed.ts` (default token path, `none` opt-out, optional project) and `sdk/src/dynamic-config.ts` (optional fields, defaults) and the loader copy in `sdk/src/dynamic-loader.ts`; rebuild the bundled loader and update the base64 loader copy in `.github/workflows/deploy-vizoalica-pages.yml` if the loader changed
- [X] T011 [P] [US1] Failing-first tests in `api/tests/snippet.test.ts`: short static snippet has only `src="/vizoalica.js"`, `data-endpoint`, `data-source`; `customize` field holds the explicit form; second allowed origin does not change the src; legacy `html` field preserved
- [X] T012 [US1] Update `api/src/routes/snippet.ts` and `api/src/contracts.ts` per contracts/snippet-api.md (short embed, `customize`, dynamic config emitting only non-default values); keep `isDynamicConfigV1` valid for both forms
- [X] T013 [US1] Rework `web/src/manage/install/SnippetPath.tsx` to show the short embed first, a "Customize" disclosure that lists each default with its value and the explicit tag, and one line naming what is assumed; update `web/tests/install-page.test.tsx`
- [X] T014 [US1] Update `docs/operations/browser-sdk.md` and `docs/operations/pages.md` with the short embed, the defaults table and the `data-token-url="none"` opt-out; note in `CHANGELOG.md`

**Checkpoint**: US1 shippable on its own (SDK + API + snippet guidance).

## Phase 4: US2 - Add a website in one short step (P1)

**Goal**: add by pasting an address; project read-only; name defaults to the domain.
**Independent test**: paste `Example.com/pricing?x=1/` in a project, see `https://example.com` and name `example.com`, save.

- [X] T015 [P] [US2] Component tests in `web/tests/websites.test.tsx` (update) and `web/tests/website-pages.test.tsx`: no project select in the add form; read-only "in project X" line; empty name → domain; pasted address preview; `www` tick on by default for a bare domain; unsupported scheme message says what to type; multiple pasted addresses
- [X] T016 [US2] Rework `web/src/components/WebsiteForm.tsx`: remove the `projects` prop and project field, add a `projectName` read-only line, use `normalizeOrigin` with a live preview, `www` counterpart checkbox, optional name defaulting to the first origin's host; keep the `MAX_NAME` = 120 rule and dirty tracking; keep the edit form working with the same component
- [X] T017 [US2] Update `web/src/manage/WebsiteAddPage.tsx`: use `scope.projectId`, send users with no project to the Projects page, remove the "no longer available" project-select branch and keep the 404 handling; add "Add another" after success carrying the same project (feeds US5)
- [X] T018 [US2] Update `web/e2e/website-pages.spec.ts` and `web/e2e/owner.spec.ts` for the address-first form; add an axe check for the form in `web/tests/websites.accessibility.test.tsx`

**Checkpoint**: US1 + US2 give the shortest path from nothing to first events.

## Phase 5: US6 - Environment and project at the top (P1)

**Goal**: one header scope group, clean environment control, one-line footer.
**Independent test**: switch environment then project and visit each page; no overlaps at 320/768/1280 and 200% zoom; footer is one line with three items.

- [X] T019 [P] [US6] Tests in `web/tests/environments-ui.test.tsx` (rewrite) and new `web/tests/scope-header.test.tsx`: name + separate role badge, unusable item disabled with reason, single environment renders the button without a menu, project menu lists only the environment's projects and marks current, keyboard behaviour, project kept/replaced with notice on environment change (FR-027)
- [X] T020 [US6] Create `web/src/shell/EnvironmentMenu.tsx` on `MenuButton` (replaces `web/src/setup/EnvironmentPicker.tsx`; delete the old file); keep the `selectEnvironment` call and error notice
- [X] T021 [US6] Create `web/src/shell/ProjectMenu.tsx` on `MenuButton` (switch only; footer entry "All projects…" to `manage/projects`; empty state "Create your first project") reading `useScope()`
- [X] T022 [US6] Create `web/src/shell/ScopeSwitcher.tsx` (environment first, project second) and mount it in the topbar in `web/src/App.tsx`, hidden per the route `header` flag; ensure it is present in the loading/denied states only where an environment exists
- [X] T023 [US6] Remove the project select from `web/src/shell/ScopeBar.tsx` (keep website, range, notices); adjust `showProject` logic in `web/src/App.tsx` and update `web/tests/scope-shell.test.tsx`, `web/tests/scope-provider.test.tsx`
- [X] T024 [US6] Implement the keep-or-replace project rule with a one-time notice in `web/src/scope/ScopeProvider.tsx` (R11)
- [X] T025 [P] [US6] Replace `web/src/components/AppFooter.tsx` with the one-line footer (`Vizoalica · vizoalica.dev · GitHub`), reduce `web/src/footer-links.ts` to the two links, drop the version, tagline and legal line; style in `web/src/styles.css`; update `web/tests/footer.test.tsx`, `web/tests/footer-version.test.tsx` (remove or repoint to Health), `web/e2e/footer.spec.ts`
- [X] T026 [US6] Responsive and accessibility checks: extend `web/e2e/responsive-accessibility.spec.ts` and `web/e2e/environments.spec.ts` for the header at 320/768/1280 and 200% zoom (no overlap, SC-009), footer wraps cleanly (SC-010), axe clean for the menu

**Checkpoint**: shell complete; scope visible on every page but Projects.

## Phase 6: US3 - Fewer values on the GitHub → Cloudflare path (P2)

**Goal**: guidance states the count and lists only values without a default.
**Independent test**: follow the recommended path on a fresh repo, count values, confirm collection.

- [X] T027 [P] [US3] Tests in `api/tests/snippet.test.ts`: `cloudflare.summary` counts, `defaults` array, `repoVariables` contains only non-default values, starter workflow has no `YOUR_SITE_DIRECTORY` for root sites, `accountLookupCommand` present
- [X] T028 [US3] Make `VIZOALICA_SDK_SRC`, `VIZOALICA_TOKEN_URL`, `VIZOALICA_CONSENT` (and `VIZOALICA_PROJECT_ID` if T001 allows) optional with defaults in `.github/workflows/deploy-vizoalica-pages.yml` (validation loops and generated config), default `site-directory` to the repository root; bump `WORKFLOW_REF` handling in `api/src/routes/snippet.ts` only when the release tag is cut (leave a TODO tied to the release task T046)
- [X] T029 [US3] Implement the response changes in `api/src/routes/snippet.ts` and `api/src/contracts.ts` (`summary`, `defaults`, `accountLookupCommand`, reduced `repoVariables`, root-site workflow) and keep `setupCommands` consistent
- [X] T030 [US3] Update `web/src/manage/install/GithubPath.tsx`: count line up front ("N public values, M secrets"), only non-default variables, single-edit note for subfolder sites, account lookup command replacing the long "where to find" prose for the two account values; update `web/tests/install-page.test.tsx`
- [X] T031 [US3] Update `.agents/skills/vizoalica-cloudflare-deploy/SKILL.md`, `docs/operations/pages.md` and `docs/operations/cloudflare.md` to the reduced variable list; check `examples/cloudflare-pages/functions/vizoalica/ingest-token.ts` still receives what it needs (T001 outcome)

## Phase 7: US4 - Know it is installed, or the one thing to fix (P2)

**Goal**: one named next action; installed state shown without returning to install.
**Independent test**: break SDK file, token endpoint, secret, origin in turn; each is named.

- [X] T032 [P] [US4] Tests in `api/tests/reachability.test.ts` and `api/tests/reachability-route.test.ts` for result codes `working`, `sdk-file-missing`, `token-endpoint-missing`, `token-endpoint-rejecting`, `origin-not-allowed`, `no-event-yet`, each with a single `nextAction`
- [X] T033 [US4] Implement the codes and `nextAction` in `api/src/routes/reachability.ts` (keep the response bounded as today) and `api/src/contracts.ts`
- [X] T034 [US4] Rework `web/src/manage/install/InstallCheck.tsx` to show the one next action, and auto-run when the person says they deployed; update `web/tests/install-page.test.tsx`
- [X] T035 [US4] Show "installed" on the website page and list once the first event has arrived, in `web/src/manage/WebsitePage.tsx` and `web/src/components/WebsiteCard.tsx`, using existing status data; tests in `web/tests/website-pages.test.tsx`
- [X] T036 [US4] Guidance for sites that cannot host the token endpoint (points to the GitHub path or the ready-to-copy endpoint) in `web/src/manage/install/SnippetPath.tsx` and `docs/operations/pages.md`

## Phase 8: US7 - Projects have one home (P2)

**Goal**: create/rename/open/delete only on Projects; the dropdown only switches.
**Independent test**: create a project, see it in the menu, switch, delete the current one, console falls back.

- [X] T037 [P] [US7] Tests in `web/tests/projects.test.tsx`: create only here, current marked with website count, "Open" makes current and goes to Websites, deleting the current project selects another or shows create-first state, no other page offers project creation
- [X] T038 [US7] Rework `web/src/manage/ProjectsPage.tsx`: single "New project" action, current project marked, "Open" action, rename if supported by the API (else omit and note in the plan), keep the typed delete confirmation; remove the now-redundant per-project "Manage websites"/"View analytics" pair in favour of "Open"
- [X] T039 [US7] Handle deleting the current project in `web/src/scope/ScopeProvider.tsx` and `web/src/manage/ProjectsPage.tsx` (fallback selection, first-run state)
- [X] T040 [US7] Update `web/e2e/journey.spec.ts` and `web/e2e/console-areas.spec.ts` for the new project flow and the nav without Projects

## Phase 9: US5 - Manage a website from one page (P3)

**Goal**: one website page with status, embed, check, edit, enable/disable; changes say what they affect.
**Independent test**: edit, disable, re-enable and delete on one website without leaving its page more than once.

- [X] T041 [P] [US5] Tests in `web/tests/website-pages.test.tsx` and `web/tests/manage-flows.test.tsx`: identifiers shown once per website page (FR-020), origin edit shows "nothing to update" or the exact change, delete confirmation states the live tag stops recording, "Add another" flow, pasting several domains
- [X] T042 [US5] Restructure `web/src/manage/WebsitePage.tsx` so Details, Status, Embed/Install and Share are sections; remove the duplicate identifier blocks in `web/src/manage/InstallPage.tsx` and `web/src/manage/install/SnippetPath.tsx` (keep one, in `web/src/components/IdentifierList.tsx` usage)
- [X] T043 [US5] After origin edits in `web/src/manage/WebsiteEditPage.tsx`, show whether the installed site needs updating (normally not, thanks to US1/US3); update the delete confirmation text in `web/src/manage/WebsitePage.tsx`; move enable/disable next to status
- [X] T044 [US5] Multi-address paste in `web/src/components/WebsiteForm.tsx` and "Add another" in `web/src/manage/WebsiteAddPage.tsx` (tests from T041)

## Phase 10: US8 - One Health page, and access that explains itself (P3)

**Goal**: Backend inside Health; Access keys reachable from Share and the environment menu.
**Independent test**: read backend versions from Health; issue and revoke a key from a website's Share section; non-admin sees no key entry.

- [X] T045 [P] [US8] Tests: `web/tests/dashboard.test.tsx`/new `web/tests/health-page.test.tsx` (Backend section first, labelled environment-wide, includes console version, then Websites), router alias test (`#/manage/backend` shows Health), `web/tests/access-state.test.tsx` and `web/e2e/access.spec.ts` (renamed "Access keys", one-sentence purpose, admin only, not in primary nav), `web/e2e/backend.spec.ts` updated
- [X] T046 [US8] Move the versions and health content of `web/src/manage/BackendPage.tsx` into `web/src/manage/HealthPage.tsx` as a first "Backend · whole environment" section (reuse the `Row` table, add the console version); delete `BackendPage.tsx`; update the `manage/backend` case in `web/src/App.tsx`
- [X] T047 [US8] Rename and re-explain `web/src/manage/AccessPage.tsx` as "Access keys" (one sentence on who keys are for); add entry points from `web/src/manage/SharePanel.tsx` and the administrator-only footer item in `web/src/shell/EnvironmentMenu.tsx`; keep the `manage-access-keys` capability gate so non-admins never see it; remove Access from `web/src/shell/AreaNav.tsx`

## Phase 11: Polish and release gates

- [X] T048 [P] Delete dead code and styles (`EnvironmentPicker`, old footer groups, `BackendPage`, unused `styles.css` rules) and run `pnpm lint` and `pnpm typecheck`
- [X] T049 [P] Align docs: `README.md`, `docs/get-started.md`, `docs/operations/environments.md`, `llms.txt`, `apps/cli/README.template.md`, promo demo `scripts/promo/demo-console.ts` and `apps/admin-web/e2e/mock-console.ts` to the new shell, embed and variable list
- [X] T050 Also update the checkout CLI wiring if any CLI text or command reference changed (`scripts/vizoalica.ts` and `apps/cli`, per the project's dual-wiring rule)
- [X] T051 Full run: `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`; confirm coverage above 90%; record results in `specs/020-simpler-website-install/qa-report.md`
- [X] T052 Execute every scenario in `specs/020-simpler-website-install/quickstart.md` manually (including the compatibility scenario with an embed from the previous release) and record evidence in `qa-report.md`; verify SC-001–SC-013
- [X] T053 Contrarian QA pass (skeptical review of the token-path default, origin normalisation edge cases, switcher accessibility) written into `qa-report.md`; then the release owner's go/no-go, CHANGELOG entry, version bump and tag for the workflow reference (closes the TODO from T028)

## Dependencies and order

- Phase 1 → Phase 2 → stories. T001 gates T028–T031 only.
- **Independent of each other**: US1, US2, US6 can run in parallel after Phase 2 (US2 uses T005; US6 uses T004, T007).
- US3 depends on US1 (shared defaults and snippet route). US4 depends on US1 for the new install guidance. US5 depends on US2 (form) and US4 (installed state). US7 depends on US6 (project menu, routes). US8 depends on US6 (environment menu) for the Access keys entry.
- Recommended order: Phase 1–2 → US1 → US2 → US6 → US3 → US4 → US7 → US5 → US8 → Polish.

## Parallel examples

- After Phase 2: one person on T008–T014 (SDK/API/guidance), one on T015–T018 (form), one on T019–T026 (shell).
- Within US6: T019 (tests) and T025 (footer) in parallel; T020, T021 in parallel before T022.
- Within Polish: T048 and T049 in parallel.

## Implementation strategy

- **MVP**: Phase 1–2 plus US1 (short embed with defaults). It delivers the request's first example alone and is fully compatible.
- **Increment 2**: US2 and US6 (shortest add path, and the visible shell fixes: environment control, footer, project beside environment).
- **Increment 3**: US3, US4, US7.
- **Increment 4**: US5, US8, polish, release gates.
- Each phase ends with a checkpoint that can be released behind the existing version process.


## Implementation notes and deviations (2026-09-25)

- **T001**: the signer needs both the project and the source ID, so SC-002 is met with the bundled `VIZOALICA_SITE` variable (research.md outcomes), not by dropping the project ID.
- **T005/T006**: `isInsecureRemote` is a hint, not a refusal; the service accepts any http/https origin.
- **T017/T044**: several pasted addresses become the origins of one website; "Add another website" is a link on the install page. Creating several websites from one paste was not built (spec W10 updated).
- **T020**: for a single environment the control opens a menu only when it has something in it (an administrator's Access keys entry); otherwise it is plain text (spec S1 updated).
- **T035**: the installed state is on the website page, not on the list cards (it would cost one request per card).
- **T038**: no project rename, because the service has none.
- **T053**: the QA pass is in [qa-report.md](qa-report.md). The release owner's go/no-go, the version bump and the `v0.7.3` tag were **not** done; the starter workflow references `v0.7.3`, which does not exist until then.

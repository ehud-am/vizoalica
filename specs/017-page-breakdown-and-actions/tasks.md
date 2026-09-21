---
description: "Task list for Page Breakdown and Actions Report"
---

# Tasks: Page Breakdown and Actions Report

**Input**: Design documents from `/specs/017-page-breakdown-and-actions/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included and written first in every story. The constitution requires automated unit,
integration, contract, end-to-end, and negative tests for new behavior, and repository coverage must
stay above 90% for lines and branches. Write each test task before its implementation tasks and
confirm it fails for the right reason.

**Organization**: Tasks are grouped by user story so each story can be built, tested, and shipped on
its own. Stories 1 and 2 (both P1) fix the page breakdown and can ship without the rest.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 to US5, matching the user stories in [spec.md](./spec.md)
- Every task names the file or files it changes

## Path conventions

pnpm monorepo. Paths are from the repository root: `packages/{privacy,event-contracts,browser-sdk}`,
`apps/{ingest-api,ingest-worker,local-ops-api,deploy-cli,admin-web}`, `deploy/cloudflare/migrations`,
`docs/`. Vitest picks up `packages/**/tests`, `apps/**/tests`, and `docs/tests`; console end-to-end
tests are in `apps/admin-web/e2e`.

## Rules that apply to every task

- Never run `git clean -x` (or delete ignored files) in the main checkout: it holds the git-ignored
  production Wrangler config. Use a throwaway `git worktree` for clean-tree experiments.
- No secrets, no real account access. Anything that touches Cloudflare uses scratch resources named
  `vizoalica-rehearsal-*` only (see quickstart section 7).
- Comments explain non-obvious intent only (thresholds, why `replaceState` is ignored, why actions have
  their own batches); do not restate the code.
- Keep `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` green at every commit.

---

## Phase 1: Setup

**Purpose**: Confirm the starting point and add the shared test helper.

- [ ] T001 Confirm the branch is green before any change: run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm test -- --coverage`; record the date, command results, and the overall line and branch coverage figures under "Baseline" in `specs/017-page-breakdown-and-actions/verification-log.md` (create it; coverage must not drop below 90% by the end of the feature)
- [ ] T002 [P] Add a jsdom page helper in `packages/browser-sdk/tests/support/page.ts` that sets `location` (path and hash), builds a small DOM, stubs `fetch` to capture request bodies, and exposes helpers to click, press Enter or Space, call `history.pushState`, and set `document.referrer`; use `// @vitest-environment jsdom` in the tests that import it

---

## Phase 2: Foundational (blocks every story)

**Purpose**: The one shared building block all three P1 to P2 stories need: the page key.

**⚠️ CRITICAL**: US1, US2, and US3 all use `normalizePagePath`. Identifier grouping is added to it in US2.

- [ ] T003 [P] Write failing tests in `packages/privacy/tests/page-path.test.ts` for the steps in [contracts/page-path-normalization.md](./contracts/page-path-normalization.md) other than identifier grouping: `pathname` plus `hash` input and a single `url_path` string with one `#` as input; fragment kept only if it begins with `/`; fragment cut at the first `?`; anchors (`#section-2`) and token fragments (`#access_token=abc&state=x`) discarded; anything after a second `#` discarded; empty segments dropped; trailing slash removed except the root; result truncated to 1,024 characters; result never contains `?`; never throws on odd input (empty string, only `#`, very long, non-string); idempotent (`normalize(normalize(x)) == normalize(x)`)
- [ ] T004 Implement `normalizePagePath` in `packages/privacy/src/page-path.ts` and export it from `packages/privacy/src/index.ts`, following the six steps in the contract; put step 4 (identifier replacement) behind a single `isIdentifierSegment(segment)` function that returns `false` for now, with a comment that US2 fills it in; use `privacyLimits.maxUrlPathLength` (1,024) from `packages/privacy/src/policy.ts` for truncation

**Checkpoint**: `pnpm vitest run packages/privacy` passes. Story work can start.

---

## Phase 3: User Story 1 - See Every Page, Not Just "/" (Priority: P1) 🎯 MVP

**Goal**: Each screen of a fragment-routed or history-routed site is reported as its own page, with a
view counted on each arrival.

**Independent Test**: Visit a sample site with five in-page screens (three addressed after `#`, two by
`pushState`) several times; the Pages report lists five separate entries with correct counts and no
pooled `/` entry (spec Story 1, SC-001).

### Tests for User Story 1 (write first, confirm they fail)

- [ ] T005 [P] [US1] Write `packages/browser-sdk/tests/navigation.test.ts` (jsdom, using `tests/support/page.ts`): a page view on load; a new view on `history.pushState`, `popstate`, and `hashchange` when the page key changes; no view for `replaceState` alone; no double view when `hashchange` and `popstate` both fire for one fragment navigation; the initial load is not counted twice; visiting A, B, A gives A two views; navigating to the page you are already on gives no new view; the wrapper calls the original `pushState` first, returns its result, and never throws even if the listener throws; no in-page views when `consentState` is `analytics-denied` (FR-025) while the initial view keeps today's behavior
- [ ] T006 [P] [US1] Extend `packages/privacy/tests/redaction.test.ts` and `packages/browser-sdk/tests/privacy.test.ts` so `redactUrl` and `currentPage` return the page key: `/` plus `#/pricing` gives `/#/pricing`; `#section-2` and `#access_token=...` are ignored; a fragment query is dropped; plain paths behave exactly as before (FR-005 for history)
- [ ] T007 [P] [US1] Extend `apps/ingest-api/tests/unit/privacy-guard.test.ts`: a `page_view` whose `url_path` is `/#/pricing` is accepted and stored unchanged; a path containing `?` is still rejected as `unredacted_url_query`; an older event with `url_path` `/` is unchanged (FR-005); an event carrying a non-route fragment is re-normalized to the plain path
- [ ] T008 [P] [US1] Extend `apps/ingest-worker/tests/dashboard-rollups.integration.test.ts` (existing fake-D1 style): page views with `url_path` `/#/a`, `/#/b`, `/c` produce separate `page_path` dimension bindings and no `/` entry standing in for them (SC-001)

### Implementation for User Story 1

- [ ] T009 [US1] Update `redactUrl` in `packages/privacy/src/redaction.ts` so `url_path` is `normalizePagePath` of the URL's `pathname` plus `hash`; keep `url_origin` and `url_query_redacted` as they are
- [ ] T010 [US1] Update `packages/browser-sdk/src/privacy.ts` (`currentPage`) and `packages/browser-sdk/src/events.ts` (`buildPageViewEvent`) to use the page key; the page-view contract in `packages/event-contracts/schemas/event-data-page-view.schema.json` is NOT changed (research R1: `additionalProperties: false` would make older backends reject the event)
- [ ] T011 [US1] Create `packages/browser-sdk/src/navigation.ts` exporting `watchNavigation(onNavigate)` that wraps `history.pushState`, listens for `popstate` and `hashchange`, defers the callback with `queueMicrotask`, suppresses repeats of the last page key, ignores `replaceState`, is safe to call twice, and returns a `stop()` that restores the original `pushState`; add a comment explaining why `replaceState` is not navigation (research R2)
- [ ] T012 [US1] Wire it in `packages/browser-sdk/src/index.ts` and `packages/browser-sdk/src/types.ts`: add `autoNavigation?: boolean` (default `true`) to `VizoalicaConfig`; after `init` starts, call `client.page()` on each navigation; skip when `consentState` is `analytics-denied`; seed the last page key from the initial page so the first load is not counted twice; do not add an embed `data-*` switch for it
- [ ] T013 [US1] In `apps/ingest-api/src/ingestion/privacy-guard.ts`, normalize `data.page.url_path` of every `page_view` event with `normalizePagePath` before it is stored (returning a copy), keeping the existing `?` rejection and forbidden-content checks
- [ ] T014 [P] [US1] Make the Pages and Overview lists show full page keys cleanly: add a test in `apps/admin-web/tests/dashboard.test.tsx` that `/#/pricing` and `/app#/orders/:id` render as written in the Top pages tables, and adjust `apps/admin-web/src/styles.css` so long page keys wrap inside the table without horizontal page scroll at phone width
- [ ] T015 [P] [US1] Extend `packages/browser-sdk/examples/basic.html` with a small fragment-routed sample of five screens (three addressed after `#`, two using `history.pushState`) and a note on capturing requests with a local mock endpoint, for the quickstart's manual check
- [ ] T016 [US1] Document pages and in-page navigation in `docs/operations/browser-sdk.md` (new "Pages and in-page navigation" section): what counts as a page, that only route-shaped fragments (starting with `/`) are recorded with their query dropped, which navigations produce a view, that `replaceState` and same-page navigation do not, and the consent behavior; source: [contracts/sdk-action-collection.md](./contracts/sdk-action-collection.md) "In-page navigation"
- [ ] T017 [US1] Run `pnpm browser-sdk:build`, then `pnpm vitest run packages/privacy packages/browser-sdk apps/ingest-api apps/ingest-worker apps/admin-web/tests/dashboard.test.tsx`; confirm `packages/browser-sdk/tests/bundle.test.ts` passes with the rebuilt bundle and that `examples/cloudflare-pages/public/vizoalica-loader.js` was re-synchronized by the build script

**Checkpoint**: Story 1 works alone. Quickstart section 2 passes.

---

## Phase 4: User Story 2 - One Entry for Pages That Differ Only by an Identifier (Priority: P1)

**Goal**: `/orders/8841` and `/orders/8842` are reported as one `/orders/:id`, and the raw identifier is
never stored, in the SDK and at ingestion.

**Independent Test**: Visit `/orders/8841`, `/orders/8842`, `/orders/8843`, a UUID-bearing
`/users/<uuid>/settings`, and `/blog/my-first-post`; the report shows `/orders/:id` (3),
`/users/:id/settings` (1), and `/blog/my-first-post` unchanged, with no original identifier anywhere
(spec Story 2).

### Tests for User Story 2 (write first, confirm they fail)

- [ ] T018 [P] [US2] Extend `packages/privacy/tests/page-path.test.ts` with the fixed corpus from [contracts/page-path-normalization.md](./contracts/page-path-normalization.md): a "must group" list of at least 40 digit-only (`8841`, `2`, `0007`), UUID (any case), hexadecimal of 16 or more characters, token (20 or more of `A-Za-z0-9_-` with an uppercase, a lowercase, and a digit, for example `V1StGXR8_Z5jdHi6B-myT`), and `@`-containing segments in varied positions; a "must stay" list of at least 40 words, slugs (`my-first-post`, `blue-widget`, `my-first-post-2026-review`), versions (`v2`), file names (`logo-1234.png`), short hex-letter words, 15-character hex strings, and date runs (`/blog/2026/09/launch`, `/2026/9/5/x`); a lone year (`/orders/2026`) groups while `/orders/2026/12` is kept; every worked example in the contract verbatim; idempotence over the whole corpus; grouping inside a fragment route (`#/orders/8841?tab=items` gives `/#/orders/:id`); 1,000 distinct `/orders/<n>` inputs collapse to one key (SC-002, SC-003)
- [ ] T019 [P] [US2] Extend `apps/ingest-api/tests/unit/privacy-guard.test.ts`: an older SDK's `url_path` `/orders/8841` is stored as `/orders/:id`; an already-grouped `/orders/:id` is unchanged; an email-shaped segment is grouped; the event returned by the guard contains none of the original identifier values
- [ ] T020 [P] [US2] Extend `apps/ingest-worker/tests/dashboard-rollups.integration.test.ts`: 1,000 accepted page views for `/orders/<n>` written through the pipeline's guard and rollup path bind one `page_path` dimension value `/orders/:id` with a count of 1,000, and no binding or saved event contains any `<n>` value (SC-002)
- [ ] T021 [P] [US2] Extend `packages/browser-sdk/tests/events.test.ts`: `buildPageViewEvent` on `/orders/8841` yields `url_path` `/orders/:id`, on `/` plus `#/orders/8841?tab=x` yields `/#/orders/:id`, and the serialized event body contains neither `8841` nor `tab=x`

### Implementation for User Story 2

- [ ] T022 [US2] Implement `isIdentifierSegment` and the date-run exception in `packages/privacy/src/page-path.ts` exactly per the contract table: digits only; UUID (case-insensitive); hexadecimal of 16 or more characters; 20 or more of `A-Za-z0-9_-` containing an uppercase, a lowercase, and a digit; contains `@`; keep a year (`19xx` or `20xx`) immediately followed by a month (`1` to `12`, one or two digits), then optionally a day (`1` to `31`); `:id` is never itself an identifier; add short comments on why the token rule needs three character classes and why hex needs 16 characters
- [ ] T023 [US2] Document the rules in `docs/operations/browser-sdk.md` ("How pages are grouped": the table, the date-run exception, the worked examples, the `/page/2` and `/orders/2026/12` consequences, that readable slugs are not recognized, that older data is not regrouped) and add one sentence to `docs/operations/privacy.md` that identifiers in paths are replaced before storage
- [ ] T024 [P] [US2] Update the Pages description in `apps/admin-web/src/analytics/ListPages.tsx` to mention that pages differing only by an ID (such as `/orders/:id`) are grouped, with a matching assertion in `apps/admin-web/tests/dashboard.test.tsx`

**Checkpoint**: Stories 1 and 2 work together. This is the smallest shippable increment (see MVP below). Quickstart section 3 passes.

---

## Phase 5: User Story 3 - Actions Report: What People Click (Priority: P2)

**Goal**: Visitors' clicks on buttons and links are collected automatically and shown on a new,
view-only Actions page as page-and-action rows with counts and distinct visitors.

**Independent Test**: On a sample site with the updated SDK, click a known set of buttons and links on
two pages a known number of times; the Actions page lists each action against the right page with the
right count and visitor count, sorted by most used, and offers no control that changes a setting
(spec Story 3, SC-004).

### Tests: contract, privacy, and SDK (write first)

- [ ] T025 [P] [US3] Extend `packages/event-contracts/tests/schema-validation.test.ts`: a valid action event validates; extra properties, a missing `kind`, an unknown `kind`, an empty `name`, a `name` over 80 characters, a missing `page.url_path`, and an added top-level field are rejected; an action `destination` without `url_origin` is rejected; all existing page-view and custom-event fixtures still validate unchanged (FR-026); a batch mixing the three event types validates and each event matches exactly one `oneOf` branch
- [ ] T026 [P] [US3] Write `packages/privacy/tests/labels.test.ts` for `redactLabel`: whitespace collapsed and trimmed; email addresses become `[email]`; runs of six or more digits become `[number]`; token-shaped words (the T022 token rule) become `[token]`; result cut at 80 characters after redaction; empty input gives an empty string; never throws; idempotent
- [ ] T027 [P] [US3] Write `packages/browser-sdk/tests/actions.test.ts` (jsdom): a click on `button`, `a[href]`, `input` of type `button`, `submit`, `reset`, and `image`, and on elements with role `button`, `link`, `menuitem`, and `tab` yields one action with the right `kind` (`link` for anchors and role link, `button` for buttons, input buttons, and role button, `other` for the rest); a click on a child inside such a control resolves to the control; Enter and Space on a focused button and Enter on a focused link yield one action; no action for text inputs, textareas, selects, `contenteditable`, plain text, images, empty space, and for clicks inside a password, payment (`autocomplete="cc-*"`), or one-time-code field; naming precedence without markings is `aria-label`, then visible text (or `value` for input buttons), then `title` or contained image `alt`, then `Unlabeled button` or `Unlabeled link` or `Unlabeled control`; the name is redacted and at most 80 characters; a link records `destination` as origin plus normalized path only (no query, no fragment) and `mailto:`, `tel:`, and `javascript:` links record no destination; the page recorded is the current page key; a second identical action within 500 ms is dropped and one after 500 ms is recorded (fake timers); the 101st action in a rolling minute is dropped; nothing is recorded when `consentState` is `analytics-denied`; an exception inside the handler (for example a throwing `textContent` getter) never reaches the page; the handler never calls `preventDefault` or `stopPropagation`; a label of 100,000 characters is handled in well under 50 ms (SC-007)
- [ ] T028 [P] [US3] Write `packages/browser-sdk/tests/batching.test.ts`: actions are posted in their own request, separate from page views and custom events; when the backend answers `400` for an action batch the page views still go out, the action batch is dropped and not requeued, and `queuedEvents` returns to zero (version-skew, research R7); `413` is dropped the same way; network failure, `429`, and `5xx` still requeue at the front as today; the existing `failure.test.ts` and `queue.test.ts` still pass unchanged

### Implementation: contract, privacy, and SDK

- [ ] T029 [US3] Add the action event contract: create `packages/event-contracts/schemas/event-data-action.schema.json` as a copy of [contracts/action-event.v1.schema.json](./contracts/action-event.v1.schema.json); add `com.vizoalica.action.v1` to the `type` enum and a third `$ref` in the `data` `oneOf` of `packages/event-contracts/schemas/cloudevent-batch.schema.json`; in `packages/event-contracts/src/index.ts` add the type to `eventTypes`, an `ActionData` interface (`page: { url_origin, url_path }`, `action: { name: 1 to 80 characters, kind: 'button' | 'link' | 'other', destination?: { url_origin, url_path } }`, `visitor`, `session`), `schemas.action`, and `ajv.addSchema(actionSchema, './event-data-action.schema.json')`
- [ ] T030 [P] [US3] Implement `redactLabel` in `packages/privacy/src/labels.ts`, add `maxActionNameLength: 80` to `privacyLimits` in `packages/privacy/src/policy.ts`, and export both from `packages/privacy/src/index.ts`
- [ ] T031 [US3] Create `packages/browser-sdk/src/actions.ts` exporting `watchActions(onAction, options)`: one passive, capturing `click` listener on `document`; find the control with `closest()` over the eligible selectors; classify the kind; derive the name (precedence steps 2 to 5 of research R5; step 1 is added in US5); apply `redactLabel`; build the link destination with `normalizePagePath` on the pathname for `http` and `https` only; suppress a repeat of the same page, name, kind, and destination within 500 ms; stop after 100 actions in any rolling minute; wrap everything in `try/catch`; return `stop()`; exclude text inputs, textareas, selects, and `contenteditable`; truncate label text to a few hundred characters before redaction so cost stays bounded
- [ ] T032 [US3] Wire actions into the client: in `packages/browser-sdk/src/events.ts` add `buildActionEvent` (type `com.vizoalica.action.v1`, same envelope, consent state, `visitor`, and `session` as page views); in `packages/browser-sdk/src/types.ts` add the action event to `VizoalicaEvent` and `autoActions?: boolean` (default `true`) to `VizoalicaConfig`, commented as programmatic-only; in `packages/browser-sdk/src/index.ts` start `watchActions` from `init`, skipped when `consentState` is `analytics-denied`; in `packages/browser-sdk/src/queue.ts` and `index.ts` `flush()` send actions in their own batch, separate from page views and custom events; in `flush()`, do not requeue a batch answered with status `400` or `413` (all other failures requeue as today)
- [ ] T033 [US3] Add to `packages/browser-sdk/tests/embed.test.ts` a test that no script `data-*` attribute (including `data-auto-actions`) can turn action collection off, matching the decision that collection is always on, and confirm `packages/browser-sdk/src/embed.ts` reads none

### Tests: ingestion and storage (write first)

- [ ] T034 [P] [US3] Extend `apps/ingest-api/tests/unit/privacy-guard.test.ts` for action events: a valid event is accepted; `page.url_path` and `destination.url_path` are re-normalized (identifiers grouped, fragments cleaned); a path or destination path containing `?` is rejected as `unredacted_url_query`; `action.name` is re-redacted and re-truncated; a name that is empty after redaction becomes the fallback for its kind (`Unlabeled button`, `Unlabeled link`, `Unlabeled control`); an email-like name is stored as `[email]`; custom-event and page-view handling is unchanged
- [ ] T035 [P] [US3] Extract the real-SQLite D1 adapter from `apps/ingest-worker/tests/purge-deleted.test.ts` into `apps/ingest-worker/tests/support/sqlite-d1.ts` (using `node:sqlite`), add an `applyMigrations(sqlite)` helper that runs every `deploy/cloudflare/migrations/*.sql` file in filename order, and switch `purge-deleted.test.ts` to it (it must still pass with the new tables present once T036 exists)
- [ ] T036 [US3] Add the two tables and their indexes to the baseline `deploy/cloudflare/migrations/0001_initial.sql` (owner decision: no the new tables migration; no change to existing tables), exactly per [data-model.md](./data-model.md): `dashboard_minute_actions` with `project_id TEXT NOT NULL`, `source_id TEXT NOT NULL`, `minute_utc TEXT NOT NULL`, `page_path TEXT NOT NULL`, `action_name TEXT NOT NULL`, `action_kind TEXT NOT NULL CHECK (action_kind IN ('button', 'link', 'other'))`, `destination TEXT NOT NULL` (`''` for non-links, otherwise origin plus path), `event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0)`, primary key on every column except `event_count`; `dashboard_minute_action_visitors` with the same seven key columns plus `visitor_digest TEXT NOT NULL` and `identity_kind TEXT NOT NULL CHECK (identity_kind IN ('source-local', 'project-supplied'))`, primary key on all columns; indexes `(project_id, source_id, minute_utc, page_path, action_name)` and `(project_id, minute_utc, source_id, page_path, action_name)` on the counts table and `(project_id, source_id, page_path, action_name, minute_utc)` on the visitors table
- [ ] T037 [US3] Update the fresh-install inspection: add `dashboard_minute_actions` and `dashboard_minute_action_visitors` to `VIZOALICA_SCHEMA_TABLES` in `apps/deploy-cli/src/fresh-schema.ts` and to the expected query in `apps/deploy-cli/tests/contract/fresh-schema.contract.test.ts`; then search the repository (`grep -rn "0001_initial\|VIZOALICA_SCHEMA_TABLES\|dashboard_minute_visitors"` excluding `node_modules`, `dist`, `specs`, and `docs/.vitepress/dist`) and update every script, test, or document that assumes a single migration or lists the dashboard tables, including `scripts/check-fresh-d1.ts` and `apps/deploy-cli/tests/contract/deployment-docs.contract.test.ts` if affected
- [ ] T038 [P] [US3] Write `apps/ingest-worker/tests/action-rollups.integration.test.ts` against real SQLite with the baseline schema applied: one action gives one count row and one visitor row for its minute, page key, name, kind, and destination; the same action again in the same minute increments `event_count`; a replayed batch (same event ids) counts once; the same visitor in two minutes counts once in a range but two rows exist; two visitors give two visitor rows; two projects with identical pages and names never see each other's rows; actions write nothing to `dashboard_minute_totals`, the page-view dimensions, or the legacy `dashboard_rollups` and hourly tables; `visitor_digest` is never the raw anonymous id; a bad `action_kind` is rejected by the `CHECK`; page-view rollups behave exactly as before
- [ ] T039 [P] [US3] Extend `apps/ingest-worker/tests/dashboard-retention.test.ts` and `apps/ingest-worker/tests/purge-deleted.test.ts` (real SQLite): rows in both new tables older than the retention boundary are deleted by `deleteExpiredDashboardData` in bounded batches while newer rows remain; deleting a project or website removes its rows in both tables and leaves other projects' rows

### Implementation: ingestion and storage

- [ ] T040 [US3] Extend `applyPrivacyGuard` in `apps/ingest-api/src/ingestion/privacy-guard.ts`: recognize `com.vizoalica.action.v1`; reject `?` in `page.url_path` and `destination.url_path`; return a copy with `page.url_path` and `destination.url_path` passed through `normalizePagePath`, and `action.name` through `redactLabel` with the per-kind fallback when empty; keep the existing checks for the other event types
- [ ] T041 [US3] Create `apps/ingest-worker/src/storage/action-rollups.ts` with the recording side: expand accepted action events into keyed groups (project, source, minute, page key, action name, kind, destination), compute the keyed `visitor_digest` and `identity_kind` exactly as `recordDashboardRollups` does for page views, and build the `INSERT ... ON CONFLICT DO UPDATE` count statements and `INSERT OR IGNORE` visitor statements that select from `dashboard_seen_events` by nonce and event digest so replays count once
- [ ] T042 [US3] In `apps/ingest-worker/src/storage/d1-repositories.ts`, route action events through the new module inside `recordDashboardRollups`: insert their digests into `dashboard_seen_events` with the same nonce, add the action statements to the same batch, do not write the legacy `dashboard_rollups`, hourly, totals, or dimension tables for actions, and leave page-view and custom-event behavior identical; add `dashboard_minute_actions` and `dashboard_minute_action_visitors` (on `minute_utc`) to the `deleteExpiredDashboardData` list and to the per-project deletion and purge table lists (the `dashboard_*` list near the top of the file and its `DELETED_PROJECTS` clauses)

### Tests: report backend and API (write first)

- [ ] T043 [P] [US3] Write `apps/ingest-worker/tests/actions-report.integration.test.ts` (real SQLite, baseline schema, seeded rows): `totals.actions` and `totals.uniqueUsers` for project and single-website scope; `rows` ordered by `count` descending, then `page`, then `action`; at most 100 rows and `other` exact so `sum(rows.count) + other.count == totals.actions`; each row's `visitors` is the distinct count over the range and `pageViews` comes from the `page_path` dimension (0 when absent); `actions[]` per-action totals across pages, at most 50, with `pages` count; the range is honored at minute boundaries; projects are isolated; a deleted website gives not-found; the serialized response contains no digest, anonymous id, session id, or event id
- [ ] T044 [P] [US3] Write `apps/ingest-worker/tests/actions-report.contract.test.ts` (style of `dashboard-admin.contract.test.ts`): `GET /v1/admin/projects/:id/analytics/actions` returns 200 with the documented shape and `cache-control: no-store`; invalid or missing range gives 400 `invalid_range` with `field`; unknown project or website gives 404; missing or wrong admin credential gives 401 or 403 like the other admin routes; a non-`GET` method is not routed
- [ ] T045 [P] [US3] Write `apps/local-ops-api/tests/actions.contract.test.ts` (style of `analytics.contract.test.ts`): `GET /api/projects/:id/analytics/actions` proxies to the Worker path and returns the body unchanged; unsafe ids give `invalid_request`; range errors map to the range error; `401` and `403` map to `unauthorized`, `404` to `not_found`, `400` to `invalid_request`, other failures to `unavailable`; the route requires the same browser session as other `/api/` routes

### Implementation: report backend and API

- [ ] T046 [US3] Add the report types and repository method: `ActionsReport` (and its row, action-total, and selection types per [contracts/actions-report-api.md](./contracts/actions-report-api.md)) in `apps/ingest-api/src/domain/types.ts`, and `getActionsReport?(projectId, sourceId | undefined, startUtc, endUtc, filters?)` on the admin repository in `apps/ingest-api/src/storage/repositories.ts`
- [ ] T047 [US3] Implement `getActionsReport` in `apps/ingest-worker/src/storage/action-rollups.ts` and expose it from `D1Repositories`: one batched read like `getAnalyticsOverview` (project and source scoping with the same `scopeSql`, minute range); grouped counts limited to 100 rows ordered by count desc, page, action; an exact `other` from a total query; visitors per returned row via `COUNT(DISTINCT visitor_digest)` over `dashboard_minute_action_visitors` restricted to the returned rows; `pageViews` per row from `dashboard_minute_dimensions` where `dimension_kind = 'page_path'`; per-action totals (at most 50) across pages; `availability` from `dashboard_aggregate_watermarks` as in the overview; unknown or deleted project or website returns `undefined`
- [ ] T048 [US3] Add the route in `apps/ingest-worker/src/http/admin-adapter.ts`: `GET /v1/admin/projects/:id/analytics/actions` using `parseAnalyticsRange` and the `AnalyticsRangeError` mapping exactly like the overview route, `source_id` optional, 404 for `undefined`, `Cache-Control: no-store`
- [ ] T049 [US3] Add `analyticsActions` in `apps/local-ops-api/src/routes/analytics.ts` (safe-id and range validation, proxy, error mapping identical to `analyticsOverview`), the route `/api/projects/:id/analytics/actions` in `apps/local-ops-api/src/server.ts`, and the `ActionsReport` type in `apps/local-ops-api/src/contracts.ts`

### Tests: console (write first)

- [ ] T050 [P] [US3] Extend `apps/admin-web/tests/router.test.tsx` and `apps/admin-web/tests/area-separation.test.tsx`: `analytics/actions` parses, has label `Actions`, is a navigation item directly after Pages, uses project-and-website scope controls, shows the range control, belongs to the Analytics area, and its screen contains no control that creates, edits, enables, disables, or deletes anything
- [ ] T051 [P] [US3] Write `apps/admin-web/tests/actions-page.test.tsx` (with fixtures) and extend `apps/admin-web/tests/local-operations.api.test.ts`: `getAnalyticsActions` builds the right URL and encodes parameters; the page shows loading placeholders that keep the layout, an error with "Try again", a ranked table with Page, Action, Kind, Actions, Visitors, and "Actions per page view" columns, the destination for link rows, a dash for the rate when `pageViews` is 0, an "Other" row from `other`, the per-action totals card, empty state (a) with page views but no actions (explains what an action is, that updated SDK files report them, and links to installation guidance), and empty state (b) with no data (the existing first-run hint); a scope or range change refetches and aborts the earlier request and never shows stale results
- [ ] T052 [P] [US3] Write `apps/admin-web/tests/actions.accessibility.test.tsx`: the table has real headers with `scope`, a named scroll region, a caption or accessible name, status and error text not conveyed by color alone, the empty states are announced through `role="status"`, all interactive elements are reachable and operable by keyboard with `userEvent`, and the stylesheet keeps `:focus-visible`, reduced-motion, and forced-colors rules (pattern of `analytics.accessibility.test.tsx`)

### Implementation: console

- [ ] T053 [US3] Add `ActionsReport` types and `getAnalyticsActions(projectId, sourceId, startUtc, endUtc, filters, signal)` to `apps/admin-web/src/api/local-operations.ts` (filters used in US4), mirroring [contracts/actions-report-api.md](./contracts/actions-report-api.md)
- [ ] T054 [US3] Add the `analytics/actions` route to `ROUTES` in `apps/admin-web/src/router.ts` (area `analytics`, label `Actions`, `nav: true`, placed directly after `analytics/pages`, scope `project-website`, `range: true`) and render it in `apps/admin-web/src/App.tsx`
- [ ] T055 [US3] Extract the heading, no-project, error, and range-notice frame from `apps/admin-web/src/analytics/AnalyticsView.tsx` into `apps/admin-web/src/analytics/AnalyticsFrame.tsx`; `AnalyticsView` keeps its behavior by using it (all existing analytics tests must pass unchanged)
- [ ] T056 [US3] Create `apps/admin-web/src/analytics/useActionsReport.ts`: loads the report for the current scope and range with an `AbortController`, exposes `status`, `report`, `error`, and `retry` in the manner of `AnalyticsProvider`, clears the previous result while loading, and never returns stale data
- [ ] T057 [US3] Create `apps/admin-web/src/components/ActionsTable.tsx`: the ranked table using the markup of `RankedList` (scroll region with an accessible name, `th scope`), the columns from T051, `formatNumber`, and a rate formatted with the existing helpers in `apps/admin-web/src/format.ts` (may exceed 100%; the header carries the text "Actions per page view"); an "Other" row from `report.other`; and a second small table for per-action totals
- [ ] T058 [US3] Create `apps/admin-web/src/analytics/ActionsPage.tsx` using `AnalyticsFrame`, `useActionsReport`, and `ActionsTable`, with both empty states from T051; add any needed styles to `apps/admin-web/src/styles.css`
- [ ] T059 [P] [US3] Extend the console fixtures and end-to-end mock: add an actions report fixture in `apps/admin-web/tests/fixtures/console.ts` and the `analytics/actions` endpoint in `apps/admin-web/e2e/mock-console.ts`; write `apps/admin-web/e2e/actions.spec.ts` (navigate to Actions from the navigation, table and totals visible, empty states, no settings controls, `@axe-core/playwright` scan in light and dark themes, keyboard-only walk); add the Actions route to the route list in `apps/admin-web/e2e/responsive-accessibility.spec.ts` so it is checked at phone and desktop widths
- [ ] T060 [US3] Verify the story: run `pnpm vitest run packages apps/ingest-api apps/ingest-worker apps/local-ops-api apps/deploy-cli apps/admin-web` and `pnpm --filter @vizoalica/admin-web test:e2e -- --grep "Actions"`; fix failures; confirm quickstart sections 4 to 6 pass

**Checkpoint**: Actions are collected, aggregated, and reported. Stories 1 to 3 work together.

---

## Phase 6: User Story 4 - Deep Dive: Actions Per Page (Priority: P3)

**Goal**: The owner can narrow the Actions report to one page (with its views, action total, and each
action's rate) or to one action (with every page it occurred on), and the selection is in the
address.

**Independent Test**: Open the Actions page, select a page and confirm its view count and only its
actions with rates; select an action and confirm every page where it occurred is listed; reload the
address and get the same view (spec Story 4).

### Tests for User Story 4 (write first)

- [ ] T061 [P] [US4] Extend `apps/ingest-worker/tests/actions-report.integration.test.ts` and `actions-report.contract.test.ts`: `page` and `action` filters match exactly (case-sensitive); `selection.page` is `{ path, views, actions }` only when `page` is given; `actions[]` ignores the `page` filter and honors the `action` filter; `other` stays exact under filters; a `page` over 1,024 characters, an `action` over 80 characters, or either containing a control character gives 400 `invalid_request`; values such as `'; DROP TABLE x; --` are bound as data and match nothing
- [ ] T062 [P] [US4] Extend `apps/local-ops-api/tests/actions.contract.test.ts` and `apps/local-ops-api/tests/validation.test.ts`: `page` and `action` pass through to the Worker unchanged and are URL-encoded; the same length and control-character limits are enforced before proxying
- [ ] T063 [P] [US4] Extend `apps/admin-web/tests/router.test.tsx`: `#/analytics/actions?page=%2Fpricing&action=Start%20free%20trial` parses to `params { page: '/pricing', action: 'Start free trial' }`; a malformed percent-encoding falls back to no filter; unknown parameters are ignored; `?` on other routes is ignored and website-id routes still parse; `hrefFor` with params encodes them; `useRoute` updates when only the params change
- [ ] T064 [P] [US4] Extend `apps/admin-web/tests/actions-page.test.tsx`: choosing a page cell narrows the report and shows a summary strip with the page's views, its total actions, and each row's rate; choosing an action name lists every page it occurred on; filters appear as removable chips with accessible names ("Remove page filter"); clearing them restores the full report and the address; opening the address directly with filters shows the narrowed report; a status message announces the narrowing to assistive technology; the tail is still summarized as "Other" with its total

### Implementation for User Story 4

- [ ] T065 [US4] Add the `page` and `action` filters in `apps/ingest-worker/src/storage/action-rollups.ts` (exact-match conditions on the counts, visitors, and page-view queries, `selection.page`, `actions[]` semantics per the contract) and their validation in `apps/ingest-worker/src/http/admin-adapter.ts` (at most 1,024 and 80 characters, no control characters, else 400 `invalid_request`); update the `getActionsReport` filter type in `apps/ingest-api/src/storage/repositories.ts`
- [ ] T066 [US4] Pass the filters through in `apps/local-ops-api/src/routes/analytics.ts` and `apps/local-ops-api/src/server.ts` with the same limits, and add the filters to `getAnalyticsActions` in `apps/admin-web/src/api/local-operations.ts`
- [ ] T067 [US4] Add query parameters to the hash router in `apps/admin-web/src/router.ts`: `parseRoute` splits an optional `?` part from the hash and returns `params` (only `page` and `action`, URI-decoded, malformed values dropped); `Route` gains `params`; `hrefFor(path, websiteId?, params?)` encodes them; `useRoute` compares them so a change re-renders
- [ ] T068 [US4] Update `apps/admin-web/src/analytics/useActionsReport.ts` to read the route params and refetch when they change; update `apps/admin-web/src/components/ActionsTable.tsx` so page cells and action names are real links to the narrowed address; update `apps/admin-web/src/analytics/ActionsPage.tsx` with the summary strip, removable filter chips, and a polite status message; add styles to `apps/admin-web/src/styles.css`
- [ ] T069 [US4] Extend `apps/admin-web/e2e/actions.spec.ts` with keyboard-only narrowing (Tab to a page link, Enter, see the summary, remove the chip), the address updating, and reload restoring the view; run `pnpm vitest run apps/admin-web apps/ingest-worker apps/local-ops-api` and `pnpm --filter @vizoalica/admin-web test:e2e -- --grep "Actions"`

**Checkpoint**: Stories 1 to 4 work. Quickstart section 5 passes fully.

---

## Phase 7: User Story 5 - Name or Exclude Individual Controls (Priority: P3)

**Goal**: Developers can name a control and exclude a control or a whole area, the only per-control
setting; collection itself stays always on.

**Independent Test**: On a sample site, click an excluded control and a control with an explicit name;
the excluded one never appears in the Actions report and the named one appears under the chosen name
(spec Story 5).

### Tests for User Story 5 (write first)

- [ ] T070 [P] [US5] Write `packages/browser-sdk/tests/action-markings.test.ts` (jsdom): `data-vizoalica-action="Buy now"` on a control is its name and outranks `aria-label`, visible text, and `title`; an empty value falls through to the next source; the explicit name is redacted and truncated like any label; `data-vizoalica-ignore` on the control records nothing; `data-vizoalica-ignore` on any ancestor records nothing for everything inside; ignore beats an explicit name; an attribute added after load is honored because it is read at click time

### Implementation for User Story 5

- [ ] T071 [US5] Add the two markings to `packages/browser-sdk/src/actions.ts`: `data-vizoalica-ignore` checked on the control and its ancestors with `closest()`, and `data-vizoalica-action` as the first name source, both read at click time
- [ ] T072 [P] [US5] Document naming and excluding in `docs/operations/browser-sdk.md` ("Naming and excluding controls": the precedence list and both markings with one example each, from [contracts/sdk-action-collection.md](./contracts/sdk-action-collection.md)) and add a named and an excluded control to the sample in `packages/browser-sdk/examples/basic.html`

**Checkpoint**: All five stories work. Quickstart section 4 passes fully.

---

## Phase 8: Polish and Cross-Cutting Concerns

**Purpose**: Privacy review, documentation, upgrade notes, and the quality gates.

- [ ] T073 [P] Write `docs/privacy/action-collection-review.md` in the format of `docs/privacy/audience-attributes-review.md` (status, decisions table, rules for later additions): for each of action name, action kind, link destination (origin and path), page key with route fragment, and identifier grouping, record purpose, what is stored, retention (the existing 32-day dashboard aggregate window; raw batches follow the existing raw-batch policy), access boundary (aggregates only, project-scoped, administrator credential, no visitor identifiers), and re-identification risk, including the small-count judgment for labels; list what is never collected; link it from `docs/.vitepress/navigation.ts` next to the audience attributes review and add a short summary and link to `docs/operations/privacy.md`
- [ ] T074 [P] Complete the action-collection section of `docs/operations/browser-sdk.md` from [contracts/sdk-action-collection.md](./contracts/sdk-action-collection.md): always on, what is an action, what is recorded, what is never recorded (with the redaction rules), consent behavior, rate cap and de-duplication, separate batches and skew behavior; keep it consistent with the sections added in T016, T023, and T072
- [ ] T075 [P] Update the operations docs: `docs/operations/pages.md` (after upgrading, rebuild and recopy `vizoalica.js`; upgrade the backend first), `docs/operations/cloudflare.md` ("Update an existing backend": this release changes the D1 schema, so a fresh install on a new empty database is the supported path), `docs/operations/releases.md` (the "Deployment boundary" section: this release changes the schema and is fresh-install-only), `docs/operations/cost-model.md` (about three D1 rows per action, the two new tables in the retention list, actions bounded by the same quotas), and `docs/operations/local-analytics.md` (the new Actions page)
- [ ] T076 [P] Update `CHANGELOG.md` under `[Unreleased]`: Added (Actions page, always-on action collection, identifier grouping), Changed (page keys now include route fragments; SDK sends actions in separate batches and drops permanently rejected batches), and **Upgrade notes** (the schema changed so this is a fresh-install-only release, backend before SDK files, that collection begins when a website's SDK file is updated, and the consent and privacy summary); mention the new capability and the Actions page in `README.md`'s console section; add the new page and contracts to `llms.txt`; the version bump to 0.6.0 happens in the release task
- [ ] T077 Run the documentation and contract tests that assert on these files and fix what they flag: `pnpm vitest run docs apps/deploy-cli/tests/contract apps/admin-web/tests/docs-links.test.ts apps/admin-web/tests/install-page.test.tsx`
- [ ] T078 Run the full quality gates and fix anything they report: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test -- --coverage` (lines and branches at or above 90% overall and not below the T001 baseline), `pnpm test:e2e`, and `pnpm browser-sdk:build`; record the results and coverage figures under "Final gates" in `specs/017-page-breakdown-and-actions/verification-log.md`
- [ ] T079 Do the manual accessibility and usability check the constitution requires and record it in `specs/017-page-breakdown-and-actions/accessibility-report.md`: keyboard-only walk of the Actions page including narrowing, focus visibility, a screen-reader pass of the table and status messages (VoiceOver), light and dark themes, and phone width; time how long it takes an owner unfamiliar with the page to find the ten most-used actions on one page starting from the console home (SC-005, target under one minute)
- [ ] T080 Run every scenario in [quickstart.md](./quickstart.md) sections 1 to 6 and record the outcomes under "Quickstart" in `specs/017-page-breakdown-and-actions/verification-log.md`; run section 7 (upgrade rehearsal) only in a separate `git worktree` with scratch `vizoalica-rehearsal-*` resources and never against the production database or Wrangler config; finally re-read [spec.md](./spec.md), [plan.md](./plan.md), and the contracts against the shipped behavior and fix any drift in the documents or the code

---

## Dependencies and execution order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: needs Phase 1's baseline check; blocks all stories.
- **US1 (P1)** and **US2 (P1)**: start after Phase 2. US2 edits the same `page-path.ts` that US1 relies on, so do US1 first, or run them in parallel and merge the small `isIdentifierSegment` change last.
- **US3 (P2)**: needs Phase 2, and uses US2's grouping for destinations and page keys, so start after US2 (its contract, privacy, and SDK tests can begin earlier).
- **US4 (P3)**: needs US3's endpoint, route, and page.
- **US5 (P3)**: needs US3's `actions.ts`.
- **Polish (Phase 8)**: after the stories you intend to ship.

### Within a story

- Tests first and failing, then implementation.
- Contracts and types before code that uses them (T029 before T031 to T032 and T040; T036 before T038 to T042; T046 before T047 to T049; T053 before T056 to T058).
- Storage before report queries (T041 to T042 before T047), report backend before the proxy (T048 before T049), proxy before the console client (T049 before T053).
- Console: client (T053), route (T054), frame (T055), hook (T056), table (T057), page (T058).

### Story dependency graph

```text
Setup ─> Foundational ─> US1 ─> US2 ─> US3 ─> US4
                                         └──> US5
                                  (US1+US2 alone = shippable page fix)
```

## Parallel opportunities

- **Phase 1**: T001 and T002.
- **US1 tests**: T005, T006, T007, T008 (four different files); then T014 and T015 alongside T010 to T013.
- **US2 tests**: T018, T019, T020, T021; T024 alongside T022 to T023.
- **US3 tests**: T025, T026, T027, T028 (contract, privacy, SDK), T034, T035, T038, T039, T043, T044, T045, T050, T051, T052 touch separate files and can be written together; implementation tasks in different packages (`packages/browser-sdk`, `apps/ingest-worker`, `apps/local-ops-api`, `apps/admin-web`) can proceed in parallel once T029, T036, and T046 land.
- **US4 tests**: T061, T062, T063, T064.
- **Polish docs**: T073, T074, T075, T076.

### Example: US3 in parallel across three people or agents

```text
A (SDK):     T027 T028  ->  T030 T031 T032 T033
B (backend): T034 T035 T038 T039 T043 T044 T045  ->  T036 T037 T040 T041 T042 T046 T047 T048 T049
C (console): T050 T051 T052  ->  T053 T054 T055 T056 T057 T058 T059     (against the mock endpoint)
```

## Implementation strategy

### MVP first: Stories 1 and 2 (Phases 1 to 4)

They are the P1 defect fix and need no schema change and no new event type, so they are
safe to ship and roll out alone: the Pages report becomes correct for fragment-routed and
history-routed sites, and older SDK files immediately benefit from identifier grouping through the
ingestion guard. Stop here, run `pnpm test` and quickstart sections 2 and 3, and demo.

### Incremental delivery

1. Phases 1 to 4: page breakdown and grouping (MVP).
2. Phase 5: actions collected and reported (changes the baseline schema; backend-first rollout).
3. Phase 6: deep dive.
4. Phase 7: naming and excluding.
5. Phase 8: privacy review, documentation, upgrade notes, gates.

Each phase adds value without breaking the previous one; the version-skew protections (separate
action batches, dropped permanent rejections) land with US3 so the SDK is safe against an older
backend from its first release.

### Notes

- Commit after each task or small group; keep gates green.
- Release-time work (version bump, alignment review, contrarian QA report, human go/no-go) is outside
  this feature and stays with the release process.
- Out of scope, do not build: an MCP tool for actions, owner-defined grouping patterns, regrouping
  older events, funnels, a console exclusion list, a per-website collection switch.

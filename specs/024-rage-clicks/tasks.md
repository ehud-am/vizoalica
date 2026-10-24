# Tasks: Rage Clicks

**Tests**: Included (constitution: negative tests, coverage above 90%, accessibility checks).

## Phase 1: Collection

- [X] T001 SDK burst detection in `packages/browser-sdk/src/actions.ts`; tests in `tests/actions.test.ts` (3 within 1 s, slow clicks, different controls, keyboard, cooldown, per-minute cap, links, typing fields, ignored controls, separate request)
- [X] T002 Event contract: `action.rage` in the schema and `ActionData`; schema tests (true only)
- [X] T003 Rebuild the generated SDK (`pnpm browser-sdk:build`)

## Phase 2: Storage and report

- [X] T004 Migration `0007_rage_click_reports.sql`, `EXPECTED_SCHEMA_VERSION` 7; tests in `migrations.test.ts`, `schema-version.test.ts`, `backend-info.test.ts`
- [X] T005 `apps/ingest-worker/src/storage/rage-rollups.ts`; wire into `d1-repositories.ts` (burst routing, own batch tolerant of a missing table, retention, purge, `getRageClicksReport`) and `index.ts`
- [X] T006 Admin route in `admin-adapter.ts`; contract, integration, end-to-end and stale-database tests

## Phase 3: Surfaces

- [X] T007 Local API route and contract test
- [X] T008 Console page, hook, tables, router entry; unit tests, Playwright (areas, responsive, axe in both themes)
- [X] T009 MCP `get_rage_clicks` with tests

## Phase 4: Documentation and release material

- [X] T010 `docs/operations/rage-clicks.md`, privacy review, navigation, SDK/AI/privacy/operator pages, skill, `llms.txt`, README
- [X] T011 Release notes `docs/releases/v0.12.0.md`, CHANGELOG, version 0.12.0
- [X] T012 Clean-context QA review and pre-release test cycle: [qa-report-independent.md](qa-report-independent.md) (GO WITH CONDITIONS)
- [X] T013 QA follow-up: retention and purge tolerate a table a database update has not created yet (M1); wording of clicks and rate, look-alike controls, empty filter, and consent enforcement (m1 to m4)
- [ ] T014 Release owner go/no-go

## Notes

- Three tests fail in the cloud session with and without this change: one filesystem-permission test each in
  `apps/local-ops-api/tests/preferences.test.ts` and `apps/cli/tests/rotate-command.test.ts` (the suite runs as
  root), and the env-proxy warning test in `apps/deploy-cli/tests/unit/cli.test.ts` (the session sets
  `NODE_OPTIONS`). They do not touch this feature.
- The axe-over-all-screens Playwright test now takes about 35 s in the cloud session against its 30 s default
  timeout [likely]; it passes with a longer timeout.

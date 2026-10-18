# Tasks: Exclude Internal Traffic

**Input**: `specs/023-exclude-internal-traffic/` (spec.md, plan.md, data-model.md, contracts/)

**Tests**: Included. Stories: US1 address exclusion (P1), US2 browser opt-out (P1), US3 transparency (P2).

## Phase 1: Foundation

- [X] T001 [US1] `apps/ingest-api/src/ingestion/address-match.ts`: `parseAddressEntry` (canonical form, v4/v6/CIDR, mapped v4, host bits zeroed), `parseAddressList` (max 25, dedupe, whole-list refusal), `isExcluded(address, entries)`; table-driven tests in `apps/ingest-api/tests/unit/address-match.test.ts` (>= 30 forms, boundaries for /0 /8 /24 /32 /48 /64 /128)
- [X] T002 [P] Migration `deploy/cloudflare/migrations/0006_internal_traffic_exclusion.sql` per data-model.md; case in `migrations.test.ts`; `EXPECTED_SCHEMA_VERSION = 6` in `schema-version.ts` (after 0005 from feature 022) and the dependent tests (`schema-version`, `backend-info`)

## Phase 2: Ingestion (US1)

- [X] T003 [US1] Domain: `Source.excludedAddresses`, `IngestionDecision.decision` gains `'excluded'`; read the column in `sourceFromRow` (tolerating a database older than schema 6)
- [X] T004 [US1] Pipeline: `clientAddress` request input; after authorization and token/origin checks and before the privacy guard, quota and storage, drop an excluded batch, call `recordExcludedHits`, return 202 excluded; pass `cf-connecting-ip` from `worker-adapter.ts` through `eventsBatchResponseForBody`; the address is never logged
- [X] T005 [US1] D1: `recordExcludedHits` (upsert), `getExcludedHits`, include in retention and purge lists; bind both in `apps/ingest-worker/src/index.ts`
- [X] T006 [US1] Tests: pipeline unit tests (excluded, outside range, bad token from excluded address is 401, no address header, empty list does no extra work, custom events and actions dropped, nothing stored or rolled up, quota untouched) and an end-to-end test through `worker.fetch` on the real schema

## Phase 3: Admin API (US1, US3)

- [X] T007 [US1] `admin-adapter.ts`: accept and validate `excludedAddresses` on create and update; whole-request refusal; `updateSource`/`createSource` persistence; strip addresses for analysts and add `excludedAddressCount`; no addresses in audit or errors
- [X] T008 [US3] `GET .../sources/:s/excluded-hits` and `excludedAddressCount`/`excludedHits30d` in `.../status`; contract tests for roles, scope, bounds, old Worker 404

## Phase 4: SDK opt-out (US2)

- [X] T009 [US2] `packages/browser-sdk/src/ignore.ts` and `index.ts`: read `vizoalica_ignore`, set/clear/check the flag with try/catch, return a no-op client when ignoring (no network, no observers); tests per SC-005; rebuild the generated SDK

## Phase 5: Console and MCP (US1, US3)

- [X] T010 [US1] local-ops-api contracts and routes (`contracts.ts`, `routes/websites.ts`, new excluded-hits proxy) with contract tests
- [X] T011 [US1] Console: `WebsiteForm` field (labelled textarea, one entry per line, hint, per-entry error), add/edit pages, role gating, tests; `WebsitePage` excluded-hits card with the "browser opt-outs are not counted" note
- [X] T012 [US3] MCP `website_status` additions (entry count, 30-day excluded hits) and tests
- [X] T013 Playwright: website page and form in the accessibility/responsive specs; mock console data

## Phase 6: Documentation

- [X] T014 [P] `docs/operations/internal-traffic.md`; update privacy, browser-sdk, ai, operator-local pages, navigation, skill

## Phase 7: Release 0.11.0 (both features)

- [X] T015 Version bump to 0.11.0 in `package.json` (and any version files the packaging check requires), `CHANGELOG.md`, `docs/releases/v0.11.0.md`, `docs/index.md`, `docs/.vitepress/navigation.ts`, `docs/tests/site.spec.ts`
- [X] T016 Pre-release checks per `docs/operations/releases.md` and the constitution: format, lint, typecheck, unit/contract/integration tests with coverage, build, SDK build, Playwright (incl. axe), package build and check, deploy workflow check, dependency audit, secret scan; alignment review (code, specs, contracts, docs, README, skill); contrarian QA report in each feature's `qa-report.md`
- [X] T017 Rehearse the upgrade: apply migrations 0001 to 0006 to an empty database and the 0.5.2 fixture, and apply 0005 and 0006 to a populated 0004 database, without touching the live account

## Implementation notes and deviations

- The exclusion field is on the Edit page only (spec FR-008 was amended); creating a website does not take a list,
  although the admin API does.
- The Worker admin API accepts `excludedAddresses` on create, update, and returns it only to the admin and owners.
  The local API validates the list a second time (same parser) so a bad entry never travels, and forwards the
  entry's position and reason in a 400.
- A backend older than 0.11 ignores `excludedAddresses` on update. The console detects the missing list in the
  reply and tells the person to update the backend (QA report finding 6).
- Release tasks T015 to T017 apply to both features; the evidence is in `specs/022-utm-campaign-report/qa-report.md`.

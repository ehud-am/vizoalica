# QA report: UTM Campaign Report (with the shared 0.11.0 release checks)

**Date**: 2026-10-17 · **Branch**: `release/0.11.0` · **Reviewer**: AI agent in a skeptical QA stance. The same agent wrote the code, so
this is a self-review, not an independent one. The release owner decides go/no-go.

## Results (whole release, run serially on the committed tree)

| Check                                                | Result                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`, `pnpm lint`, `pnpm typecheck`   | pass                                                                                                                |
| `pnpm coverage`                                      | 197 files, 1,978 tests pass (baseline before this work: 185 files, 1,746). Lines 97.06%, branches 90.98%, statements 95.92% (gate: 90% lines and branches) |
| `pnpm test:e2e` (Playwright, admin web)              | 90 pass, including axe in light and dark on every screen (Campaigns added), 320 px and 200% zoom, keyboard flows, and the built SDK bundle in a real browser |
| `pnpm build`, `pnpm browser-sdk:build`               | pass; the generated Worker SDK and the Pages loader are current (no diff after rebuild)                              |
| `generate:deploy-workflow:check`, `actionlint`       | up to date, clean                                                                                                   |
| `pnpm package:build` + `package:check`               | `vizoalica@0.11.0` package ready to publish                                                                         |
| Docs site: `docs:build`, `docs:test`                 | 12 pass, 2 skipped by design (analytics consent); includes axe, 320 px, 200% zoom, links, CSP on the two new pages and the two privacy reviews |
| `pnpm audit --prod --audit-level high`               | no high findings; 1 moderate (`fast-uri` via `ajv`), not introduced by this release                                   |
| `gitleaks` on `main..HEAD`                           | no leaks                                                                                                            |
| Migrations                                           | `0005` and `0006` applied from an empty database, from the real 0.5.2 fixture, and on a populated 0.10.0 database (rows kept, safe defaults). All in memory; no live account was touched |

## Measured against the spec (022)

SC-001 end-to-end through the real `worker.fetch` on the real schema (`campaigns-end-to-end.test.ts`); SC-002 hostile
samples cleaned in the browser, at the guard and in storage (`campaign.test.ts`, `privacy-guard.test.ts`, the
end-to-end test also checks the stored R2 batch); SC-003 50 route changes after a tagged landing record one campaign
view, in jsdom and in a real browser with the built bundle; SC-004 1,000 distinct campaigns give 20 / 50 / `other` with
exact sums; SC-005 untagged page views prepare no campaign statement (test); SC-006 axe light and dark, 320 px and 200%
zoom, keyboard; SC-007 coverage above 90%.

## Alignment review (code, specs, contracts, operations documents, README, skill)

Each claim below was checked against the code or a test, not only against another document.

| Item                                             | Outcome                                                                                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Console proxy path in the 022 contract           | Wrong (`/api/environments/...`); fixed to `/api/projects/:projectId/analytics/campaigns`, which the code and tests use                     |
| Order of redaction and lowercasing in 022 data model | Wrong in the first draft; corrected, with the reason (the token rule reads letter case)                                                |
| 023 FR-008 (add and edit pages)                  | Implemented on the Edit page only; the spec was amended and says why                                                                       |
| 023 FR-009 (install check)                       | The install check sends no events, so the requirement became a statement; the website card is how an owner notices                        |
| "Nothing is stored in the browser" (README, privacy page, docs index, llms.txt) | No longer exactly true with the opt-out switch; README and the privacy page now say "visitors' browsers" and describe the one exception. `docs/index.md` and `llms.txt` already say visitors' browsers or do not claim it |
| Browser SDK cache                                | `/vizoalica.js` is cached for an hour; the campaigns page says browsers may keep the old file for up to an hour                          |
| Update order (backend before SDK bundle)         | Present in the changelog, release notes, both operations pages and the Campaigns page empty state                                          |
| Tool lists                                       | `get_campaigns` is in the MCP server, the AI page, the skill and its data model; `website_status` additions are in the AI page and skill     |
| Navigation, release notes, docs site test list   | New pages, both privacy reviews and `v0.11.0` are in the navigation, the page list and the site tests                                     |
| Schema version                                   | `EXPECTED_SCHEMA_VERSION` 6 matches the migration directory (a test compares them); backend-info and schema tests updated               |

## Contrarian findings and their resolution

1. **Wiring the Worker never exercised by mocks** (the failure the project had in 0.6.0). *Resolved.*
   `getCampaignsReport` is bound in `apps/ingest-worker/src/index.ts`, and the end-to-end test and the access-key
   scope test call it through `worker.fetch`.
2. **Case: redaction ran after lowercasing would miss mixed-case tokens.** *Resolved.* Redaction runs first (the token
   rule reads letter case); a test pins it (`aB3dE6gH9jK2mN5pQ8sT1vW4` → `[token]`).
3. **A hostile client posting `campaign` with extra keys, empty objects, or oversize values.** *Resolved.* The schema
   rejects an empty object, extra keys, over-length and non-string values (400, nothing stored); anything that passes
   is cleaned again by the guard. Tested at schema, guard and Worker level.
4. **The first cleaning rule stripped non-Latin scripts** (combining marks such as Devanagari vowel signs are not
   letters). *Resolved.* `\p{M}` is kept; tests for Devanagari and accented Latin. Invisible formatting characters,
   emoji and markup are still removed.
5. **Double counting on single-page sites.** *Resolved.* Only the first page view of a client carries the campaign,
   read at start; tested with 50 route changes, with `autoPageView` off, and in a real browser.
6. **A Worker deployed before its database migration.** *Reduced, not eliminated.* Page views that carry a campaign
   would fail the rollup batch on a database without the new tables. `vizoalica deploy --update` applies migrations
   before the Worker, the console's schema check warns when the database is behind, and the docs give the update
   order. This is the same exposure 0.10.0 had for custom events.
7. **Old backend rejecting the new SDK field.** *Resolved by disclosure.* Release notes, changelog, docs and the
   Campaigns page empty state all say to update the backend before bundling the SDK.
8. **Real Cloudflare D1.** *Not done.* Tests run the real SQL on SQLite (`node:sqlite`). The report uses row values
   (`(a, b, c) IN (SELECT ...)`) and CTEs, both supported by D1's SQLite, but no query was run on a live D1 database.
   Recommended before tagging: `vizoalica deploy dev --update` on a scratch environment, then load a tagged URL.
9. **Manual screen-reader pass.** *Not done.* axe, keyboard and reflow checks pass; a person should still listen to the
   Campaigns tables once.
10. **Small campaigns can point at a person if the owner tagged a link for that person.** *Accepted and documented*
    in the privacy review; no suppression rule was added (consistent with action names).

## Deviations from the plan

See "Implementation notes and deviations" in [tasks.md](tasks.md).

## Recommendation

Ready for human review. Before tagging: run findings 8 and 9 (a scratch-environment deploy and a screen-reader pass).

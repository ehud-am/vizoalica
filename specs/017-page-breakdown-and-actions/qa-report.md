# QA report: page breakdown, identifier grouping, and actions (v0.6.0)

**Date**: 2026-09-21. **Reviewer**: an AI agent acting as a skeptical QA engineer, as the constitution
requires before a release. It was also the implementer, which is a weakness this report tries to
offset by testing against real systems (a real browser, real SQL, the live Worker) instead of only
against its own mocks. **Release decision**: made by the human release owner, who approved shipping
in the conversation on 2026-09-20 and delegated the mechanics. The agent recommends GO, subject to
the open items at the end.

## What was reviewed and how

| Method                                  | What it covered                                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Code and contract review                | SDK, privacy package, event schema, ingestion guard, rollups, report query, admin route, local API, console            |
| Unit, integration, contract tests       | 137 test files, 1,085 tests; coverage 97.7% lines, 92.2% branches (gate: 90%)                                            |
| Real SQL                                | Rollups, replay, isolation, retention, and the report run against the actual `0001_initial.sql` schema (`node:sqlite`)  |
| Real browser (Chromium)                 | The built SDK bundle: fragment routes, `pushState`, back, real Enter key, ignored controls, typed text; axe scans        |
| Adversarial and negative tests          | Hostile filter text, oversized and control-character input, replays, cross-project reads, frozen `history`, bad ranges  |
| Measurement                             | Query time on 30 days of synthetic traffic (430,000 dimension rows, 260,000 action rows, 2 websites)                     |
| Live verification                       | The deployed Worker, through the same OneCLI path the CLI uses; health, auth, the new route, error cases                 |

## Findings

| #   | Severity        | Finding                                                                                                                                                                                                                                                                              | Resolution and evidence                                                                                                                                                                                                                                             |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | High            | **The deployed Worker answered 404 for the new admin route.** `index.ts` hands the admin handler an explicit list of bound repository methods, and `getActionsReport` was not on it. Every unit and contract test passed because they use mocks. Found only by calling the live Worker. | Added the binding. New `actions-end-to-end.test.ts` posts real batches through `worker.fetch` on the real schema and reads the report back. Verified the test **fails without the fix** and passes with it. Redeployed; live route returns 200 for all three projects. |
| F2  | High            | **The report read cost scaled with rows shown times range.** Page views and visitors were per-row correlated subqueries, and no index leads with page or action, so each scanned the whole range. Measured **12.2 s** at 30 days (local SQLite); D1 would be slower.                       | Replaced with one grouped scan each, restricted to the rows shown: **1.3 s** at 30 days, 285 ms at 7 days, 35 ms at 24 hours. Query plan checked. Two secondary indexes the planner never used were removed (each added a write per action), from the schema and the live database. |
| F3  | Medium          | **Ignoring `replaceState` left the SDK's remembered page stale**, so a router redirect was never counted and a later `pushState` to the same page was counted twice. The first design chose this deliberately; a real test contradicted it.                                          | `replaceState` is now observed, and the page-key de-duplication prevents inflation (the key ignores queries). Design docs corrected (research R2). Tests for redirect, query-only change, and A-B-A.                                                              |
| F4  | Medium          | **The identifier rules missed ULIDs** (uppercase letters and digits), a common id shape. The corpus test caught it.                                                                                                                                                                  | Added an exact ULID rule; the contract, research table, and public docs were updated to match. Corpus: 42 must-group and 42 must-stay segments.                                                                                                                        |
| F5  | Medium          | **Keyboard focus was lost when narrowing the report**, because the link that had focus disappears while the new data loads (WCAG 2.4.3).                                                                                                                                              | Focus moves to the main region when the selection changes (not on first load). Unit test.                                                                                                                                                                         |
| F6  | Low             | The "no page views recorded" dash used `aria-label` on a bare `span`, which assistive technology does not reliably announce.                                                                                                                                                          | Replaced with hidden dash plus screen-reader text. Test updated.                                                                                                                                                                                                  |
| F7  | Low             | Installing the history wrappers could throw into the host page (frozen `history`), and could leave one of two wrappers installed.                                                                                                                                                      | Installation is all-or-nothing and `init` swallows setup failure, staying a no-op. Two tests.                                                                                                                                                                      |
| F8  | Info, limit     | Action names keep record numbers shorter than six digits ("Order 8841"). Seen in the real-browser run.                                                                                                                                                                                | By design and documented in the SDK guide, the privacy docs, and the privacy review; the remedy is `data-vizoalica-action`. Not changed: a stricter rule would also rewrite years and quantities.                                                                  |
| F9  | Info            | The maintainer's git-ignored `wrangler.production.toml` has no `[triggers]` section, unlike the current example. The live daily cleanup cron (`17 3 * * *`) is present and survived both deploys.                                                                                     | Verified through the Cloudflare API before and after. Nothing changed. The maintainer may want the cron added to that file so a future fresh deploy keeps it.                                                                                                      |
| F10 | Info            | Immediately after the first deploy, one project's route returned 404 once, then 200 on the next call.                                                                                                                                                                                | Transient during rollout. Re-checked all three projects on later deploys: 200 every time.                                                                                                                                                                          |

## Requirements alignment

Every functional requirement has at least one automated check; the main ones are listed. Success
criteria are marked where evidence is partial.

| Requirement                                                     | Evidence                                                                                                                                                  |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 to FR-004, FR-007 (pages, in-page navigation, fragments) | `navigation.test.ts`, `page-path.test.ts`, guard tests, real-browser spec (six views for six arrivals, back returns to `/docs`)                            |
| FR-005 (old events untouched)                                   | No regrouping code exists; guard and rollup tests assert old-style paths are only normalized on the way in                                                 |
| FR-008 to FR-012 (identifier grouping)                          | Corpus of 84 segments, 1,000-page collapse test, SDK and guard tests, worker end-to-end test (no original identifier in stored batches or reports)         |
| FR-013 to FR-017 (collection, privacy, dedup)                   | `actions.test.ts` (eligible controls, keyboard, typed fields, redaction, destinations, dedup, rate cap, 50 ms budget), `batching.test.ts`                    |
| FR-018 to FR-023 (report, page, selection, bounds, a11y)        | Report integration and contract tests, `actions-page.test.tsx`, router tests, e2e flows, axe in both themes, keyboard-only walk                             |
| FR-024, FR-025 (markings, consent)                              | Marking tests; no-switch test on the embed script; consent tests for actions and navigation                                                                |
| FR-026, FR-027 (new versioned event, aggregates only)           | Schema tests (old events still valid, one `oneOf` branch each); tests that no digest, id, or session appears in reports                                    |
| FR-028 (documentation)                                          | SDK guide, privacy page, privacy review, changelog, release notes; docs build and accessibility tests pass                                                 |
| SC-005 (find the top ten in under a minute)                     | **Not measured** (needs a person)                                                                                                                         |
| SC-007 (under 50 ms per click)                                  | Unit test with a 100,000-character label; real-browser run showed no visible delay; not profiled in a production page                                      |
| SC-008 (zero automated violations; keyboard only)               | axe finds none in either theme; manual screen-reader pass **not done**                                                                                     |
| SC-009 (data as fresh as page views)                            | Same synchronous write path; verified on real SQL; not yet observed on a real production event (see open items)                                            |

## Live deployment record

- Backend: D1 `vizoalica-config` received the two additive tables (existing rows unchanged: 3 projects,
  3 websites, all aggregates), the Worker was deployed three times (final version `5c02b693`), and the
  R2 bucket, bindings, secrets, and cron were left as they were.
- A full export of the database from before the change was taken first (742 rows) and kept outside the
  repository.
- Verified after the final deploy: `/healthz`, authenticated project listing, the new route (200 for
  all three projects, `no-store`), `invalid_range` and `invalid_request` for bad input, `not_found` for
  an unknown project, and 401 for a direct request with no credential.

## Open items and residual risk

1. **No human accessibility or usability pass** (task T079): no screen reader (VoiceOver) run, and the
   SC-005 timing was not measured. Automated scans and keyboard tests pass. Recommended before relying on
   the page for anyone with assistive technology.
2. **Production behavior under real traffic is unproven.** Ingestion of a real signed action from a real
   visitor is verified in tests and the real-browser run, not yet on the live backend. The docs site
   (vizoalica.dev) publishes the new SDK when this release merges, which will exercise it.
3. **D1 performance** was measured on local SQLite. 1.3 s for a 30-day range on a dense synthetic dataset
   is acceptable but is not a D1 measurement; long ranges on a busy site are the case to watch.
4. **Pages recorded before this release** keep their old paths, so old and new rows can name one page
   two ways for up to 32 days.
5. **Slugs that identify a record** (`/products/blue-widget`) and record numbers under six digits in
   labels are not recognized. Documented, with remedies.
6. **The SDK is self-hosted per website.** Nothing changes for a site until its owner updates the file,
   and a site that updates it starts recording clicks, which the release notes and privacy review say.
7. **The same agent implemented and reviewed the change.** The findings above show the review was not
   ceremonial, but an independent human reading of `privacy-guard.ts` and `actions.ts` is worthwhile.

## Recommendation

GO for v0.6.0, with items 1 and 2 followed up after publication.

# Independent QA report: Vizoalica v0.12.0 (spec 024, rage clicks)

**Produced by a separate AI agent, started with clean context, that did not write or change this code and
re-ran every check itself.** It read the constitution's release gates, the spec 024 documents, the privacy
review and the diff (`git diff origin/main...HEAD`) first, and formed its own view before opening any other QA
report. The report of spec 022 was read only to copy its structure. No source, spec, doc or test was modified and
nothing was committed; this file is the only file added to the repository.

- **Date**: 2026-10-24 (UTC)
- **Commit reviewed**: `d2f48efc98aced55b0f374701c6f78341b9ff629` on the release branch (working tree clean at start and at end)
- **Reviewer's recommendation**: **GO WITH CONDITIONS** (section 7). No blocker. One major finding (section 4) needs the
  release owner's decision. The human release owner makes the decision.

## 1. Pre-release test cycle (all run by me, serially, on the committed tree)

| #   | Command                                                         | Result                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm format:check`                                             | pass                                                                                                                                                                                                                      |
| 2   | `pnpm lint`                                                     | pass, no output                                                                                                                                                                                                           |
| 3   | `pnpm typecheck` (incl. `typecheck:examples`)                   | pass                                                                                                                                                                                                                      |
| 4   | `pnpm test`                                                     | **fail: 3 failed, 2,067 passed (203 files, 2,070 tests)**. The 3 failures are sandbox-caused and also fail on `origin/main` (section 2)                                                                                   |
| 5   | `pnpm coverage`                                                 | exits 1 for the same 3 tests, and prints no summary on failure. Re-run with `--coverage.reportOnFailure=true`: statements 95.85%, **branches 90.84%**, functions 96.01%, **lines 97.05%**. Gate (lines and branches above 90%) met; branch margin is 0.84 points |
| 6   | `pnpm build`                                                    | pass                                                                                                                                                                                                                      |
| 7   | `pnpm browser-sdk:build`, then `git status`                     | pass; **no drift** (status empty), so `apps/ingest-worker/src/generated/browser-sdk.ts` matches the SDK source                                                                                                           |
| 8   | `pnpm generate:deploy-workflow:check`                           | pass                                                                                                                                                                                                                      |
| 9   | `pnpm package:build && pnpm package:check`                      | pass, "The package is ready to publish"; the packed CLI (`apps/cli/package/dist/cli.mjs --version`) prints `0.12.0`; the package contains `schema/0007_rage_click_reports.sql`                                            |
| 10  | `pnpm test:e2e` (Playwright, Chromium)                          | Default launch fails (all 93 tests: the expected headless-shell build is not installed). Re-run from a temporary untracked config pointing at `/opt/pw-browsers/chromium` with `--no-sandbox` (deleted afterwards): **92 passed, 1 failed** (`footer.spec.ts:85`, keyboard focus order). That test also fails on `origin/main` (section 2). The new `rage-clicks.spec.ts` (page, axe light and dark) passes, as do the areas, responsive, website-pages and axe-on-every-screen specs that include the new page |
| 11  | `pnpm docs:build`                                               | pass; `llms.txt` written, `git status` empty afterwards (no drift)                                                                                                                                                        |
| 12  | `pnpm audit --prod --audit-level high`                          | exit 0. No high or critical. 6 advisories remain: 4 moderate, 2 low (`fast-uri`, `ip-address`); see minor finding m8. The release's own override (`body-parser` 2.4.0) is consistent in `package.json` and `pnpm-lock.yaml` |
| 13  | Migration 0007 rehearsal (in memory, existing test support)     | See section 3                                                                                                                                                                                                              |

Not run: `pnpm docs:test` (not in the requested cycle; the docs build and navigation list were checked by reading).

## 2. Failures and whether they also occur on `origin/main`

I created a throwaway worktree of `origin/main` (`6d179fe`), ran `pnpm install --frozen-lockfile --offline` and
`pnpm build` in it, ran the failing tests, and removed it afterwards.

| Failing test                                                                                                      | On this branch | On `origin/main` | Cause                                                              |
| ----------------------------------------------------------------------------------------------------------------- | -------------- | ---------------- | ------------------------------------------------------------------ |
| `apps/cli/tests/rotate-command.test.ts` "shows the new administrator secret when the environment file cannot be updated" | fail           | fail             | Suite runs as root, so the read-only file is writable              |
| `apps/local-ops-api/tests/preferences.test.ts` "propagates a write failure when the target directory cannot be created or written to" | fail | fail | Same (root)                                                        |
| `apps/deploy-cli/tests/unit/cli.test.ts` "silences only the expected env-proxy warning under OneCLI ..."           | fail           | fail             | Session sets `NODE_OPTIONS` (`--use-openssl-ca`), the test expects it unset |
| `apps/admin-web/e2e/footer.spec.ts:85` "is fully keyboard reachable with a visible focus ring"                    | fail 5 of 6 repeats (passed once in isolation, failed once in the full run) | fail 4 of 4 repeats | Focus handling in this sandboxed browser; flaky, not related to the new page |

All four are environmental and pre-existing; none touches the feature. `specs/024-rage-clicks/tasks.md` Notes lists
the three unit failures (accurately). It also says the axe-over-all-screens test "now takes about 35 s against its
30 s default timeout"; in my run it took 29.8 s and passed with a 90 s timeout (I set `--timeout 90000`). It does
not mention the `footer.spec.ts` flake; I add it here.

## 3. Migration 0007 rehearsal

Built from `freshDatabase`/`d1` in `apps/ingest-worker/tests/support`, throwaway test file (deleted).

- **Empty database**: migrations 0001 to 0006 then 0007 apply; availability row inserted with minute precision
  (`2026-10-24T01:22:00.000Z`).
- **Populated database**: Worker (0.12 code) on a schema-6 database ingested a click, then a burst (both `202`).
  Click counted (`event_count` 1), burst silently not counted, **no stuck `request_nonce`**. After applying 0007:
  no existing table changed row count; exactly two tables added (`dashboard_minute_rage_clicks`,
  `dashboard_rage_click_availability`). A burst sent afterwards is counted (`burst_count` 1).
- **Re-applying 0007** fails with "table ... already exists" (expected; Wrangler's `d1_migrations` prevents it, same
  pattern as earlier migrations).
- The existing `migrations.test.ts` (additive-only check, 0007 column list, negative count refused) passes inside
  the full run.

## 4. Findings

Severity scale: blocker (must fix before release), major (fix, or release owner accepts in writing), minor, nit.

### Major

**M1. The daily retention and purge job throws on a database that has not had 0007, so no data is expired and visitor salts are not deleted until the migration is applied.**
Evidence: `apps/ingest-worker/src/storage/d1-repositories.ts:1215` adds `dashboard_minute_rage_clicks` to the retention
statements and `:157` to the purge list, with no tolerance for a missing table (`isMissingSchema` is used only on the
ingest path, `:633`). `apps/ingest-worker/src/index.ts:91` awaits `deleteExpiredDashboardData`, and the visitor-salt
deletion (`:94`) and `purgeDeleted` (`:99`) come after it. My test (Worker code on schema-6 database):
`retention on schema 6 error: no such table: dashboard_minute_rage_clicks`, and
`purge count on schema 6 error: no such table: dashboard_minute_rage_clicks`. On schema 7 both run clean, and I
confirmed rows older than 32 days and rows of a deleted website are removed from the new table.
Context: the same pattern exists since 0.11.0 (the same test on a schema-4 database fails on
`dashboard_minute_campaigns`), so this is a pre-existing design weakness that 0.12.0 repeats, not a regression. It only
bites in the "Worker newer than database" state, which the spec (FR-005, Q9), the docs and `stale-database.test.ts`
explicitly treat as a supported intermediate state, and `stale-database.test.ts` does not exercise the cron path.
Impact: while stale, retention (32-day promise) and the daily salt deletion (visitor-id unlinkability) silently
stop; the Cron invocation fails each day. Ends once the migration is applied.
Recommendation: either (a) make the retention and purge statements skip a missing table, as ingest does, and add a
stale-database test for the scheduled handler; or (b) the release owner accepts it, with the deploy order (migrations
before Worker, which the deploy tooling does) stated in the release checklist. Not a blocker for this feature
because it is pre-existing and bounded by the deploy order.

### Minor

**m1. "Clicks" and "Bursts per click" are structurally understated or overstated for exactly the rows this report is about.**
The burst is detected before the 500 ms duplicate filter (`packages/browser-sdk/src/actions.ts:176` then the
filter), so the quick repeats that make a burst are dropped from the ordinary click count. Any 3 clicks inside
1 s have a gap under 500 ms, so every burst records at most 2 ordinary clicks, usually 1. The SDK's own test asserts
it (`actions.test.ts`: "still records the first click as an ordinary action": 3 clicks give 1 ordinary action). In
real Chromium, 3 mouse clicks 80 ms apart sent exactly 1 click and 1 burst (confirmed). Result: a hammered control
shows about 100% "bursts per click", and the docs call `clicks` "all its clicks" (`docs/operations/rage-clicks.md`,
`docs/releases/v0.12.0.md`, `CHANGELOG.md`, contract). Recommendation: reword to "recorded clicks (repeats within
half a second are counted once)" or drop the rate column; no code change needed to release.

**m2. Contract and Worker disagree on an empty filter.** `specs/024-rage-clicks/contracts/rage-clicks-report-api.md:6`
says an empty `page`/`action` is `400 invalid_request`. The Worker's shared `actionsFilters` (`admin-adapter.ts:133`,
`if (!value) continue`) treats it as no filter: `action=` returned `200` with the full totals in my run. The local API
does reject it (`analytics.ts`, "An empty filter is a mistake"), and the contract test does not cover the case. The
behaviour is the same as the actions report, so fix the contract text (or the Worker, for both reports).

**m3. False positives that the docs only half explain.** (jsdom and real Chromium)
(a) Three different controls with the same name on one page (three "Remove" buttons, 150 ms apart) produce one burst,
because the key is page, name, kind and destination, not the element; the docs say "the same button or link".
(b) A triple click (`detail` 1, 2, 3) on a button or link is reported as a burst (real Chromium, `clickCount: 3`).
(c) Steppers and counters, already named under Limits. Double click alone does not trigger (2 clicks), so the Limits
sentence "a double-click on a slow page" (`rage-clicks.md:59`) cannot describe a real trigger. Recommendation: add
(a) and (b) to the Limits list.

**m4. Consent is enforced in the browser only.** The privacy review (rule 7) says consent denied records no bursts.
True for the SDK: `init` with `analytics-denied` sent 0 requests in jsdom and in real Chromium. The Worker, however,
counts a burst whose event says `analytics-denied` (`202`, row stored) exactly as it does a plain click with
`analytics-denied`. Same behaviour as actions, so not new; the review should say "the SDK records no bursts".

**m5. Test gaps for the new route and table (I verified each by hand, so no defect found).** (a) No scope or role test
for `analytics/rage-clicks`; I tested project-wide and website-scoped analyst keys, a key of another project, and an
owner key scoped to a second website, with and without `source_id`: the scoped analyst is forced to its own website,
foreign website or project gives `404`, `POST` gives `404`, no data crosses. (b) `purge-deleted.test.ts` `TABLES` omits
the new table; I confirmed the purge count includes it and a deleted website's rows are counted. (c) No real-browser
test of rage detection; `sdk-real-browser.spec.ts` was not extended. I ran one in Chromium (3 mouse clicks, 8 held
Enter presses, 6 programmatic `.click()`, a triple click and 3 touch taps with touch emulation): bursts for mouse,
triple click and touch only; 0 for keyboard and programmatic. Firefox and WebKit (notably `click.detail` on touch
taps in older iOS Safari) are untested by the whole suite, which is Chromium-only.

**m6. Branch coverage margin is thin.** Repository branches 90.84% (gate 90%). `rage-rollups.ts` is 100% lines and 85.1%
branches; `actions.ts` 90.59% statements. Fine for the gate; the next release that adds branches can break it.

**m7. At-most-once under a transient database error.** If the burst batch fails with a non-schema error after the
first batch (which records the event digests), the request returns an error, the SDK retries, the digest is already
seen and the burst is never counted. Same design as the campaign counts; acceptable for a signal, worth one line in
the docs. Bursts received on a Worker/database mismatch are also acknowledged with `202` and dropped (documented).

**m8. Production dependency advisories.** No high or critical, but `fast-uri` is pinned by an override to `3.1.7`
(`package.json`: `"fast-uri@<3.1.7": "3.1.7"`), which is below the fixes for four newer advisories (3.1.8 and 3.1.9);
`ip-address` has one moderate. Not introduced by this release; raise the override floor at the next dependency pass.

### Nits

- n1. `apps/ingest-api/src/domain/types.ts:212` says `clicks` includes bursts; the console type
  (`apps/admin-web/src/api/local-operations.ts:223`), the contract and the SQL say excluded. The code is right; fix the comment.
- n2. `specs/024-rage-clicks/data-model.md:7` says visitor and session "are used for the replay-safe event digest";
  the digest is built from the project and event id only (`action-rollups.ts`, `eventDigest`). Visitor and session
  are unused for bursts.
- n3. The cooldown can be bypassed by clicking more than 200 other controls in 5 s: `actions.ts:142` prunes entries
  whose recent clicks are empty, which also discards `reportedAt`. My test produced a second burst for control A
  within about 0.5 s. Still bounded by 20 a minute.
- n4. Each burst is a separate request, so it costs one more Worker invocation and one more R2 object (Class A write)
  per burst, up to 20 a minute per page load. `docs/operations/cost-model.md` was not updated.
- n5. The "reports began on" notice uses the browser's local time format (`toLocaleString`); other notices should be checked for consistency.
- n6. The spec has no explicit threat-model section (constitution: "threat model ... documented before implementation").
  The privacy review and the caps cover it in substance.

## 5. What I attacked and the outcome

| Area                                    | What I did                                                                                                                                                                                                                                                       | Outcome                                                                                                                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema and privacy guard (`action.rage`) | Posted 10 hostile events to the real Worker entry point: `rage` as `false`, `1`, `"true"`, `null`, `[true]`; extra keys `x`, `y`, `clicks`, `path` in `action`; `position` and `target` in `data`                                                               | **All `400`, nothing stored.** No way to send a position, path, count or any extra field with a burst                                                                                                                                 |
| Forged names and destinations           | Names with an email, long digit run, 80 and 81 characters, markup, `__proto__`, SQL text, a prompt-injection sentence, a tab, a bidi override; a link destination with query and fragment; a button with a destination                                              | Email and digits redacted (`[email]`, `[number]`); 81 characters rejected (whole batch `400`); the rest stored as text and parameterised, tab folded to a space; destination with query/fragment `400`. A button may carry a destination (same as clicks). Control names are untrusted text, as documented |
| Replay and nonce                        | Same burst id twice in one batch, again in a second request, an altered replay under the same id; a click and a burst sharing one id                                                                                                                           | Counted **once** (`burst_count` 1). A burst that shares an id with an earlier click is ignored (harmless). No stuck nonce after a missing-table run                                                                                  |
| Storage content                         | Read every column of both new tables and the wire format from real Chromium                                                                                                                                                                                      | Only project, website, minute, page, name, kind, destination, count. Wire event: `action` keys `name`, `kind`, `rage`; `data` keys `page`, `action`, `visitor`, `session`. **No click position, element path, text or visitor digest is stored for a burst** |
| Report correctness                      | 70 distinct controls with 1 to 3 bursts, plus a link; filters; totals vs rows vs other                                                                                                                                                                          | 50 rows, `other.rows` 21, `sum(rows.count) + other.count = totals.bursts` (140). Filters are exact; `page`/`action` over limit or with a control character `400`; unknown page gives zero. Link destination joined correctly to clicks |
| Ranges and availability                 | Range over 30 days; start after end; non-minute values; missing; a range starting before the availability row                                                                                                                                                   | `400 invalid_range` with the field named, each time; the early range answers `200` with `availability.state` `incomplete`                                                                                                              |
| Roles and scope                         | Project analyst, website-scoped analyst, analyst of another project, website-scoped owner, with and without `source_id`, and a `POST`                                                                                                                            | No escape; see m5(a)                                                                                                                                                                                                                  |
| Missing table / version skew            | Worker 0.12 on schema 6 and on schema 7; SDK against an old backend (burst answered `400`); SDK with a transient `503` on the burst                                                                                                                              | Ingest keeps page views and clicks, loses only the burst. Report `503 database_update_needed` (existing test). Old backend: request order click then burst, queue empty after, click kept. `503`: burst requeued and sent on retry. Retention/purge: **M1** |
| SDK detection                           | jsdom and real Chromium: keyboard, held Enter, programmatic `.click()`, double, triple, touch, rapid alternation of two controls, boundary spacing (0/500/1000 ms gives none; 0/499/998 gives one), clicks across SPA page keys, 260 controls, consent denied    | Keyboard and programmatic: no burst. Clicks across three SPA page keys: none. Boundary behaves as specified. Alternating two controls 10 times in 1 s gives one burst each (correct by definition). Findings m3, n3                   |
| Console page                            | At 320 px and at 32 px root font size (200%), with an empty report, a `404`, a `503 database_update_needed`, and an incomplete range with an 80-character name and a 300-character page; axe (WCAG 2.0 to 2.2 A and AA tags)                                          | **0 axe violations, no horizontal overflow** in all four states. Messages are clear and actionable ("Update it with vizoalica deploy <name> --update", "needs its latest update"). View-only (no state-changing control). The empty state links to the docs site over `https` |
| MCP `get_rage_clicks`                   | Read the code and its tests: `limit`, `page` (1 to 1024), `action` (1 to 80), range, `404` and `503` mapping                                                                                                                                                      | Inputs bounded; `limit` trimming keeps `other` exact; the description and the `note` field both say control names are untrusted data. The summary line interpolates the top control name, exactly as `get_actions` does                |

## 6. Alignment review (code, spec, contract, docs)

**Aligned (verified against code or tests):** 3 clicks, 1000 ms, 5 s cooldown, 20 a minute, keyboard excluded;
`const true` in the schema and `ActionData`; separate request after page views and ordinary clicks; table and
availability row as in `data-model.md`; `EXPECTED_SCHEMA_VERSION` 7 (a test compares with the directory); retention
32 days and purge include the table; six statements per report (plan); at most 50 rows with an exact remainder; route,
local API route and MCP tool names match the docs, skill, `llms.txt`, README, CHANGELOG and release notes; version
`0.12.0` in `package.json`, the packed CLI and the docs navigation and site test list; privacy page, SDK page, AI page,
operator page and skill data model all describe the feature.

**Misaligned:** m1 ("all clicks"), m2 (empty filter), m3 (double-click sentence), n1, n2, n4 above. `tasks.md` still shows
T012 unchecked, correct until this review is accepted.

## 7. Recommendation for the human release owner

**GO WITH CONDITIONS.**

No blocker. The feature does what the spec says, stores counts only, rejects every attempt to smuggle position,
path or count into a burst, counts replays once, keeps the report bounded and exact, respects roles and website
scope, and degrades safely when the database or the backend is older. Format, lint, typecheck, build, package,
SDK drift, deploy-workflow, docs build and audit (high) pass. Unit tests fail only in the three known sandbox cases and
one e2e keyboard test fails only in this sandbox; all four fail identically on `origin/main`. Coverage gate is met.

Conditions:

1. **Decide on M1** before release: either make retention and purge tolerate a missing table (and test the scheduled
   handler against a stale database), or record acceptance with the "migrations before Worker" deploy order in the release checklist.
2. Re-run `pnpm test`, `pnpm coverage` and `pnpm test:e2e` on a normal (non-root, unproxied) CI runner so the four
   sandbox failures are shown to pass there; I could not show that here.
3. Fix the documentation points m1, m2 and m3 (wording only), or accept them knowingly.
4. Smoke-test one burst by hand in Firefox and Safari (desktop and a touch device) after deploy, since the automated
   suite only covers Chromium (m5c).

Everything else (m4 to m8, nits) can follow in a patch release.

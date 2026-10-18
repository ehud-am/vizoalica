# Independent QA report: Vizoalica v0.11.0 (specs 022 and 023)

**Produced by a separate AI agent, started with clean context, that did not write or change this code and
re-ran every check itself.** It read the specifications, contracts, the diff (`git diff main...release/0.11.0`)
and the repository first, formed its own view, and opened the two implementer self-review reports
(`specs/022-utm-campaign-report/qa-report.md`, `specs/023-exclude-internal-traffic/qa-report.md`) only at step F.
No source, spec or doc was modified and nothing was committed; this file is the only file added to the repository.

- **Date**: 2026-10-17 (local, US Eastern; the UTC date had rolled to 2026-10-18 by the end of the run)
- **Commit reviewed**: `ee23055c9f77c05bb80396c1b33e31425f92241f` on `release/0.11.0` (working tree clean at start and at end)
- **Reviewer's recommendation**: **GO WITH CONDITIONS** (section 8). The human release owner makes the decision.

## 1. Results of the pre-release test cycle (all run by me, serially, on the committed tree)

| #   | Command                                                                   | Result                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm format:check`                                                       | pass ("All matched files use Prettier code style")                                                                                                                                                                  |
| 2   | `pnpm lint`                                                               | pass, no output                                                                                                                                                                                                     |
| 3   | `pnpm typecheck` (incl. `typecheck:examples`)                             | pass                                                                                                                                                                                                                |
| 4   | `pnpm test`                                                               | **197 files, 1,978 tests, all pass**                                                                                                                                                                                |
| 5   | `pnpm coverage`                                                           | pass. Statements 95.92%, **branches 90.98%**, functions 96.12%, **lines 97.06%** (gate: lines and branches above 90%). The branch margin is only 0.98 points                                                         |
| 6   | `pnpm build`                                                              | pass                                                                                                                                                                                                                |
| 7   | `pnpm browser-sdk:build`, then `git status`                               | pass; **no drift** in `apps/ingest-worker/src/generated` or the Pages loader (status empty)                                                                                                                         |
| 8   | `pnpm generate:deploy-workflow:check`                                     | "deploy-vizoalica-pages.yml is up to date"                                                                                                                                                                          |
| 9   | `actionlint .github/workflows/*.yml`                                      | clean (no output, exit 0)                                                                                                                                                                                           |
| 10  | `pnpm package:build && pnpm package:check`                                | pass, "The package is ready to publish"; the packed CLI prints `0.11.0`                                                                                                                                             |
| 11  | `pnpm test:e2e` (Playwright, Chromium only)                               | **90 passed**, 0 failed (includes the new campaigns spec, the built-SDK-in-a-real-browser specs for campaign and `?vizoalica_ignore=1`, axe on every screen in both themes)                                         |
| 12  | `pnpm docs:build`                                                         | pass (sitemap, `llms.txt` written)                                                                                                                                                                                  |
| 13  | docs site tests (`playwright`), see note                                  | **12 passed, 2 skipped** (the two analytics-consent tests, skipped by their own condition), 0 failed. Docs unit tests (`vitest run docs/tests`): 5 files, 40 tests pass                                              |
| 14  | `pnpm audit --prod --audit-level high`                                    | exit 0. One **moderate** advisory (`fast-uri` 3.1.7, fixed in 3.1.8, reached through `ajv`); no high or critical. Not introduced by this release                                                                    |
| 15  | `gitleaks detect --source . --config .gitleaks.toml --log-opts "main..HEAD" --redact` | 6 commits scanned, **no leaks**                                                                                                                                                                         |
| 16  | Clean-checkout rebuild (CI order) in a throwaway `git worktree` at this SHA | `pnpm install --frozen-lockfile --offline`, `browser-sdk:build` (no drift in `generated/`), `package:build && package:check`, `pnpm build`, `typecheck`, `pnpm test` (197 files / 1,978 tests): all pass. Worktree removed |
| 17  | Migration rehearsal 0001-0006 (in memory only, existing test support)     | `migrations.test.ts`, `schema-version.test.ts`, `purge-deleted.test.ts`: 36 tests pass, including empty database, the real 0.5.2 fixture through every later migration to the same schema as a new install, and a populated 0.10.0 database with 0005+0006 keeping every row. Plus my own schema-4 and schema-5 runs (section 4.3) |

Environment notes:

- Port 4321 was held by another project's process (PID 85186, a `chefef` tsx server), which would make `pnpm docs:test` fail
  with 403. I did not touch it. I ran the docs site tests from temporary copies of `docs/playwright.config.ts` and
  `docs/tests/site.spec.ts` rewritten to port 4399 (`PORT=4399 node tests/serve-dist.mjs`) and **deleted the copies afterwards**
  (`git status` empty). The unmodified `pnpm docs:test` was therefore not run.
- Two unrelated long-running processes (a Vizoalica `admin-web` dev server on 5173 from the previous day and a `chefef` server)
  were present; I did not start or stop them. No git-ignored file was deleted; build outputs I produced (`coverage/`,
  `test-results/`, `docs/.vitepress/dist`, `apps/cli/package`) are git-ignored and were left in place.
- All my throwaway tests live in the scratchpad directory (`.../scratchpad/qa`). One of them was written to the repo root by
  mistake for about a minute (untracked `report.qa.test.ts`) and was moved out immediately; it was never staged or committed.

## 2. What I attacked (adversarial test log)

Throwaway scripts under the scratchpad, using the repo's real Worker entry point on the real schema (SQLite in memory), plus
Playwright against the console with its mock backend. Results:

| Area                               | What I did                                                                                                                                                                                                                                                            | Outcome                                                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IP / CIDR parsing                  | Differential fuzz of the matcher against `node:net` `BlockList`: 20,000 random v4/v6 CIDRs, 40,000 probes. Grammar fuzz (600k random strings) against `net.isIP`. 30 hand-picked edge entries                                                                         | Matching: **0 mismatches**. Grammar: only difference class besides IPv6 zone ids (`%`, rejected on purpose) is **defect m1** (`1.2.3.4::` accepted)                                                              |
| Hostile UTM values                 | Fullwidth/Arabic digits, fullwidth `@`, zero-width and bidi controls, 1 MB value, 5 MB query, 50,000 repeated params, markup, double-encoded, NUL, Turkish dotted I, UUID, JWT, SSN-like, phone, IP, a 64-boundary astral letter                                       | Markup, controls and length are handled; cost is sub-30 ms even for 5 MB. **Defects m2 (non-ASCII digit runs survive) and m3 (cut inside a surrogate pair)**                                                   |
| Hostile campaign objects at the Worker | 15 shapes posted straight to `/v1/events:batch`: string, array, null, `{}`, numbers, 10,000-char, 65-char, extra key, empty string, nested, `__proto__`, markup+email+card, astral cut, unicode scripts, symbols-only                                               | Wrong types, empties, extra keys and over-length: whole batch `400` and nothing stored. Passing values are cleaned again and stored cleaned; the R2 batch holds the cleaned value, not the original              |
| Replay / double counting           | Same batch twice; altered replay under the same event id; same id twice in one batch                                                                                                                                                                                  | Campaign rows, visitor rows: counted **once**. (Pre-existing, not new: the legacy `dashboard_rollups` and `dashboard_hourly_page_views` count a replay again; they are not used by the new report)             |
| Exclusion leaks and oracles        | Excluded batch with a full DB snapshot before/after; searched every table except `sources`, the R2 objects, console output and the audit table for the address; invalid entries (`/99`, junk, non-list, number, 26 entries); weird `cf-connecting-ip` values                | Only `dashboard_excluded_hits` and the day's visitor-salt row change. **No leak** in DB, R2, logs, audit, error bodies. Responses carry only entry position and reason. Bad token from an excluded address: 401/403 (existing tests, plus mine) |
| Roles and scopes, new routes       | Keys: project analyst, website-scoped analyst, website-scoped owner, project owner, analyst of another project. 11 GET routes each; writes; cross-project `source_id`, encoded/upper-case project ids, duplicate and empty `source_id`, duplicate `source` filters   | **No escape.** Analysts never get addresses (list, status, snippet, projects); owners get them only for websites in scope; scoped keys cannot read or write other websites; foreign ids give 404 |
| Report bounds and exactness        | 1,000 distinct combinations over two websites, filters including `%`, `_`, `\`, SQL-like text; query plans                                                                                                                                                             | 20 / 50 / `other`; `sum(items)+otherCount` and `sum(rows)+other.count` equal the total for every ranking; filters are exact matches; indexes used (primary key range scan). Body 6.4 KB                       |
| Retention and purge                | Old and new rows in all three new tables; deleted website and deleted project                                                                                                                                                                                         | Retention removes old rows from all three; purge removes both campaign tables and the counter for deleted websites/projects only; the one-row availability marker is kept (correct)                              |
| Worker newer than database         | Worker 0.11 on a schema-4 and a schema-5 database                                                                                                                                                                                                                     | See defect **m5**                                                                                                                                                                                              |
| Backend older than SDK             | Validated a tagged page view against `main`'s page-view schema                                                                                                                                                                                                        | Rejected (`additionalProperties`), as documented; the SDK treats 400 as permanent and drops the batch                                                                                                          |
| Cost / amplification               | Counted D1 statements per 25-event batch: untagged 61, 25 tagged with one label 87, 25 tagged with distinct labels 111. Default quota policy is 100 events/day/website                                                                                                | Untagged cost unchanged (SC-005). A hostile tagged batch adds up to 50 statements, well below the paid-plan limit of 1,000 and the volume is capped by the daily quota: at most 100 new combinations per website per day |
| Accessibility                      | axe (WCAG 2.0/2.1/2.2 A and AA tags) on Campaigns, Campaigns with a filter, the website page and the Edit page, at **320 px**, at 100% and **200% root font size**, light and dark (16 runs); keyboard: filter selection and invalid-entry save                         | **0 violations, no horizontal scroll** (my first run was vacuous because the mock server only matches port 4173; I redid it on 4173 and checked the page headings). Focus moves to `main` after a filter; an invalid entry returns focus to the textarea with `aria-invalid` and `aria-describedby` pointing at the message |
| Privacy                            | Searched every stored table for addresses, raw UTM values, visitor ids                                                                                                                                                                                                | Only cleaned labels and keyed digests; no address in any new table                                                                                                                                             |

## 3. Alignment review (step B)

Verified against code or tests, not only against other documents.

**Aligned (checked):** migration list and `EXPECTED_SCHEMA_VERSION = 6` (test compares with the directory); retention 32 days in
code (`apps/ingest-worker/src/index.ts:88`) and in every doc; the 20/50 bounds; the `get_campaigns` and `get_website_status` tools exist
under those names in the MCP server, AI page and skill; privacy reviews match the stored data; README, privacy page and `llms.txt`
were updated for the one browser write; tasks.md items all `[X]`; navigation, release notes and docs-site test list include the new
pages; `vizoalica --version` prints `0.11.0` from the package; the deploy order (migrations, then Worker) matches the docs.

**Misalignments found:**

| #   | Where                                                                                                   | What the document says                                                                                                                             | What the code does                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | spec 023 FR-008; `docs/operations/internal-traffic.md` "Update the backend"; 023 self-review finding 6 | "When the backend is older than 0.11 ... the console MUST say so after saving"; "the console tells you so when you save it"                         | See **M1**: against an older backend the field is never shown, so there is no save to warn on. The "older backend" test (`website-pages.test.tsx:722`) feeds the console a website that already carries `excludedAddresses`, which a real older backend cannot send                    |
| A2  | `specs/022.../contracts/campaigns-report-api.md` ("the console and MCP translate that into 'update the backend'") | Console translates a 404 into "update the backend"                                                                                                 | Only the MCP does. The console shows "Analytics are unavailable. No stale results are shown." (`AnalyticsProvider.tsx:43`)                                                                                                                                                              |
| A3  | `campaigns.md`, privacy review, skill data model, spec FR-002                                           | Kept characters are "letters, digits, space and `_ - . + : /`"                                                                                      | Also keeps `[` and `]` (so placeholders survive; documented only in data-model.md), combining marks, and digits of every script. Anyone can therefore type a label that looks like a placeholder (`[email]`)                                                                          |
| A4  | privacy review, `campaigns.md`, changelog                                                               | "long digit runs ... replaced"                                                                                                                      | Only ASCII digits are replaced (`LONG_DIGITS` uses `\d`); see **m2**                                                                                                                                                                                                                 |
| A5  | `data-model.md` (022) schema snippet                                                                    | `maxLength: 64`, `minProperties: 1`                                                                                                                 | Real schema also has `minLength: 1` per field (stricter, harmless)                                                                                                                                                                                                                     |
| A6  | `internal-traffic.md`, privacy review, README, changelog                                                | The browser flag is set "only because the owner asked"; "Visitors never get it"                                                                     | Anyone can send anyone a link containing `?vizoalica_ignore=1`; a visitor who opens it is silently and persistently opted out of counting (see **m6**). The wording overstates what the design guarantees                                                                              |
| A7  | spec 023 Q3 and 022 US2 name the tool `website_status`                                                  | n/a                                                                                                                                                | Tool is `get_website_status` (docs/skill/changelog use the right name)                                                                                                                                                                                                                 |
| A8  | `docs/operations/internal-traffic.md`                                                                   | Entered CIDR is stored as typed                                                                                                                     | Host bits are zeroed (`203.0.113.9/24` is stored `203.0.113.0/24`; documented in data-model.md only, and the person is not told)                                                                                                                                                       |
| A9  | `.specify/feature.json`                                                                                  | points only to feature 023                                                                                                                          | cosmetic                                                                                                                                                                                                                                                                              |

## 4. Defects, ranked

No blocker found. No data-loss or privacy-leak defect that I could reproduce in the tested environment.

### 4.1 Major

**M1. Exclusion UI is misleading against a backend older than 0.11, and FR-008's "say so after saving" cannot occur.**

- Evidence: `WebsiteEditPage.tsx:67` passes `initialExcluded` only when the website object has `excludedAddresses`; an older Worker
  never returns the field. Reproduction (my test `ui.qa.test.tsx`, a website object with no exclusion fields, which is what an older
  backend returns): the website page's "Your own visits" card reads "No addresses are excluded, so visits from you and your team are
  counted. ... [Exclude addresses]" and the link opens an Edit page that has **no** exclusion field (`field present: false`). The
  `listIgnored` branch (`WebsiteEditPage.tsx:35`) is unreachable in real use. Console newer than backend is the normal window after
  `npm update -g vizoalica` and before `vizoalica deploy --update`.
- Impact: no data risk; an owner is invited to do something the page then does not offer, contradicting spec FR-008, the operations page,
  and the self-review ("Resolved").
- Fix: when `excludedAddressCount` is absent from the website object, show "This backend is older than 0.11; update it with
  `vizoalica deploy <name> --update` to exclude addresses" in the card instead of the invitation, and either drop the `listIgnored` branch or
  reword FR-008 and the docs. (Rated major because it is an explicit MUST that is not met and a published claim that is not true; it does
  not need to block the tag if the owner accepts a doc fix.)

### 4.2 Minor

**m1. IPv6 parser accepts a dotted IPv4 tail before `::`.** `canonicalAddressEntry('1.2.3.4::')` returns `102:304::`; so do `1.2.3.4::f`,
`91.2.3.4::9` and 367 other strings that `net.isIP` rejects. A typo is silently stored as a different IPv6 prefix. Cause:
`address-match.ts:34-55` allows the dotted tail on the last piece of the first half. Fix: allow it only for the last piece of the
whole address (second half, or the single half when there is no `::`). Add the cases to the 30-form table (SC-002).

**m2. Non-ASCII digit runs survive the label redaction.** `cleanCampaignValue('４１１１１１１１１１１１１１１１')` (fullwidth) and Arabic-Indic or
superscript digit runs are stored as is (length 16, 16, 13); `\p{N}` is allowed by Q10 but `redactLabel` only recognises `\d`
(`labels.ts:6`). A card or phone number written with other digits is not replaced, contrary to the privacy review's claim. Real-world
likelihood is low (the labels are text the site owner writes). Fix: NFKC-normalise (or map `\p{Nd}` to ASCII) before `redactLabel`, add
tests with fullwidth and Arabic-Indic digits.

**m3. The 64-character cut can split a surrogate pair; the cleaner is then not idempotent.** `'a'×63 + '𠀀'` posted straight to the Worker
is stored/returned with a lone high surrogate (`\ud840`, visible in the stored R2 batch); cleaning that again drops it (63 characters).
The spec and review say both steps are idempotent. In my SQLite run the stored label came back with 63 characters, but I could not
test real D1. If a lone surrogate ever came back from the API, the console would throw: `encodeURIComponent` raises `URIError` in
`CampaignTables.tsx` (reproduced by rendering the ranking table with such a label: "URIError: URI malformed"). Fix: cut by code points
(`Array.from(...).slice(0, 64)`), and guard `hrefFor` with a try/catch.

**m4. Console shows no "update the backend" message for Campaigns on an older backend** (A2). Same generic text as the pre-existing
Actions/Events pages, but the new contract promises more. Fix: map the 404 in `useCampaignsReport` to the message the MCP uses.

**m5. A Worker newer than its database fails loudly instead of degrading.** On a schema-4 database a page view carrying a campaign makes
`worker.fetch` throw "no such table: dashboard_minute_campaigns", and a mixed batch loses its rollups too (untagged page view in the same
batch: not counted; raw event still stored in R2). On schema 4 or 5, saving an exclusion list throws "no such column:
excluded_addresses_json" (unhandled, not a clean 4xx), as do the report and `excluded-hits` routes. Ordinary reads, untagged ingestion and
`status` keep working (`status` deliberately swallows the missing table). The deploy command applies migrations before the Worker, so this
needs a half-failed update or a hand-run `wrangler deploy`; the self-review says it is the same exposure as 0.10.0. Fix (optional): return a
clear 503 "database update needed" from the new routes, and have the rollup skip campaign statements when the table is missing.

**m6. Anyone can silence counting in a visitor's browser with a link.** A page opened with `?vizoalica_ignore=1` stores the flag and the
SDK sends nothing from then on in that browser; the docs describe this as something only the owner does. Impact is small (per victim, no
data exposure) and it is inherent in the issue's design. Fix: reword the docs and privacy review; optionally require the switch to be
opened from a confirmation page or limit it to a session.

**m7. Campaign labels are visitor-controllable free text that reaches an AI assistant.** Any visitor can craft `?utm_campaign=ignore previous
instructions and ...` (letters and spaces survive, 64 characters, three fields); `get_campaigns` returns it as data with no marker that it
is untrusted. Existing tools already return similar text (custom event property values), so this extends an existing channel. Fix: say in
the tool's `note` and in the skill that labels are untrusted data, never instructions.

**m8. Empty filter values are ignored, so "(not set)" cannot be filtered.** `medium=` (empty) behaves as no filter instead of 400 or a
not-set match. The UI avoids the case by not linking "(not set)". Contract says filters are 1 to 64 characters. Fix: return 400 for an
empty filter, or document it.

### 4.3 Notes (no action required, or accepted by design)

- **N1** `0.0.0.0/0`, `::/0` and `::ffff:0:0/96` (stored as `0.0.0.0/0`) exclude everything and are accepted; documented, and the dropped
  count shows it. A console warning for very wide ranges would be kind.
- **N2** Excluded batches skip quota and the privacy guard by design; only the per-address rate limiter bounds them; the schema caps a
  batch (a 200-event batch is rejected `400` from every address).
- **N3** With consent denied the SDK still sends the landing page view with its campaign (spec edge case; the privacy review should say it).
- **N4** Branch coverage 90.98% against the 90% gate: any further untested branch will fail CI.
- **N5** The self-review's SC-006 evidence (320 px and 200% zoom) is only an overflow check for Campaigns in the committed e2e suite; axe
  at 320 px / 200% is not in it. I ran that myself (section 2) and it is clean, but the suite does not guard it.
- **N6** The console links hard-code `https://vizoalica.dev/operations/...`; fine, noted for forks.
- **N7** Pre-existing, not this release: legacy `dashboard_rollups` and `dashboard_hourly_page_views` double count a replayed event.

## 5. Requirement-by-requirement verdicts

### Spec 022, UTM campaign report

| Item   | Verdict      | Evidence                                                                                                                                                                                                                                                  |
| ------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | Met          | `packages/browser-sdk/src/index.ts:44-72`, `privacy.ts` `landingCampaign`; first `page()` carries it, later ones do not; real-browser e2e "sends the cleaned campaign on the landing page view only"                                                       |
| FR-002 | Partly met   | One shared function (`packages/privacy/src/campaign.ts:33`) in browser and backend; steps as specified except gaps **m2**, **m3** and the bracket allowance (A3)                                                                                          |
| FR-003 | Met          | `privacy-guard.ts:47-58`; my 15 hostile shapes; wrong types fail schema (400), everything else cleaned or dropped                                                                                                                                         |
| FR-004 | Met          | `campaign-rollups.ts` statements guarded by `dashboard_seen_events` nonce; replay test and my replay runs (1 count)                                                                                                                                       |
| FR-005 | Met          | `admin-adapter.ts:567`; roles/scopes verified across 5 keys; filters exact; invalid filter 400                                                                                                                                                            |
| FR-006 | Met          | 20/50/other exact with 1,000 combinations (my run and `campaigns-report.integration.test.ts:109`)                                                                                                                                                         |
| FR-007 | Met          | Campaigns page, shared range/scope controls, empty/partial/filter states; axe 0 violations at 320 px and 200% in both themes (my run); keyboard and focus management checked                                                                               |
| FR-008 | Met          | `get_campaigns` registered, in AI page and skill; 404 gives the update message with `vizoalica deploy <name> --update`                                                                                                                                    |
| FR-009 | Met          | `0005_campaign_reports.sql` additive, three new tables, availability row; migration tests                                                                                                                                                                 |
| FR-010 | Met          | `d1-repositories.ts:152`, `:1159`; my retention and purge runs                                                                                                                                                                                            |
| FR-011 | Met          | `campaigns.md`, privacy, browser-sdk, ai pages, skill (wording gaps A3/A4)                                                                                                                                                                                |
| SC-001 | Met          | `campaigns-end-to-end.test.ts` through real `worker.fetch`; passes                                                                                                                                                                                        |
| SC-002 | Partly met   | Spec samples all cleaned; extra hostile samples (non-ASCII digits, astral cut) are not (m2, m3)                                                                                                                                                           |
| SC-003 | Met          | `packages/browser-sdk/tests/campaign.test.ts:63` (50 route changes) and the real-browser e2e                                                                                                                                                              |
| SC-004 | Met          | integration test plus my 1,000-combination run                                                                                                                                                                                                            |
| SC-005 | Met          | `campaigns-report.integration.test.ts:215`; my count: untagged batch statements unchanged                                                                                                                                                                 |
| SC-006 | Met (by my run) | Committed suite checks axe only at default viewport for Campaigns; I ran axe at 320 px and 200%, light and dark: clean (N5). Screen-reader listening not done                                                                                          |
| SC-007 | Met          | 97.06% lines, 90.98% branches (thin)                                                                                                                                                                                                                      |
| Stories 1-3 and edge cases | Met | Acceptance scenarios covered by tests; edge cases (repeated params, case, fragment, consent, bounded rows) verified                                                                                                                                  |

### Spec 023, exclude internal traffic

| Item   | Verdict    | Evidence                                                                                                                                                                                                            |
| ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | Met        | `0006` column; max 25; canonical forms; `parseAddressList`                                                                                                                                                           |
| FR-002 | Partly met | Strict validation, whole request refused, canonical storage; **m1** lets one malformed form through                                                                                                                  |
| FR-003 | Met        | `admin-adapter.ts:64` `presentSource`; analyst responses carry only the count on every route I tried; no address in audit, logs or errors                                                                           |
| FR-004 | Met        | `pipeline.ts:116-142`: after source and token/origin checks, before quota, privacy guard, storage and rollups; `202` / `excluded`; counter updated; only counter and salt row change in my snapshot test           |
| FR-005 | Met        | Address compared in memory; not in DB, R2, logs or responses                                                                                                                                                         |
| FR-006 | Met        | `/excluded-hits` and `status` additions; scope rules checked                                                                                                                                                         |
| FR-007 | Met        | `ignore.ts`, `index.ts:44`, dynamic loader; unit and real-browser tests                                                                                                                                              |
| FR-008 | **Partly met** | Edit-page field, card, axe and keyboard fine; the "older backend says so after saving" part is not reachable (**M1**)                                                                                            |
| FR-009 | Met        | Statement only                                                                                                                                                                                                       |
| FR-010 | Met        | Retention and purge cover `dashboard_excluded_hits` (my runs)                                                                                                                                                         |
| FR-011 | Met        | `internal-traffic.md`, privacy, SDK, AI pages, skill (A1, A6, A8 wording issues)                                                                                                                                     |
| SC-001 | Met        | `excluded-addresses-end-to-end.test.ts`; my snapshot test                                                                                                                                                             |
| SC-002 | Met        | 77 tests in `address-match.test.ts` (count confirmed); my fuzz found only m1                                                                                                                                          |
| SC-003 | Met        | boundaries for /0 /8 /24 /32 /48 /64 /128 plus my 20,000-case differential against `node:net`                                                                                                                         |
| SC-004 | Met        | 401/403 before exclusion; confirmed in test and in my runs                                                                                                                                                           |
| SC-005 | Met        | `ignore.test.ts` and real-browser e2e                                                                                                                                                                                 |
| SC-006 | Met        | My matrix of 5 keys across 11 routes; no address for analysts                                                                                                                                                         |
| SC-007 | Met (by my run) | axe 320 px / 200% on the Edit page and the card clean; keyboard edit-and-save flow verified; no screen-reader pass                                                                                             |
| SC-008 | Met        | same coverage numbers                                                                                                                                                                                                 |
| Stories 1-3 | Met   | Story 3 AC4 and Story 2 AC4 verified; US1 AC5 (no header) verified                                                                                                                                                    |

## 6. Comparison with the implementers' self-reviews (step F)

**Claims I confirmed independently:** every command result in the self-review's table (counts match exactly: 197 files, 1,978 tests,
97.06/90.98/95.92, 90 e2e, 12 docs passed and 2 skipped, 1 moderate `fast-uri`, no leaks); "77" address-match tests; Worker wiring
(`index.ts` binds all three new repository methods); replay safety; 1,000-combination bound; best-effort counter write; no oracle; no address
leaks; scoped keys; `EXPECTED_SCHEMA_VERSION` 6; migration rehearsals; the finding that a Worker newer than its database fails for tagged
page views (their 022 #6 "reduced, not eliminated" is accurate, see m5).

**Marked resolved but not resolved:**

- 023 finding 6, "Old backend silently ignoring the list. Resolved: the console detects that and tells the person" (**M1**). The path is
  reachable only in a contrived test.
- 022 "Alignment" row "Console proxy path ... fixed" is fine, but the sibling contract claim that the console translates a 404 into an
  update message was not found and not tested (A2, m4).
- 022 finding 2 and SC-002 ("100% of hostile samples", "token rule reads letter case"): true for ASCII; not true for non-ASCII digits (m2)
  or an astral character on the 64-character boundary (m3). The "idempotent" claim is false at that boundary.
- SC-006/SC-007 "320 px and 200% zoom" with axe: the committed suite checks only overflow at those sizes for Campaigns and the card; the
  claim is true in substance (my run) but the evidence they cite does not show it (N5).

**Found by me and missed by them:** M1 (as above), m1 (IPv6 dotted-tail), m2, m3, m6 (hostile link opts a visitor out; their review
says visitors never get the flag), m7 (labels as prompt-injection text), m8, the doc/code differences A3, A4, A8, N1-N5.

**Claims I could not confirm:** none of their stated results failed; the items they list as "not done" (real D1, `cf-connecting-ip` on a
live deployment, screen-reader pass) I also could not do.

## 7. Checks I could not perform, and why

- **Real Cloudflare D1 and Workers**: not allowed (no live account). All SQL ran on SQLite via `node:sqlite`. Row-value
  `(a,b,c) IN (SELECT ...)`, CTEs, `INSERT ... SELECT ... HAVING ... ON CONFLICT`, and how D1 treats a lone surrogate (m3) are unverified.
  `cf-connecting-ip` behaviour at the edge and the per-address rate limiter binding were not observed.
- **Screen readers** (VoiceOver, NVDA): not available; only automated axe and keyboard checks.
- **Browsers other than Chromium**; mobile devices; real 200% browser zoom (I used root font size 200% as the project's own tests do).
- **Unmodified `pnpm docs:test`** (port 4321 taken by another project; I ran equivalent copies on 4399).
- **Publishing paths**: `publish.yml`, npm provenance, GitHub release creation (nothing was pushed, tagged or published).
- **Windows** (unsupported by the product).
- **Load and cost on real D1**: I counted statements and read query plans, but did not measure rows read on D1.

## 8. Recommendation

**GO WITH CONDITIONS.** I found no blocker: the full pre-release cycle passes on the committed tree and on a clean checkout, hostile
input, role/scope and leak attacks did not break the privacy or isolation claims, retention and purge cover the new tables, and the
migrations are additive and rehearse cleanly. The release owner should decide with these conditions:

1. **Before tagging, either fix M1 or correct the claim.** Smallest change: show an "update the backend" message on the "Your own
   visits" card when `excludedAddressCount` is absent, and reword FR-008 and `internal-traffic.md` accordingly.
2. **Before tagging, do the two verifications both self-reviews already recommend** (I could not): a scratch-environment
   `vizoalica deploy dev --update`, then load a tagged URL and add your own address and check **Your own visits** counts it (this also
   settles m3 and the D1 query support); and a short screen-reader listen to the Campaigns tables and the Edit field.
3. **Can ship as known issues or fix soon after:** m1, m2, m3 (all small, local fixes with tests), m4, m5, m6 (reword docs), m7 (one
   sentence in the tool note and skill), m8.
4. Note the thin branch-coverage margin (N4) for the next change.

The human release owner makes the final go/no-go decision.

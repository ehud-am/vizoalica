# Independent QA re-verification, Vizoalica v0.11.0 (after fixes)

This report was produced by a separate clean-context agent (not the implementer, and not the author of the first independent QA).
It re-ran every check itself on 2026-10-17 against **commit fc93b57** (`fix: address independent QA findings M1 and m1-m8 for 0.11.0`),
branch `release/0.11.0`, working tree clean before and after. No source, spec or doc was changed; this file is the only file added.
Scratch scripts lived outside the repository. Under the constitution (v3.1.0), the human release owner makes the final decision.

## 1. Recommendation

**GO WITH CONDITIONS.** No blocker and no major defect found. The full pre-release cycle passes on fc93b57. The earlier major (M1) and
five of the eight minors are fixed and tested (the new tests fail on the old code, see section 3). Three of the minors (m5, m6, m8) are only
partly fixed, and the fixes introduced six new minor defects (section 4). None endangers privacy or isolation, and none loses data in normal
operation. Conditions for the owner:

1. Accept the new minors as known issues, or fix the cheap ones first (N5, N6 are wording and a two-line change).
2. Do the two checks nobody can do without a live Cloudflare account (section 6): a scratch-environment `vizoalica deploy dev --update`
   with a tagged URL and your own address, and a short screen-reader listen. They were also conditions of the earlier report.
3. Know that the branch-coverage margin is thin: 90.96% against a 90% gate.

## 2. Pre-release cycle, run serially by me

| Check                                              | Command                                                                       | Result                                                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Format                                             | `pnpm format:check`                                                           | pass ("All matched files use Prettier code style")                                                   |
| Lint                                               | `pnpm lint`                                                                   | pass, 0 findings                                                                                     |
| Typecheck                                          | `pnpm typecheck` (includes examples)                                          | pass                                                                                                 |
| Unit, contract, integration, console tests + gate  | `pnpm coverage`                                                               | **198 files, 2,004 tests passed**; lines **97.06%** (6818/7024), branches **90.96%** (6656/7317), statements 95.92%, functions 96.2%; gate 90/90 met |
| Build                                              | `pnpm build`                                                                  | pass                                                                                                 |
| SDK bundle drift                                   | `pnpm browser-sdk:build`, then `git status --short`                           | pass, 0 changed files (no drift in `apps/ingest-worker/src/generated` or `examples`)                 |
| Deploy workflow                                    | `pnpm generate:deploy-workflow:check`                                         | pass ("up to date")                                                                                  |
| Workflow lint                                      | `actionlint .github/workflows/*.yml`                                          | pass, 0 findings                                                                                     |
| Package                                            | `pnpm package:build && pnpm package:check`                                    | pass ("The package is ready to publish.")                                                            |
| Console end to end (real Chromium, incl. axe)      | `pnpm test:e2e`                                                               | **90 passed**, 0 failed                                                                              |
| Docs build                                         | `pnpm docs:build`                                                             | pass (sitemap and llms.txt written)                                                                  |
| Docs site tests                                    | copies of `docs/playwright.config.ts` and `docs/tests/site.spec.ts` on port 4399 | **12 passed, 2 skipped** (the two analytics-consent tests are skipped by design); copies deleted     |
| Dependency audit                                   | `pnpm audit --prod --audit-level high`                                        | exit 0; 1 moderate advisory (same `fast-uri` as before), 0 high or critical                          |
| Secret scan                                        | `gitleaks detect ... --log-opts "main..HEAD" --redact`                        | pass, 7 commits scanned, no leaks                                                                    |

Port 4321 was held by another process (PID 85186, not mine, left alone), so the docs tests ran from temporary copies on 4399. The docs
unit tests (`docs/tests/*.test.ts`) ran as part of `pnpm coverage`. `git status` is clean after everything.

## 3. Verdict per earlier finding

Method for every item: read the diff `ee23055..fc93b57`, wrote my own probes (`node --import tsx` scripts driving the real functions and
the real `worker.fetch` on SQLite built from the real migrations, in the scratchpad), and ran the new tests against the **old** source
(a `git archive` copy with the 12 changed source files reverted): 21 of the new test cases fail on the old code and pass on the new, so
the tests are real.

| Finding | Verdict | Evidence |
| ------- | ------- | -------- |
| **M1** older backend card | **Fixed** | `WebsitePage.tsx:42`: when neither `excludedAddressCount` nor `excludedAddresses` is present, the card says "This backend is older than 0.11 ... `vizoalica deploy <name> --update`" and offers no edit link. A backend 0.11 always sends the count (`presentSource`, `admin-adapter.ts:66`, also `0` and for analysts), so a new backend with an empty list is not mistaken for an old one (the existing "No addresses are excluded" test now supplies `excludedAddressCount: 0`). Spec FR-008, tasks and contract were reworded to match. The save-time `listIgnored` branch in `WebsiteEditPage.tsx:36` remains but is effectively dead code (harmless). Test fails on old code. |
| **m1** IPv6 dotted tail | **Fixed** | `canonicalAddressEntry('1.2.3.4::')`, `'1.2.3.4::f'`, `'91.2.3.4::9'` now return `undefined`; `::1.2.3.4`, `1:2:3:4:5:6:1.2.3.4`, `::ffff:1.2.3.4`, `1::1.2.3.4` still work. My differential fuzz against `node:net` `isIP`: 200,000 random strings built from address fragments, **0 differences**. Table tests added (3 fail on old code). |
| **m2** non-ASCII digits | **Fixed** | Fullwidth, Arabic-Indic, Devanagari, mathematical, superscript and circled digit runs all become `[number]`; fullwidth e-mail becomes `[email]`; `sale ２０２６` becomes `sale 2026`. I checked all 770 `\p{Nd}` code points: the mapping to ASCII agrees with NFKC wherever NFKC gives an ASCII digit (0 mismatches), and the run-of-ten rule maps U+0660 to 0, U+06F0 to 0, U+1E959 to 9. Timing: 100,000 digit characters clean in about 90 ms (no pathological cost). NFKC side effects seen: ligatures and compatibility forms fold (`ﬁ` to `fi`, `ＳＰＲＩＮＧ` to `spring`), which is the intended direction; no new way to smuggle a value past the redaction. Same function in the SDK bundle (no drift). |
| **m3** surrogate cut | **Fixed, with a residual and a side effect** | The cut is by code points; `'a'*63 + '𠀀'` is stored whole, well-formed, and `cleanCampaignValue(once) === once` for the three tested shapes. `hrefFor` no longer throws on a lone surrogate (it drops that one parameter; the Campaigns table renders). Residual: idempotence is still not general (N7). Side effect: labels with astral characters can no longer be used as filters (N2). |
| **m4** Campaigns 404 message | **Fixed** | `useCampaignsReport.ts`: a 404 from the report shows "This backend does not report campaigns yet. Update it with vizoalica deploy <name> --update." Test added, fails on old code. |
| **m5** Worker newer than DB | **Partly fixed** | Worker level works as intended, verified through `worker.fetch` on real schema-4 and schema-5 databases: a tagged plus an untagged page view in one batch returns 202, the untagged view and totals are counted (2), no nonce stays set, a replay adds nothing; the campaigns report returns 503 `database_update_needed` on schema 4 (on schema 5 it correctly returns 200, since 0005 exists); saving or creating with an exclusion list returns 503 on schema 4 and 5, saving a name alone still returns 200; `excluded-hits` returns 503; `status`, the website list and the actions report keep working. Gaps: the split into separate D1 batches loses the atomicity that FR-004 relied on (N1); the clear 503 does not reach console or MCP users (N3); a failed create leaves an orphan quota policy (N4). |
| **m6** hostile `?vizoalica_ignore=1` link | **Partly fixed** | Caveat added to `internal-traffic.md` and `internal-traffic-review.md`. But the same page, two lines below, still says "Visitors never get it", and so do the SDK source comment (`packages/browser-sdk/src/ignore.ts:5`) and `CHANGELOG.md:34` ("Visitors' browsers still get nothing"). The wording now contradicts itself (N5). |
| **m7** labels as prompt-injection text | **Fixed** | Tool description, the response `note` and `skills/vizoalica/SKILL.md` now say labels are untrusted data, never instructions; the privacy review lists it. There is no test that pins the wording (nit). |
| **m8** empty filter | **Partly fixed** | Worker route and local API now return 400 `invalid_request` for `source=`, `medium=`, `campaign=` (verified through `worker.fetch`; the three tests fail on old code); contract and `campaigns.md` updated. The MCP `get_campaigns` tool still treats an empty string as no filter (`apps/cli/src/mcp/server.ts`: `...(source ? { source } : {})`; schema `z.string().max(64)` has no minimum), so `campaigns.md`'s "an empty filter is refused" is not true for the assistant path (N6). |

## 4. New defects found (none blocker, none major)

All were reproduced with my own scripts (kept in the scratchpad, not in the repository).

**N1. Campaign counts are no longer applied atomically with the rest of the rollups (minor).**
`d1-repositories.ts:606-624` now runs batch 1 (seen-event digests, totals, dimensions, visitors, actions, watermarks), then the campaign
statements in a second batch, then the nonce release in a third. If the second batch fails for a reason other than a missing table
(a transient D1 error), batch 1 is already committed with its dedupe rows, the request errors, and a retry of the same events is accepted
but counts nothing for campaigns, so those campaign counts are lost for good. Before the fix the whole thing was one atomic batch and a
retry would have recorded everything.
Reproduction: environment with a D1 wrapper that throws `Error('D1_ERROR: network connection lost')` once on the batch containing
`dashboard_minute_campaigns`; ingest `[tagged evt-a-0001, untagged evt-a-0002]` gives `THROW`; totals are 2, `dashboard_minute_campaigns`
is empty, nonces released; ingest the same two events again gives 202; totals still 2, campaigns still empty. Likelihood is low and
the effect is a small undercount, never an overcount. Replays without a failure are correct (three sends count the tagged view once, nonces
all released). Option: leave as known issue, or try the single atomic batch first and fall back to the split only on a missing-schema error.

**N2. A label made of astral-plane characters cannot be selected as a filter (minor).**
The cleaner now keeps up to 64 code points, but the report filters (`admin-adapter.ts` `campaignsFilters`, `analytics.ts` in the local
API) measure `value.length` in UTF-16 units against 64. A page view with `utm_source` of 40 CJK Extension B letters (`𠀀`) is stored
(length 40 code points, 80 units) and appears in the report, but `?source=<that label>` returns 400 `invalid_request`, so the console link
for it would fail. Reproduced through `worker.fetch`. Rare in practice (astral letters). The schema (`maxLength: 64`, counted in code
points by Ajv) and the cleaner agree with each other; only the two filter checks and the MCP schema count differently.

**N3. The clear "database update needed" 503 does not reach the console or the assistant (minor).**
`workerJson` and `analyticsCampaigns` in the local API map any non-OK reply other than 400/401/403/404 to `remote_unavailable` /
`unavailable`; the console shows "Analytics are unavailable. No stale results are shown." for the Campaigns page, a generic error for a
rejected exclusion save, and the website card shows "unavailable" for excluded hits. Only a direct caller of the Worker sees
`database_update_needed`. So the m5 fix removes the unhandled error but not the confusion for the person who would hit it. Documented
in the contracts as a Worker behaviour only, so this is a gap in value, not a false claim.

**N4. A rejected create leaves an orphan quota policy (minor).**
`POST /sources` with `excludedAddresses` against a database before migration 0006: `createQuotaPolicy` runs, then `createSource` fails
and the handler returns 503. Reproduced: two failed creates left 3 `quota_policies` rows for 1 source. Harmless clutter; only on the
half-updated state.

**N5. Documentation contradicts itself on who can get the browser switch (minor).**
The new caveat says anyone can send a visitor a link that sets it, while `docs/operations/internal-traffic.md:75` ("Visitors never get
it"), `packages/browser-sdk/src/ignore.ts:5` (comment), and `CHANGELOG.md:34` ("Visitors' browsers still get nothing") still say the
opposite. `README.md` (lines 28 and 222) and `operations/privacy.md:16` say the switch is written "on your own device"/"when you ask for it",
which is the same softer claim. Wording fix only.

**N6. Empty filter is still accepted by the MCP tool (minor).** See m8. `get_campaigns({source: ''})` silently returns the unfiltered
report.

**N7. Smaller observations (nits, no action required).**
- Cleaning is still not idempotent for every input. Redaction runs before the disallowed characters are removed and the cut, so
  `'a'*64 + '𠀀'` cleans to 64 letters, and cleaning that again gives `[token]` (the SDK's output and the Worker's re-clean can differ for
  such a label). The claim "idempotent" holds for the tested shapes, not in general; it is not a privacy leak (a missed token-like run
  of letters).
- `redactLabel` cuts at 80 UTF-16 units before the 64-code-point cut, so astral labels end up at 40 characters, not 64, contrary to the
  documented 64.
- `isMissingSchema` matches any "no such table/column" message, so a genuine SQL typo in one of the three guarded routes would be reported
  as `database_update_needed` instead of failing loudly. The tests would catch such a typo before release.
- No test pins the m7 wording or the docs wording; branch coverage is 90.96% (gate 90%), so one more untested branch can fail CI.

## 5. Things I checked and found consistent after the fixes

- Specs, contracts, tasks (022 and 023), `docs/operations/campaigns.md`, `internal-traffic.md`, the privacy reviews, `docs/releases/v0.11.0.md`,
  CHANGELOG, README, `llms.txt` and `skills/vizoalica/SKILL.md` agree with the code on: the older-backend card, the 404 messages, the 400
  for empty filters on the Worker and local API, the 503 on a database without 0005/0006, labels as untrusted data, and the digit and
  code-point handling. Exceptions are listed as N5 and N6.
- The generated SDK bundle is in sync with `packages/privacy` (rebuild leaves no diff), so browser and backend use the same cleaner.
- Replay safety: three identical batches count a tagged page view once; no request nonce remains set after success or after a missing
  campaign table.
- Role, scope, and address-leak behaviour was not touched by the fix commit; `presentSource` still hides the list from analysts.

## 6. What I could not verify

- Real Cloudflare D1 and Workers (no live account, and not allowed): all SQL ran on SQLite through `node:sqlite`. How real D1 treats
  a batch that fails midway, the exact text of its missing-table errors (the `isMissingSchema` regex assumes SQLite wording), row-value
  `IN (SELECT ...)`, and `cf-connecting-ip` behaviour at the edge remain unverified.
- A scratch-environment `vizoalica deploy dev --update` with a real tagged page view.
- Screen readers (VoiceOver, NVDA); browsers other than Chromium; real browser zoom beyond what the project's own e2e checks.
- Publishing paths (`publish.yml`, npm provenance, GitHub release creation): nothing was pushed, tagged or published.
- Unmodified `pnpm docs:test` (port 4321 occupied by a process that is not mine); equivalent copies on port 4399 passed.

## 7. Summary for the release owner

Recommendation: **GO WITH CONDITIONS.** No blocker, no major. All the earlier findings have a real, tested fix, with m5, m6 and m8 only
partly closed; the new items (N1 to N7) are minor and can ship as known issues. Before tagging, consider the two small clean-ups (N5
wording, N6 two-line check) and do the live-account checks in section 6 that no agent here can do.

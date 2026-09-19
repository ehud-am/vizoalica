# QA Report: Console UX, View/Manage Separation, and Geography

**Reviewer stance**: a skeptical QA engineer written by the same AI agent that implemented the
change, so treat it as a checklist for the human owner, not as independent assurance. It was
written while the owner was away. **The release go or no-go decision is the human release
owner's.** At the time of writing nothing had been committed. It was later committed and pushed to the feature branch (not merged, not tagged) and versioned as 0.5.3.

**Date**: 2026-09-19 · **Branch**: `012-console-ux-and-geo-insights` (version 0.5.3; the git tag `v0.5.3` is not created yet)

## 1. Gate results

| Gate | Result |
|---|---|
| `pnpm typecheck` | Pass |
| `pnpm lint` | Pass |
| `pnpm format:check` | Pass |
| `pnpm test` / `pnpm coverage` | 118 files, 690 tests pass. 95.5% lines, 91.4% branches (threshold 90%) |
| `pnpm build` | Pass |
| `pnpm test:e2e` (Playwright, Chromium, mocked API) | 18 pass, including axe on all 10 screens in light and dark |
| `pnpm audit` | No known vulnerabilities |
| Generator determinism | `node scripts/generate-world-geo.mjs` twice gives no diff |

Baseline before this work: 108 files, 591 tests.

## 2. Requirement evidence

| Req | Evidence | Confidence |
|---|---|---|
| FR-001 to FR-005 (areas, separation) | `area-separation.test.tsx` (every Analytics route: zero `[data-capability]`, no create/save/delete-type buttons, no mutating API call); e2e "Analytics screens contain no state-changing controls"; capability matrix in `capabilities.ts` | High for what is controlled by capability tags. Note that a future control added *without* an `ActionButton` would only be caught by the button-name heuristic. |
| FR-006 (danger zone, in-console confirm) | `manage-flows.test.tsx`, `projects.test.tsx`, `confirm-dialog.test.tsx`, e2e keyboard delete; `window.confirm` asserted never called | High |
| FR-007, FR-008 (single scope, persistence) | `scope-shell.test.tsx`, `scope-provider.test.tsx`, e2e reload test | High |
| FR-009 (no project) | `scope-shell.test.tsx` iterates every scope-bound route | High |
| FR-010 (remove decorative panels) | Panels removed; text moved to the help popover; covered by e2e and unit tests only indirectly | Medium |
| FR-011 (headline + comparison) | `dashboard.test.tsx`, `comparison.test.ts` | Medium: see risk R2 |
| FR-012 to FR-015 (views, lists, plain language, bars) | `dashboard.test.tsx`, `data-components.test.tsx`, screenshots | High |
| FR-016 (layout kept, no stale numbers) | `dashboard.test.tsx` ("keeps headings in place", stale in-flight response) | Medium: see R3 |
| FR-017 (first run) | `dashboard.test.tsx` no-page-views notice | Medium: see R4 |
| FR-018 to FR-023 (geography) | `geo-labels.test.ts`, `geography.test.tsx`, e2e Geography (25 countries plus Tor and unknown), screenshots in light, dark, phone | High for display; see R1, R5 |
| FR-024 (Manage organization) | `manage-flows.test.tsx`, e2e | High |
| FR-025, FR-026 (privacy review) | `docs/privacy/audience-attributes-review.md`, `docs-links.test.ts` | High that it exists; the decisions themselves need the owner |
| FR-027 (docs) | README, `llms.txt`, operator guide, privacy guide, CHANGELOG updated; docs contract tests pass | Medium: no independent read-through |
| FR-028 (WCAG 2.2 AA) | axe (critical and serious) clean on every screen in both themes; keyboard tests; 320px and 200% zoom checks | Medium: automated only, see R6 |
| FR-029 | `ux-review.md` section 7 | High |
| SC-009 (no outside requests) | e2e "never contacts anything outside the local console" | High for the tested routes |

## 3. Risks and gaps (be skeptical of these first)

- **R1. The Worker change was never exercised against real D1 or real data.** The limits
  (300 and 100) were tested only with the fake DB in `dashboard-analytics.integration.test.ts`.
  Nothing has been deployed. Until the owner redeploys the Worker, the console will show at most
  ten countries plus "Not itemized"/"Other". That degradation is tested, but the full-list
  experience has only been seen with mock data. **Action: redeploy to a rehearsal environment
  (use the worktree recipe from your notes) and look at Geography with real traffic.**
- **R2. Misleading comparison when the earlier period is past retention.** The previous-period
  request is just another overview call. If data for that earlier range was already deleted by
  retention, the response may still be "complete" with zeros, and the console would say "Up from
  none". It is only flagged as "no earlier data" when the Worker reports the range as incomplete
  (before expanded analytics). This is most likely on a 30-day range. **Action: decide whether to
  hide the comparison when the earlier range is older than the retention window (needs the
  retention value from the Worker), or accept.**
- **R3. One request fails the whole page.** FR-016 says a failure should be isolated to a
  section. Overview is a single request, so a failure affects every section (with a retry);
  only the comparison fails independently. This matches the request shape but is weaker than the
  wording of the requirement.
- **R4. "No page views yet" is a range heuristic.** It shows whenever the selected range has zero
  page views, not only when a website has never received an event. A quiet site on a 6-hour range
  gets the same hint. It is harmless, but it can read as an error.
- **R5. Map and names caveats.** Natural Earth 110m omits very small countries and some
  territories; they appear in the table and continent totals but not on the map (173 of 250 entries
  have a shape). Borders follow Natural Earth's default view, which is a political choice some
  users may dislike. Names are English common names from `countries-list` (for example
  "Türkiye", "Hong Kong"). No small-count suppression is applied to country counts (an explicit
  assumption in the spec).
- **R6. Accessibility is automated only.** No screen reader (VoiceOver, NVDA) pass was done. In
  particular, the map has about 25 focusable shapes, which keyboard users must tab through to
  pass the map; the table is the intended equivalent, but this deserves a human check. axe's
  moderate and minor findings were not asserted.
- **R7. One browser.** Playwright ran Chromium only. Firefox and Safari were not run.
- **R8. Every mutating control is not tag-enforced.** Analytics and Manage are separated by
  convention plus tests. There is no lint rule stopping someone from adding a raw `<button>` that
  calls a mutating API. The e2e and unit checks catch the cases we know about.
- **R9. Hash routes and stored scope.** Deep links use `#/…`. Scope and range come from
  `localStorage`, not the URL, so a shared link does not carry scope.
- **R10. Bundle size.** The console bundle is about 770 kB minified (240 kB gzip), of which the
  map and country data are about 145 kB before gzip. The existing build already warned about
  chunk size (Recharts); no code splitting was added.
- **R11. Legacy code left behind.** `AnalyticsSummary.tsx` and the `getAnalytics` API call are no
  longer used by any screen but still have tests. They were left alone to keep the change
  reviewable; the owner may want them removed.

## 4. Things that happened during the work that the owner should know

1. **The uncommitted README edit disappeared mid-session.** It was present when the branch was
   created and gone before planning. I did not run anything that touches it, and the reflog
   shows no discard, so the cause is unknown (possibly an editor or another process). I
   re-applied it from the diff captured earlier in the session; the diff stat matched (24
   insertions, 1 deletion). Please check the README's "At a glance" section is what you intended.
2. **A docs contract test was changed.** `deployment-docs.contract.test.ts` required the literal
   line "At a glance:"; your README edit turned it into a `## At a glance` heading, so the test
   now asserts the heading.
3. **The FR-025 question was decided by default.** You did not answer before leaving, so I chose
   option A (country and continent only; language and region recorded as deferred/rejected in
   the privacy review). Change it if you want language or region.
4. **A license problem was found and avoided.** The first country dataset (`world-countries`)
   is ODbL (share-alike). It was replaced with MIT sources before anything was documented.
5. **Committed and pushed on request, not merged or tagged.** The branch is
   `012-console-ux-and-geo-insights`, created from `docs/readme-quick-start` (so it contains that
   commit). The customer workflow reference in the installation guidance now says `@v0.5.3`, which
   only resolves once the `v0.5.3` tag exists, so create the tag when you cut the release.
6. **No real Cloudflare account was touched.** All tests use mocks; the Playwright run uses a
   local dev server with a mocked API. One dev server started for screenshots was stopped.

## 5. What the owner should test before release

1. Redeploy the Worker to a rehearsal environment, then open Geography and the Pages and Sources
   views with real data and check the complete lists.
2. Try a 30-day range on real data and look at the comparison line (R2).
3. Walk both areas with the keyboard and a screen reader; try the map (R6).
4. Look at every screen in light, dark, and on a phone or narrow window.
5. Delete and disable flows on a throwaway project.
6. Read the new README section, operator guide section, and the privacy review.
7. Confirm or change the FR-025 decision.
8. Run the constitution's release gates that remain: alignment review and a full test cycle on the
   release candidate, and decide go or no-go.

# QA report: dashboard visual refresh (contrarian review)

Constitution-required review, performed as a skeptical QA engineer rather than a second pass of
"does the happy path work" - actively looking for what the implementer (an earlier AI session, and
this one) might have gotten wrong, glossed over, or quietly deviated from spec on.

## Cross-artifact alignment audit

Checked `spec.md`, `plan.md`, `data-model.md`, `contracts/dashboard.openapi.yaml`, and `tasks.md`
against the actual code:

- **Aligned.** The `AnalyticsOverview` response shape in `apps/admin-web/src/api/local-operations.ts`
  and `apps/local-ops-api/src/contracts.ts` matches the OpenAPI schema field-for-field (scope,
  range, totals, trend, rankings, distributions, availability) - checked by hand, not just by
  reusing the same TypeScript type across layers (which would mask a documentation drift, not
  catch one).
- **Aligned.** The `InvalidRequest` example in the OpenAPI contract (`{error: invalid_range, field:
  end, message: "..."}`) matches what `AnalyticsRangeError` actually produces, at both the Worker
  and local-proxy boundary - this was in fact *not* true earlier in this feature's history (the
  range validator originally threw a bare `Error('invalid_range')` with no field/message; fixed
  during US2 work, see the T037 commit).
- **Deliberate, documented deviation from tasks.md's literal wording.** T049/T051/T052 describe
  "the utility system" and refactoring pages "to the utility system," which reads as a full
  Tailwind-utility-classNames rewrite of every component. What was actually built: Tailwind is
  wired in and its `@theme`/CSS-custom-property system defines the light/dark tokens, but every
  component keeps its existing semantic class names (`.panel`, `.metric`, `.dashboard-card`, ...)
  rather than being rewritten to atomic utility classes. This was a deliberate scope/risk call
  (a full rewrite of every page's JSX is a large, high-regression-risk diff for the same visible
  outcome) made and stated at the time, not a missed requirement - but it is a real gap between
  what tasks.md says and what shipped, and a release owner or future maintainer reading tasks.md
  literally would reasonably expect atomic utility classes and not find them.
- **Gap, not a misalignment.** `docs/deployment/cloudflare.md`/`docs/deployment/onecli.md` (the
  paths tasks.md's T063 names) do not exist in this repository; the actual deployment docs live at
  `docs/operations/cloudflare.md` (no separate `onecli.md` - OneCLI content is folded into
  `docs/operations/local-analytics.md`). T063's content was applied to the real doc locations
  instead. tasks.md predates this repository's actual doc layout at this file path; worth fixing
  tasks.md's paths in a future edit so it doesn't mislead the next person who reads it literally.

## Resolved findings from this session's own testing (not just re-reported - fixed)

These were caught by actually running gates and live-testing the app, not by static review alone:

1. **Broken local-ops-api build/typecheck** (found at the very start of this session, before any
   new work): a relative-import depth bug and a missing `tsconfig` project reference meant
   `tsc -b` failed outright. Fixed; full monorepo `tsc -b` has stayed clean since.
2. **A silently-swapped error message**: `AnalyticsPage` shared one error state between the
   websites-list fetch and the overview fetch, so an overview failure could overwrite a genuine
   "websites could not be loaded" message with "analytics unavailable." Fixed with separate error
   states.
3. **An unnamed navigation landmark**: `aria-label="Primary navigation"` was on the `<aside>`
   (role `complementary`) instead of the `<nav>` it was meant to describe - caught by
   `ui-accessibility.test.tsx`, not by eye.
4. **320px horizontal overflow**: the topbar (wordmark + theme toggle + status pill) didn't fit at
   320 CSS pixels and had no fallback - caught by live-measuring `scrollWidth` vs. `clientWidth` in
   the browser, not by looking at a screenshot. Fixed; re-measured at 0px overflow after the fix.
5. **A right-at-threshold contrast ratio**: the primary button's dark-mode text-on-brand-green
   ratio was exactly 4.50:1 against a 4.5:1 requirement - passing, but with no margin for
   rounding/rendering differences. Fixed (5.07:1) by darkening the button's inverse text token.
6. **A CSP fix that would have been silently inert**: the first attempt at closing a genuine
   "admin-web ships with no CSP" gap added a Cloudflare Pages `_headers` file - but this console is
   never deployed to Pages (it's always run via `vite dev`, per the operations docs), so that file
   would never have been read by anything. Caught by re-checking the actual deployment docs instead
   of assuming a Pages target; replaced with a `<meta>`-tag CSP, which works regardless of how the
   HTML is served, and verified live (page renders identically, zero CSP-violation console
   messages, Vite HMR still connects).

Findings 4-6 are also covered in `accessibility-report.md`; finding 6 is covered in
`security-privacy-review.md`. They're listed together here because a skeptical review should show
its work, not just its conclusions - and because "the reviewer caught their own mistake and fixed
it correctly the second time" (finding 6) is itself evidence worth the release owner seeing
directly, not just the corrected end state.

## New finding from this review, not yet fixed (low severity, documented rather than rushed)

**Theme-save request ordering.** `theme.ts`'s `setTheme()` fires a `PUT /api/preferences/theme`
request per call but does not cancel or sequence prior in-flight requests. If an operator clicks
Light then Dark in rapid succession *and* the two HTTP responses arrive out of order (a real but
low-probability condition on a loopback connection), the persisted preference on disk could end up
reflecting the earlier click rather than the later one, even though the UI correctly shows the
later choice for the rest of the session. This does not corrupt anything (the preferences file's
own schema/permission/atomicity guarantees are unaffected) and self-corrects on the next explicit
theme change - but it is a real, unaddressed race. Not fixed in this session: the two ways to close
it (client-side request cancellation/sequencing via an `AbortController` + generation guard on the
PUT itself, matching the pattern already used for the analytics overview fetch; or a monotonic
version/timestamp check on the server write) both add real complexity for a single-operator local
tool with a low-frequency interaction, and rushing an untested fix under this review's own time
constraints seemed worse than naming it clearly for a deliberate follow-up decision.

## What this review did not attempt to verify

- A true screen-reader pass (no VoiceOver/NVDA/JAWS available in this environment) - see
  `accessibility-report.md`.
- A live Cloudflare D1 deployment's actual query latency (all performance evidence is from a local
  SQLite fixture) - see `performance-report.md`'s stated limits.
- `deploy:apply`/`deploy:verify` against real infrastructure - deliberately not run; see
  `validation-report.md`.
- Multi-operator or multi-device concurrent use of the local console (its entire design assumes one
  operator, one loopback session at a time - not a gap, a stated design boundary, but worth stating
  explicitly rather than leaving implicit).

## Recommendation

No finding above rises to a release blocker: every fixed issue is fixed and re-verified: every
open item (the T049/T051/T052 documentation-vs-code gap, the theme-save race, the untested
screen-reader/live-D1 paths) is real but low-severity, and each is named specifically enough for a
release owner to make an informed call rather than a blind one. This is a recommendation, not a
release decision - see `release-readiness.md` for the assembled go/no-go evidence, which a human
release owner must decide.

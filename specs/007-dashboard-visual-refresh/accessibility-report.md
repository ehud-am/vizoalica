# Accessibility report: dashboard visual refresh

This is a manual/live-browser review, done this session against the running `admin-web` dev
server, in addition to (not instead of) the automated accessibility tests already in the suite
(`ui-accessibility.test.tsx`, `dashboard.accessibility.test.tsx`, `websites.accessibility.test.tsx`,
`brand-assets.test.ts`, `theme.test.tsx`). Two real, previously-unfound issues were caught during
this pass and are fixed in this same commit; both are called out below rather than folded in
silently.

## Keyboard navigation

**Partially verified live; primarily verified by automated test + static review.** Real keyboard
`Tab`/`Enter`/`Escape` presses were sent to the live app via the browser tool, but this
environment's embedded browser pane has a focus-anchoring quirk: the "sequential focus navigation
starting point" kept resetting to wherever a prior mouse click had landed, rather than the top of
the document, making a clean top-to-bottom live Tab-order walkthrough unreliable to reproduce here.
What was actually confirmed:

- The elements reached via keyboard (`Try again`, theme toggle buttons) show a visible
  `:focus-visible` outline (`outline: 3px solid var(--color-focus-ring)`, confirmed via
  `getComputedStyle` against the live page in both light and dark theme).
- `time-range-selector.test.tsx` (jsdom + real `userEvent` keyboard simulation, not a mock) proves
  the full Escape/outside-click dismiss-and-return-focus behavior, Apply-only requests, and inline
  validation - this is the component with the most complex keyboard interaction in the feature,
  and it is the one most thoroughly covered.
- Static review: every interactive element in `apps/admin-web/src` is a real `<button>`, `<a>`, or
  form control; `grep` for `onClick` confirms every handler attaches to a semantic element, never a
  bare `<div>`/`<span>` acting as a fake button. There is nothing in this feature's UI that a
  keyboard user can see but not reach.

**Recommendation**: a human keyboard-only pass through the deployed console (not this sandboxed
dev server) is still worth doing before release, specifically to confirm real top-to-bottom Tab
order through the topbar -> sidebar -> dashboard filters -> chart cards, which this report could
not cleanly reproduce live.

## Screen reader

**Not verified with an actual screen reader** (VoiceOver/NVDA/JAWS) - none is available in this
environment. What was verified instead, as the closest available proxy:

- Every landmark, live region, and naming pattern a screen reader relies on was checked
  structurally: `banner` (implicit from top-level `<header>`), `navigation` with an accessible name
  (fixed this session - see Findings below), a focusable `main` landmark, `role="alert"` for
  denied/offline access states vs. `aria-live="polite"` for the loading state and the theme
  save-status region, `aria-current="page"` on the active nav item, `aria-pressed` on the theme
  toggle and time-range preset controls, and `role="img"`/`aria-labelledby` with unique `<title>`
  ids on every meaningful brand SVG (`brand-assets.test.ts`).
- Chart accessibility follows the pattern a screen reader needs even without one to test with: the
  visual chart is `aria-hidden="true"`, and the real information (exact values, rankings,
  percentages) is always present as regular readable text/table content right next to it - never
  chart-only.

**Recommendation**: an actual screen-reader pass (VoiceOver on macOS is the lowest-friction option)
is still recommended before release, particularly for the time-range popover's dialog semantics and
the dashboard's live-region announcements during a scope/range change.

## Both-theme contrast

**Verified live, with one real finding, fixed.** Computed WCAG contrast ratios (relative luminance
formula, not eyeballed) against the running app for several text/background pairs in both themes:

| Element                  | Light ratio | Dark ratio | WCAG AA needed |
| --------------------------| ----------- | ---------- | -------------- |
| `h1`                      | 15.30:1     | 16.20:1    | 4.5:1          |
| Active nav item            | 8.04:1      | 7.35:1     | 4.5:1          |
| Privacy note                | 8.41:1      | 8.07:1     | 4.5:1          |
| Primary button (16px bold)  | 7.85:1      | **4.50:1** | 4.5:1          |
| Access-state body text       | -           | 8.72:1     | 4.5:1          |

**Finding, fixed**: the primary button's dark-mode text-on-brand-green ratio was exactly 4.50:1 -
technically passing but with zero margin, and 16px/weight-720 text does not meet WCAG's "large
text" exemption (needs >=18.66px bold), so the strict 4.5:1 threshold applies. Changed
`--color-text-inverse` in dark mode from `#0e140f` to pure `#000000`, raising the ratio to 5.07:1.
Re-verified live after the change; re-ran the full admin-web test suite (101 tests) to confirm the
change didn't regress anything else that reads `--color-text-inverse`.

## 200% zoom / 320 CSS-pixel reflow

**Verified live, with one real finding, fixed.** Resized the live browser pane to 320 CSS pixels
and measured `document.documentElement.scrollWidth` vs. `clientWidth` directly (a real overflow
measurement, not a visual guess).

**Finding, fixed**: at 320px the topbar overflowed horizontally (`scrollWidth: 353` vs.
`clientWidth: 320`) - the brand wordmark, theme toggle, and "Local workspace" pill together did not
fit, and nothing was set up to shrink or wrap. Fixed in `apps/admin-web/src/styles.css`'s existing
`@media (max-width: 800px)` block: the topbar's side padding shrinks, the "Vizoalica" wordmark text
hides (the link keeps its `aria-label="Vizoalica home"`, so nothing is lost for assistive tech),
and the "Local workspace" pill collapses to just its status dot (`apps/admin-web/src/App.tsx` now
gives that text its own `.local-pill-label` span, hidden at narrow width, with the accessible name
moved onto the pill's own `aria-label` so it's still announced). Re-measured after the fix:
`scrollWidth: 320` = `clientWidth: 320`, no overflow. A first attempt at this fix did not work
because `.local-pill span { width: 7px; height: 7px; ... }` (an existing rule sizing the status
dot) has higher CSS specificity than a single-class `display: none` rule and was overriding it for
*both* spans in the pill, not just the dot - fixed by scoping the hide rule to
`.local-pill .local-pill-label`.

200% zoom itself (as opposed to a narrow viewport, which is the closest proxy this tool offers) was
not separately emulated - it was approximated by the 320px width test above, which exercises the
same reflow path a real 200% zoom at a typical 1280px+ display width would trigger. `.page`'s
`max-width: 1120px; margin: 0 auto` and lack of any `overflow-x: hidden` (both confirmed present in
`ui-accessibility.test.tsx`) mean content reflows rather than clips as the effective viewport
shrinks.

## Reduced motion

**Verified by code review, not live** (this browser tool has no reduced-motion emulation control).
The only CSS animation in the entire app is the loading spinner
(`@keyframes spin` on `.spinner`), and `@media (prefers-reduced-motion: reduce) { .spinner {
animation: none; } }` disables exactly that animation. There is no other motion (no chart entrance
animations - `TrafficTrend.tsx` sets `isAnimationActive={false}` on its Recharts `Pie`/`Line`, no
transition-heavy UI) to account for.

## Selector focus-return

**Pass, automated.** `time-range-selector.test.tsx`'s "dismisses on Escape without applying and
returns focus to the trigger" and "returns focus to the trigger after Cancel" cases both assert
`document.activeElement === trigger` after dismissal, via real `userEvent` keyboard/click
interaction against real rendered DOM (jsdom), not a mock.

## Logo minimum-size review

**Verified live.** Rendered `favicon.svg` at 16px, `vizoalica-mark.svg` at 24px and 32px, and
`vizoalica-lockup-light.svg` at 120px wide in the live browser and visually confirmed each stays
legible as a magnifying glass with a visible accent dot (icon variants) or a readable "Vizoalica"
wordmark (the lockup) at its documented minimum size in `docs/brand.md` - none of the minimums
documented there were found to be optimistic.

## Summary

Two real findings from this pass, both fixed in this same commit: a 320px horizontal-overflow bug
in the topbar, and a right-at-threshold dark-mode button contrast ratio. Everything else checked
either passed outright or is backed by automated test coverage rather than a one-time manual
observation. Two items remain genuinely unverifiable in this environment and are called out as
recommendations rather than claimed as done: a true screen-reader pass, and a clean top-to-bottom
live keyboard Tab-order walkthrough on a real deployment.

# Quickstart: Validate the Local Web Console

## Prerequisites

- Node.js 22 and pnpm 9.
- A configured local or remote Cloudflare Worker environment with D1 and R2 bindings.
- A user-only local operations API configuration containing the remote Worker URL and existing administrator credential. Do not place this credential in browser configuration.

## Start the services

1. Install workspace dependencies with `pnpm install`.
2. Apply the feature's D1 migration to the selected development database.
3. Start the Worker development environment with `pnpm worker:dev`.
4. Start the local operations API using its planned `dev` script; confirm it reports a loopback address only.
5. Start or open the local web console served by that API.

## Validate website management

1. Create a project and a website with one exact allowed origin.
2. Confirm the console displays its generated public source key and integration snippet.
3. Confirm the snippet contains no administrator credential, signing secret, or issued JWT.
4. Update the website name and allowed origins; reload and confirm the changed values.
5. Delete the website; confirm it shows deleted/disabled status, cannot accept new events, and historic audit/analytics information remains available as specified.

## Validate analytics

1. Send accepted page-view events for one website, including repeat views from one anonymous visitor and views from another visitor across the three time windows.
2. In the console, request `24h`, `7d`, and `30d` summaries.
3. Confirm page views equal accepted page-view events in each half-open rolling UTC window.
4. Confirm unique users deduplicate repeat activity across the entire selected window.
5. Confirm another project's website cannot be selected or queried through a manipulated URL.
6. Stop the Worker or aggregate-data access and confirm the console presents an unavailable state, not stale data as current.

## Required automated checks

Run `pnpm typecheck`, `pnpm test`, and the feature-specific local API, Worker, aggregate privacy, project-isolation, website-lifecycle, and browser UI test suites introduced during implementation.

## Validation record — 2026-09-06

- `pnpm build`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: passed — 41 files, 111 tests.
- `pnpm lint`: passed.
- `pnpm format:check`: passed.
- `pnpm audit --audit-level high`: passed with no known vulnerabilities.
- `pnpm coverage`: passed the unchanged repository-wide thresholds with 96.92% line coverage and
  90.5% branch coverage (94.49% statements and 94.97% functions). Application code remains in
  scope; no threshold was weakened and no coverage exclusion was added.

Representative accessibility review:

- Keyboard focus is visibly styled for links, buttons, selects, inputs, textareas, disclosure
  controls, and the scrollable snippet; the main region accepts skip-link focus.
- Project, website, and time-window controls have programmatic names and native keyboard behavior.
- Results, processing, error, maintenance, and copy outcomes use live status or alert semantics and
  do not rely on color alone.
- The two-column console reflows to one column below 800 px without horizontal page scrolling.
- Reduced-motion preferences disable the loading animation.
- Automated rendering checks cover semantic names, pressed state, live regions, confirmation copy,
  snippet focus, responsive rules, and the high-contrast color tokens. A release owner should
  repeat screen-reader checks in their target macOS/browser combination before an official release.
- A manual narrow-viewport browser review confirmed readable responsive reflow, intact navigation,
  understandable unavailable-state copy, and a visible primary recovery action.

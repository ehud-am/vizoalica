# Quickstart: Validate the Modern Developer Console Design

This guide validates the completed feature against [the UI contract](contracts/console-visual-system.md) and [design model](data-model.md). Run it after implementation tasks are complete.

## Prerequisites

- Node.js 22 or the repository-supported equivalent
- pnpm 9.15.4
- Project dependencies installed
- Chromium installed for the planned Playwright suite
- A local console configuration when performing manual live-data checks

Install repository dependencies and the browser used by the responsive suite:

```sh
pnpm install
pnpm --filter @vizoalica/admin-web exec playwright install chromium
```

## 1. Run fast repository verification

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm build
```

Expected result:

- Every command exits successfully.
- Repository line and branch coverage remain above 90%.
- Brand tests confirm five valid path-only production SVG variants and reject the superseded magnifying-glass contract.
- Existing analytics, website, theme, authorization, preference, and footer behavior remains unchanged.

## 2. Run real-browser responsive and accessibility checks

```sh
pnpm --filter @vizoalica/admin-web test:e2e
```

Expected result:

- The browser suite starts the local web application with deterministic same-origin API fixtures.
- Automated layout checks pass at representative widths 320, 768, 1024, and 1440; boundary widths remain part of the manual matrix below.
- The document has no horizontal overflow; wide tables and code scroll only inside named local regions.
- Primary targets measure at least 44 by 44 pixels, except documented inline-link cases.
- The time-range selector remains inside the usable viewport and its actions remain reachable.
- Project, website, time range, form draft, disclosure, popover, and focus context survive responsive resize tests.
- The full light/dark lockup and compact mark appear in their contracted layouts.
- Automated accessibility scans report no critical or serious findings.

## 3. Inspect production brand assets

Review:

- `apps/admin-web/public/brand/favicon.svg`
- `apps/admin-web/public/brand/vizoalica-mark.svg`
- `apps/admin-web/public/brand/vizoalica-lockup-light.svg`
- `apps/admin-web/public/brand/vizoalica-lockup-dark.svg`
- `apps/admin-web/public/brand/vizoalica-monochrome.svg`
- `docs/brand.md`

Expected result:

- All artwork uses the approved geometric V with a rising analytics line.
- The favicon remains identifiable in real 16- and 32-pixel browser-tab captures.
- Both lockups are crisp and readable at their documented minimum width.
- Light mode uses a dark wordmark; dark mode uses an off-white wordmark.
- Geometry and clear space are consistent across variants.
- No production SVG contains live text, a raster embed, a filter, a script, or an external reference.
- The concept board and master source are not served from the public asset directory.

## 4. Run the console for manual visual review

For OneCLI-managed access, complete the guided one-time setup and run both processes in one terminal:

```sh
pnpm ops setup
pnpm ops doctor
pnpm ops run
```

Open the local URL reported by the web process. Review Overview, Websites, authorization/loading states, and the range selector in light and dark modes.

Expected visual direction:

- Graphite/neutral surfaces with restrained cyan, blue, and violet brand accents.
- Modern sans-serif headings and interface copy; monospace for paths, timestamps, identifiers, code, and technical values.
- Tabular metrics and numeric columns.
- Flat panels with fine borders, limited corner radii, and shadows reserved for transient overlays.
- Consistent local SVG icons instead of Unicode symbols or emoji.
- Clear hierarchy from scope and primary metrics through trends, rankings, distributions, and supporting guidance.

## 5. Exercise the responsive matrix manually

For both light and dark modes, inspect at least:

| Width | Expected shell and content |
|-------|----------------------------|
| 320 px | Mark-only header, visible horizontal navigation, single-column workflow, 16 px gutters |
| 640 px | Horizontal navigation, flexible filters/metrics, stacked charts and website sections |
| 959 px | Horizontal navigation remains; dense panels stay readable |
| 960 px | Sidebar, two-column comparisons, and split website layout begin |
| 1280 px | Standard sidebar and capped comparison-oriented content |
| 1440 px | No stretched prose or uncontrolled card growth |

At every size:

1. Select a project, website, and time range.
2. Open the range selector and edit a custom range without applying it.
3. Type into website forms and open relevant disclosures.
4. Resize across adjacent layout bands and rotate a touch device or emulator.
5. Confirm selections, draft input, open state, and focus context remain intact.
6. Confirm no content overlaps, clips, or forces page-level horizontal scrolling.
7. Confirm long paths, domains, identifiers, tables, and code remain fully reachable.

## 6. Complete accessibility review

- Navigate every primary workflow using only the keyboard.
- Confirm focus is always visible and never fully obscured.
- Test at 200% zoom and a 320-pixel effective viewport.
- Enable reduced motion and confirm essential state does not depend on animation.
- Inspect forced-colors/high-contrast presentation where supported.
- Use VoiceOver or NVDA to verify landmarks, navigation state, logo naming, form labels, notices, tables, chart alternatives, and focus return.
- On a real or emulated touch device, confirm primary targets are comfortably selectable and no task depends on hover.
- Open forms and the range selector with an on-screen keyboard visible; confirm focused fields and required actions remain reachable.

Expected result: no critical or serious accessibility findings, no blocked workflow, no duplicate logo announcement, and no information conveyed by color alone.

## 7. Record release evidence

Attach or record:

- light/dark captures at compact, standard, and wide sizes;
- favicon captures at 16 and 32 pixels;
- automated test and accessibility results;
- manual keyboard, screen-reader, zoom, touch, and OSK notes;
- a written contrarian QA review;
- the human release owner's final go/no-go decision.

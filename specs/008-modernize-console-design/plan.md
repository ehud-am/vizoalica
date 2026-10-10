# Implementation Plan: Modern Developer Console Design

**Branch**: `[008-modernize-console-design]` | **Date**: 2026-09-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-modernize-console-design/spec.md`

## Summary

Replace the console's green magnifying-glass identity and editorial visual style with the approved path-only V-and-analytics logo system, a graphite/cyan/blue/violet semantic palette, system sans and monospace typography, flatter data surfaces, coherent local icons, and four responsive layout bands. Preserve all analytics, website-management, authorization, theme-persistence, and version behavior. Extend existing semantic CSS and React components rather than introducing a second production styling or component framework, and add real-browser responsive/accessibility validation for geometry that simulated DOM tests cannot prove.

## Technical Context

**Language/Version**: TypeScript 5.7, JSX/TSX, CSS, SVG

**Primary Dependencies**: React 19, React DOM 19, Recharts 3.10, Tailwind CSS 4 CSS pipeline, Vite 6; planned dev-only Playwright and `@axe-core/playwright`; no new runtime dependency

**Storage**: Existing local theme preference only; no schema or persistence changes. New data is limited to static SVG artwork and design documentation.

**Testing**: Vitest 4.1, Testing Library, jsdom, existing repository accessibility/interaction suites, new Playwright browser geometry checks with axe, and manual keyboard/screen-reader/zoom/touch/OSK review

**Target Platform**: Local web console in current desktop and touch-capable evergreen browsers, from 320 through 1440+ CSS pixels, portrait/landscape, light/dark themes, and 200% zoom

**Project Type**: TypeScript monorepo with a React web application and local supporting API

**Performance Goals**: Theme and responsive presentation changes complete without a page reload; local visual interactions respond within 100 ms excluding data fetches; brand assets reserve dimensions and introduce no visible layout shift; no external font, icon, or image request is added; production JavaScript does not grow from testing dependencies

**Constraints**: WCAG 2.2 Level AA; primary 44-by-44-pixel touch areas; no page-level horizontal scrolling at 320 pixels or 200% zoom except named technical regions; existing self-only content-security policy; no backend/API/privacy behavior changes; semantic light/dark parity; repository line and branch coverage remains above 90%

**Scale/Scope**: One shared shell, two main pages, access states and footer, approximately fourteen existing UI components, five production brand assets, one canonical brand master/reference area, four responsive bands, and one browser-validation suite

**Operations extension**: One dependency-free TypeScript entry point at `scripts/vizoalica-ops.ts`
coordinates non-secret setup, diagnostics, two-process console startup, and confirmation-gated native
Wrangler Pages uploads. It reuses existing package scripts and does not replace the approval-gated
Worker/D1/R2 deployment workflow.

## Constitution Check

*GATE: Passed before Phase 0 research and re-checked after Phase 1 design.*

| Gate | Design evidence | Result |
|------|-----------------|--------|
| Privacy-minimal analytics | Presentation changes do not add data collection, storage, identifiers, query dimensions, or responses. Existing aggregate-only interfaces remain unchanged. | PASS |
| Security, privacy, and abuse resistance | Static path-only self-hosted assets fit the current CSP; no script, external reference, credential, or new remotely loaded resource is introduced. | PASS |
| Open source and portable interoperability | SVG assets, system fonts, local icons, semantic CSS, and documented UI contracts are auditable, portable, and free from a proprietary hosted design service. | PASS |
| Minimal infrastructure and AI-assisted deployment | No service, database, deployment resource, hosted font, or production runtime dependency is added. Browser tooling is development-only. | PASS |
| Human-readable and AI-ready engineering | Brand, theme, typography, responsive, component, and accessibility contracts precede implementation; the design remains within existing package boundaries. | PASS |
| Accessible product experience | The design explicitly covers WCAG 2.2 AA, 320-pixel reflow, 200% zoom, 44-pixel touch targets, input independence, non-color meaning, focus, reduced motion, screen readers, and responsive state preservation. | PASS |
| Verification and release gates | Existing unit/integration coverage is retained and expanded with real-browser geometry, axe, manual assistive-technology review, visual captures, and final alignment/QA gates. | PASS |

### Post-design re-check

The Phase 1 model and UI contract introduce no constitutional exception. No product data or authorization boundary changes. The only planned dependencies are development-only browser-test tools needed to produce credible evidence for responsive geometry and accessibility outcomes; they do not ship with the console. Concept artwork is removed from deployed assets, and production branding remains source-owned, path-only, transparent, and reviewable.

## Technical Design

### Brand source and production assets

Move the concept PNG out of `apps/admin-web/public/brand/` into a non-deployed design-reference location. Replace the provisional dark concept with one canonical, clean master under `design/brand/`. Rebuild the five stable production filenames in `apps/admin-web/public/brand/` from identical V-and-rising-line geometry. Convert the wordmark to paths so external SVG rendering never depends on a locally installed font. Keep files transparent, self-contained, filter-free, and script-free.

The favicon receives an optical small-size pass: dark rounded substrate, simplified/thickened strokes, no wordmark, and real 16- and 32-pixel raster review. The standalone mark keeps the full geometry for 24 pixels and above. Light and dark lockups differ only in contrast treatment; the monochrome export uses one fixed ink appropriate to its documented surface rather than relying on `currentColor` through an external `<img>`.

Rewrite `docs/brand.md` around the V-and-analytics identity, palette, geometry, clear space, minimum sizes, approved surfaces, asset selection, and consumer-owned accessible naming. Asset tests parse every SVG and reject live text, raster embeds, external references, filters, scripts, and inconsistent mark geometry.

### Brand integration and theme resolution

Add a `BrandLogo` component that accepts the resolved `light` or `dark` theme. It renders one decorative image inside the single named brand link: the theme-specific full lockup for layouts that can accommodate it and the universal standalone mark for compact layouts. CSS controls full-versus-compact presentation without producing duplicate accessible content. Intrinsic dimensions and aspect ratio reserve header space.

Make the brand link behavior and name agree by treating it as the Overview/home action. Use the resolved application theme, not an operating-system media query, to select the header lockup. The existing asynchronous preference load may change the initial system-resolved theme once; the logo and the rest of the document update from the same source so no mixed theme persists.

Keep one universal `/brand/favicon.svg` declaration with `sizes="any"`. It remains independent of explicit theme because its dark tile is designed for both browser-controlled light and dark surfaces. No favicon mutation logic is required.

### Typography and iconography

Replace the unfulfilled `Inter` declaration and all Georgia use with two explicit system stacks: a UI sans stack for copy, headings, controls, and metrics, and a UI monospace stack for code, paths, timestamps, identifiers, keyboard hints, and comparison-oriented table values. Define display, page-title, section-title, body, control, metadata, metric, table-value, and code roles. Apply tabular numerals to metrics and numeric columns.

Add a small source-owned `Icons` module of inline SVG components with a consistent 16/20-pixel grid and stroke weight. Replace current decorative Unicode/emoji with the local analytics, websites, lock, refresh, light, dark, add, copy, chevron, and state icons. Visible labels remain authoritative; supporting icons use `aria-hidden`.

### Semantic visual system

Refactor `styles.css` into clear layers while retaining current semantic class names:

1. Palette primitives: graphite, neutral, cyan, blue, violet, and semantic green/amber/red.
2. Light and dark role mappings: page, navigation, raised, muted, interactive, code, overlay, text, border, focus, selection, disabled, semantic state, and chart roles.
3. Foundations: typography, focus, inputs, links, motion, forced colors, and technical overflow.
4. Shell and shared patterns: header, brand, navigation, page heading, actions, panels, notices, statuses, overlays, tables, and code.
5. Page-specific analytics and website layouts.
6. Responsive bands and accessibility preference overrides.

Use the 4/8/12/16/24/32/48/64 spacing scale, 6/8/12 corner roles, and full pills only for status/capsule semantics. Make ordinary panels flat with one-pixel borders. Reserve a single subtle shadow for popovers and other transient elevated surfaces. Separate brand accents from success, warning, danger, and information. Remove component-level hard-coded color literals, especially from charts.

### Responsive shell and layouts

Use CSS media queries and one invariant semantic DOM; do not branch component rendering on viewport width.

- 320–639: compact mark, visible horizontal two-item navigation, one-column page hierarchy, 16-pixel gutters, stacked filters/panels/actions as needed.
- 640–959: horizontal navigation, full logo only when uncrowded, flexible two-up filters/metrics, one-column charts/tables and website sections.
- 960–1279: compact sidebar, two-column analytics comparisons, full-span traffic trend, split website list/detail.
- 1280 and above: 240-pixel sidebar, capped 1120–1200-pixel content region, useful comparison density without stretched prose.

Keep header and compact navigation in ordinary flow to avoid focus obstruction. Apply shrink/wrap rules to all grid children. Reflow list/detail and charts without changing keys or remounting alternate copies. Resizing must preserve route, project, website, range, form, disclosure, popover, and focus context.

Use dynamic viewport units with a fallback, safe-area-aware page/overlay padding, and scroll margins/padding for focused controls near on-screen keyboards. Avoid `visualViewport` scripting unless manual mobile testing proves a CSS-only gap.

### Tables, charts, and overlays

Wrap potentially wide tables in named, keyboard-focusable contained-scroll regions while preserving real captions and headers. Keep full technical values available through wrapping, focus/activation disclosure, or adjacent accessible content. Code blocks retain local scrolling and focusability. Do not convert tables into duplicate mobile card trees.

Keep Recharts `ResponsiveContainer` and the current authoritative text equivalents. Replace literal series colors with theme-aware CSS roles. Use blue/cyan for the primary trend and violet plus a dash pattern for comparison. Theme grid, axis, tooltip, cursor, and legend. Reduce visual tick density at compact widths while keeping the exact-value table available. Stack distribution visualization and legend as space narrows. Disable line and pie animation or honor reduced motion.

Retain one mounted non-modal time-range selector. Give it dynamic-viewport maximum height, safe-area insets, contained scrolling, and a reachable action row. Preserve Escape, outside-dismiss, Cancel, Apply, validation, draft-state, and focus-return behavior. Do not add modal semantics or focus trapping unless the interaction is deliberately converted into a true modal.

### Component and application behavior

Update markup only where it creates a stable semantic group, label, icon position, overflow wrapper, responsive class hook, or consistent state. Existing analytics requests, stale-response protection, website operations, theme persistence, footer version, and error recovery remain unchanged. Responsive CSS must never trigger a data request.

All primary controls expose 44-by-44-pixel hit areas even when their visual box appears more compact. Hover states have equivalent focus/pressed/current states. Loading, empty, partial, unavailable, offline, unauthorized, success, warning, and danger patterns include text and consistent local iconography.

### Test architecture

Retain Vitest/Testing Library tests for semantic markup, theme selection, asset contracts, focus return, state behavior, and regressions. Replace old magnifying-glass and green/amber assertions with V/graph geometry and new semantic roles. Add state-invariance coverage proving that presentation changes do not remount or reset active controls.

Add dev-only Playwright and axe integration under `apps/admin-web/e2e/` with a local web-server configuration. Mock same-origin `/api` requests with deterministic fixtures. Exercise 320, 640, 959, 960, 1280, and 1440 widths in both themes, plus touch and reduced-motion contexts. Assert no document overflow, locally named intentional overflow, 44-pixel primary targets, visible/unobscured focus, reachable overlays, state preservation through resize/orientation, correct theme lockup, and no critical/serious axe results.

Real-browser automation complements rather than replaces manual checks for VoiceOver/NVDA, on-screen keyboards, optical favicon quality, 200% zoom, forced colors, contrast, and professional visual judgment.

## Project Structure

### Documentation (this feature)

```text
specs/008-modernize-console-design/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── console-visual-system.md
└── tasks.md                         # Created by $speckit-tasks, not this command
```

### Source Code (repository root)

```text
design/brand/
├── vizoalica-master.svg
└── references/
    └── vizoalica-logo-concept.png

apps/admin-web/
├── public/brand/
│   ├── favicon.svg
│   ├── vizoalica-mark.svg
│   ├── vizoalica-lockup-light.svg
│   ├── vizoalica-lockup-dark.svg
│   └── vizoalica-monochrome.svg
├── src/
│   ├── App.tsx
│   ├── styles.css
│   ├── theme.ts
│   ├── components/
│   │   ├── BrandLogo.tsx
│   │   ├── Icons.tsx
│   │   ├── DashboardFilters.tsx
│   │   ├── DistributionChart.tsx
│   │   ├── IntegrationSnippet.tsx
│   │   ├── MetricCard.tsx
│   │   ├── RankedTable.tsx
│   │   ├── ThemeToggle.tsx
│   │   ├── TimeRangeSelector.tsx
│   │   ├── TrafficTrend.tsx
│   │   ├── WebsiteForm.tsx
│   │   ├── WebsiteList.tsx
│   │   └── OperationalStatus.tsx
│   └── pages/
│       ├── AnalyticsPage.tsx
│       └── WebsitesPage.tsx
├── tests/
│   ├── brand-assets.test.ts
│   ├── brand-logo.test.tsx
│   ├── responsive-state.test.tsx
│   └── [existing UI and accessibility tests]
├── e2e/
│   └── responsive-accessibility.spec.ts
├── index.html
├── package.json
└── playwright.config.ts

docs/brand.md
docs/operations/ops-cli.md
scripts/vizoalica-ops.ts
apps/deploy-cli/tests/unit/ops-cli.test.ts
package.json
pnpm-lock.yaml
```

**Structure Decision**: Keep all production presentation work inside the existing `admin-web` package, with portable production assets in its current public brand directory. Add one repository-level non-deployed design-source directory, dev-only browser tests beside the app, and no new service or workspace package.

## Validation Strategy

- Validate SVG syntax, stable filenames, view boxes, path-only construction, absence of external references/filters/scripts/live text, shared mark geometry, monochrome ink count, and favicon wordmark exclusion.
- Unit-test resolved-theme logo selection, one accessible brand-link name, compact/full markup contract, theme-change stability, local icon semantics, focus return, and resize-invariant task state.
- Verify semantic token completeness and both-theme mappings without relying only on brittle literal-color assertions.
- Browser-test 320, 640, 959, 960, 1280, and 1440 widths in light and dark themes, including no document overflow, named contained overflow, grid transitions, touch target geometry, long strings, chart labels, popover bounds/actions, and resize/orientation state preservation.
- Run automated axe checks on Overview, Websites, loading, empty, partial, offline, unauthorized, error, popover, and long-content states; fail on critical or serious findings.
- Manually inspect the mark at 16 and 32 pixels, both lockups at minimum header size, grayscale charts, 200% zoom, keyboard-only flow, VoiceOver or NVDA output, forced colors, reduced motion, touch use, and an on-screen keyboard.
- Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm coverage`, `pnpm build`, the new browser suite, dependency/security scanning, and existing deployment checks.
- Before release, complete the constitution-required artifact alignment review, full test cycle, written contrarian QA review, and human release-owner go/no-go decision.

## Delivery Sequence

1. Move reference artwork out of public assets; create the path-only master and production favicon, mark, light lockup, dark lockup, and monochrome exports; rewrite brand documentation and asset tests.
2. Establish the new semantic palette, typography roles, spacing/radius/elevation scale, focus/motion/forced-color foundations, and theme-aware chart roles.
3. Add `BrandLogo` and the source-owned icon module; integrate theme-specific lockups, universal favicon metadata, correct brand-link behavior, and compact/full logo presentation.
4. Refine the shared shell, navigation, headings, actions, panels, statuses, notices, forms, code, analytics, and website-management components without altering product behavior.
5. Implement the four responsive bands, stable DOM reflow, contained table/code overflow, safe-area/dynamic-viewport handling, touch targets, and viewport-safe range selector.
6. Theme and responsively refine Recharts output and exact-value alternatives; add compact tick/legend behavior and reduced-motion handling.
7. Update semantic/state/unit tests; add Playwright/axe dev tooling and responsive geometry coverage; record manual visual/accessibility evidence.
8. Run repository-wide verification, documentation alignment, contrarian QA, and release-owner handoff.
9. Add the guided operations entry point, its credential-boundary tests, and an IKEA-style parameter
   guide; keep native Pages uploads, OneCLI console injection, and Worker infrastructure deployment
   as separate lanes.

## Complexity Tracking

No constitution violations require justification. Playwright and `@axe-core/playwright` are dev-only dependencies accepted because the feature's measurable overflow, touch-target, focus-obscuring, and rendered-geometry outcomes cannot be validated by jsdom or CSS-source inspection alone.

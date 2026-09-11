# Research: Modern Developer Console Design

## Decision: Use path-only SVG artwork as the production brand source

The approved V-and-rising-analytics concept will be redrawn as clean vector geometry. The production set will keep the stable filenames `vizoalica-mark.svg`, `vizoalica-lockup-light.svg`, `vizoalica-lockup-dark.svg`, `vizoalica-monochrome.svg`, and `favicon.svg`. Lockup lettering will be outlined artwork rather than live SVG text. The concept board remains a design reference outside the deployed `public` directory.

**Rationale**: Path-only SVGs are crisp at every required size, work offline, satisfy the existing content-security policy, do not depend on installed fonts, and can be reused outside the React console. Stable public filenames limit integration churn.

**Alternatives considered**:

- Ship or crop the PNG concept board: rejected because it is a presentation image, not a transparent production asset.
- Keep the current concept SVG with a live `<text>` wordmark: rejected because external SVG images may resolve the font differently and change wordmark metrics.
- Render the logo only as a React component: rejected because favicon and external/documentation consumers also need portable assets.

## Decision: Use one universal favicon and theme-specific header lockups

The favicon will be a dedicated optically simplified V-and-graph mark on a dark rounded substrate that remains legible on browser-controlled light and dark tab surfaces. The application header will select the light or dark full lockup from the same resolved theme already used by the console. Compact layouts will show the standalone mark while retaining one accessible Vizoalica name on the surrounding link.

**Rationale**: Browser favicon media queries follow operating-system preference rather than the console's explicit preference, and runtime favicon mutation adds caching and flicker risk without benefit when one high-contrast tile works everywhere. The header, unlike browser chrome, can and should honor the resolved in-app theme.

**Alternatives considered**:

- Theme-specific favicon links: rejected because they can disagree with an explicit in-app theme and are inconsistently cached.
- Keep both lockups mounted and hide one: rejected because it duplicates image and accessibility state.
- Use the compact mark plus live text at all widths: rejected because it does not deliver the approved full lockup and can drift from the wordmark artwork.

## Decision: Use system-native sans and monospace typography

All interface and display copy will use a modern system sans stack. Code, paths, timestamps, identifiers, keyboard hints, and numeric table values will use a system monospace stack. Headings and metrics will no longer use Georgia; metrics will use tabular numerals. The unfulfilled `Inter` declaration will be removed unless the font is deliberately bundled in a future feature.

**Rationale**: The local console remains fast, offline-capable, and free of font-loading layout shift or licensing assets while gaining a consistent developer-tool voice on every supported platform.

**Alternatives considered**:

- Bundle Geist or Inter plus a separate mono family: visually consistent, but rejected for this feature because it adds font assets, licensing documentation, payload, and loading behavior without improving task completion.
- Keep Georgia for display contrast: rejected because its editorial character conflicts with the requested technical console aesthetic.

## Decision: Preserve semantic CSS tokens and component classes

The redesign will keep one semantic styling vocabulary in `styles.css`: primitive palette values feed theme-role tokens, which feed component classes. The file will be organized into primitives, light/dark mappings, foundations, shell, reusable patterns, page components, responsive rules, and accessibility preferences. Component-specific literal colors will be removed.

**Rationale**: Current components already use semantic class names. Converting only part of the console to utility classes would introduce a second styling system and increase review risk without user benefit.

**Alternatives considered**:

- Rewrite all markup into Tailwind utility classes: rejected as broad churn unrelated to the requested outcome.
- Change only the existing brand color token: rejected because green-tinted surfaces, hard-coded charts, inconsistent radii, and decorative typography would remain.

## Decision: Adopt a graphite-neutral palette with separate brand and semantic roles

The core brand primitives are cyan `#12c5e8`, electric blue `#168bff`, violet `#793dff`, dark graphite `#10141c`, and off-white `#f7f8fa`. Light mode will use cool white and pale graphite surfaces with dark neutral text; dark mode will use near-black, graphite, and slate surfaces with off-white text. Theme-specific derivatives will provide accessible interactive text and chart strokes where the raw brand accent lacks contrast. Success, warning, danger, and informational states retain distinct semantic colors.

**Rationale**: This connects the application to the approved logo while preventing brand colors from being mistaken for operational status. Explicit chart, focus, selection, tooltip, border, disabled, and code tokens make both themes intentional.

**Alternatives considered**:

- Reuse cyan, blue, and violet for status: rejected because operational meaning would be ambiguous.
- Mechanically invert the light theme: rejected because contrast, elevation, charts, and code surfaces need theme-specific decisions.

## Decision: Normalize spacing, radii, density, and elevation

Spacing will use a 4-pixel base scale: 4, 8, 12, 16, 24, 32, 48, and 64 pixels. Controls will appear compact while retaining a 44-by-44-pixel touch area. Ordinary cards and inputs will use restrained 6- or 8-pixel corners; transient overlays may use 12 pixels; full pills are reserved for statuses and true capsule controls. Ordinary panels will be flat with fine borders, and shadows will be limited to transient elevation.

**Rationale**: The current unrelated spacing values, nine rounded-corner sizes, and repeated card shadows make equivalent elements feel inconsistent and consume useful data space.

**Alternatives considered**:

- Preserve the existing rounded-card language and only reduce padding: rejected because the overall interface would still read as soft and consumer-oriented.
- Use completely square controls: rejected because modest rounding improves recognition and focus without sacrificing precision.

## Decision: Use a small source-owned SVG icon set

A local icon module will provide the fixed set needed for analytics, websites, privacy/lock, refresh, themes, add, copy, chevrons, and status. Icons will share one view box, stroke weight, size scale, and accessibility rule. Supporting icons will be decorative when visible text supplies the name.

**Rationale**: This removes platform-dependent emoji and Unicode symbols without adding a runtime dependency for a small, stable set.

**Alternatives considered**:

- Add a general icon package: coherent but unnecessary for the current two-page console.
- Continue using Unicode symbols: rejected because appearance varies by platform and meaning is inconsistent.

## Decision: Use four content-driven responsive layout bands

The shell will adapt through CSS while preserving one DOM order:

- Compact, 320–639 pixels: mark-only header, visible horizontal navigation, single-column content, 16-pixel page gutters, stacked actions where needed.
- Medium, 640–959 pixels: horizontal navigation, full lockup when space permits, flexible two-up filters and metrics, single-column charts and tables.
- Standard, 960–1279 pixels: compact sidebar, two-column analytics comparisons, full-span traffic trend, list/detail website layout.
- Wide, 1280 pixels and above: 240-pixel sidebar and a capped 1120–1200-pixel content region that uses space for comparison instead of stretched prose.

Low-risk card collections may use auto-fitting grids inside these shell bands.

**Rationale**: A sidebar at 800–959 pixels leaves insufficient room for dense tables and charts. CSS-only adaptation preserves React state, semantic reading order, and keyboard order.

**Alternatives considered**:

- Hamburger navigation at compact widths: rejected because two destinations fit as visible tabs and a disclosure would add focus/state complexity.
- JavaScript viewport branches with separate desktop/mobile markup: rejected because they can reset task state and duplicate screen-reader content.
- Container queries for every component: useful at larger scale but unnecessary complexity for this console.

## Decision: Preserve task state by reflowing, not remounting

Responsive rules will not change component keys or conditionally mount alternate page trees. Existing project, website, range, selected-row, form, disclosure, and popover state remain owned by the same components through resize and orientation changes. Exact scroll pixels are not guaranteed; focused/task context must remain visible and recoverable.

**Rationale**: Layout is presentation state. Keeping it in CSS prevents resize from becoming a data or navigation event and satisfies the responsive-state requirements.

**Alternatives considered**:

- Mirror state between separate compact and desktop components: rejected because synchronization and accessibility order are fragile.

## Decision: Contain technical overflow and make overlays viewport-safe

Wide tables and code remain semantically intact inside named, keyboard-focusable scroll regions. Grid children receive shrink and wrapping rules. Time-range and future overlays gain dynamic-viewport maximum height, safe-area-aware insets, internal scrolling, and always-reachable actions. Compact navigation remains in normal document flow so it cannot obscure keyboard focus.

**Rationale**: Long paths, tables, and fixed-height overlays are the most likely sources of hidden page overflow and focus obstruction. W3C guidance treats 320 CSS pixels as the reflow target and warns that fixed or sticky content can obscure focus in zoomed layouts.

**Alternatives considered**:

- Convert table rows to separate mobile cards: rejected because it duplicates presentation and weakens table semantics.
- Make the range selector a modal bottom sheet: deferred because a true modal would require inert background and focus trapping; the current non-modal model is simpler and already tested.

## Decision: Keep Recharts and make it theme- and width-aware

Recharts remains the visualization library. Chart series, grid, axes, tooltip, cursor, and legend will consume semantic theme tokens rather than literal colors. Trend series retain dash/label differences; categorical charts use a bounded accessible palette. Visual charts remain decorative companions to authoritative exact-value tables or lists. Animations are disabled or suppressed for reduced motion, and compact layouts simplify ticks rather than shrinking labels below readability.

**Rationale**: Responsive containers and current text alternatives already provide a sound base. Replacing the library would add risk without addressing the real problems: hard-coded colors, label density, and overflow.

**Alternatives considered**:

- Replace charts with custom SVG: rejected as a larger accessibility-sensitive implementation.
- Keep literal chart colors: rejected because the existing palette leaks light-theme assumptions into dark mode.

## Decision: Add real-browser responsive and accessibility validation

Vitest and Testing Library remain responsible for semantics, theme state, asset contracts, and resize-invariant component state. A dev-only Playwright suite with `@axe-core/playwright` will run against a locally started console and verify actual viewport geometry, overflow, touch target size, focus behavior, theme rendering, and critical/serious automated accessibility findings. Manual checks remain required for screen readers, on-screen keyboards, favicon optical quality, and final visual judgment.

**Rationale**: CSS-source assertions and a simulated DOM cannot prove rendered overflow, overlap, target geometry, focus obscuring, or chart clipping. Playwright supports configured local web servers and viewport/device/color-scheme emulation, while the axe integration runs automated accessibility analysis inside Playwright pages.

**Alternatives considered**:

- Extend only existing source-string tests: rejected because they cannot verify the measurable responsive outcomes.
- Treat automated accessibility scans as complete accessibility evidence: rejected because automated tools cannot assess every WCAG requirement or product-specific visual quality.

**Primary references**:

- [W3C WCAG 2.2 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow)
- [W3C WCAG 2.2 Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [W3C WCAG 2.2 Target Size Enhanced](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)
- [Playwright local web-server configuration](https://playwright.dev/docs/test-webserver)
- [Playwright device and viewport emulation](https://playwright.dev/docs/emulation)
- [Deque axe integration for Playwright](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright)

## Decision: Make no backend, analytics, or preference-contract changes

The redesign reuses the existing resolved theme, navigation, analytics requests, website-management operations, and local preference persistence. It adds static assets, presentation components, and test infrastructure only.

**Rationale**: The feature is explicitly a brand, visual-system, and responsive redesign. Keeping application behavior unchanged minimizes privacy, security, and regression risk.

**Alternatives considered**:

- Redesign information architecture or analytics contracts in parallel: rejected as out of scope and already covered by the preceding dashboard feature.

# Feature Specification: Modern Developer Console Design

**Feature Branch**: `[008-modernize-console-design]`

**Created**: 2026-09-11

**Status**: Implemented; release-owner review pending

**Input**: User description: "Use the approved Vizoalica logo concepts as the favicon and application logo in dark and light modes. Review and redesign the console typography, colors, and overall visual language so it feels like a modern developer tool rather than an amateur interface."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recognize a Cohesive Developer Product (Priority: P1)

As a console operator, I see the approved Vizoalica V-and-analytics identity consistently in the browser and application shell, with a logo treatment that remains crisp and legible in either theme.

**Why this priority**: Product identity is the most visible part of the redesign and establishes the visual direction for every other console element.

**Independent Test**: Open the console in light and dark modes at desktop and narrow widths, inspect the browser favicon and application header, and verify that each placement uses the correct approved mark or lockup without losing clarity.

**Acceptance Scenarios**:

1. **Given** the console is using light mode, **When** any main page is displayed, **Then** the header shows the approved full Vizoalica lockup with a dark, readable wordmark and the cyan, blue, and violet analytics mark.
2. **Given** the console is using dark mode, **When** any main page is displayed, **Then** the header shows the matching approved full lockup with an off-white wordmark and the same recognizable analytics mark.
3. **Given** the console is represented in a browser tab, bookmark, or history entry, **When** the favicon is rendered at 16 or 32 pixels, **Then** the simplified V-and-graph mark remains identifiable and does not depend on small text or fine details.
4. **Given** the viewport cannot comfortably fit the full lockup, **When** the shell reflows, **Then** it may use the standalone mark while preserving an accessible Vizoalica name.

---

### User Story 2 - Scan Analytics Like a Developer Tool (Priority: P1)

As a technical operator, I can scan analytics, filters, status, and navigation quickly because the interface uses a compact, disciplined hierarchy suited to an observability or development console.

**Why this priority**: The console exists to support frequent technical decisions. Its visual hierarchy must make data and state easier to understand, not merely look different.

**Independent Test**: Give an operator a populated overview and ask them to identify the active project, website scope, time range, primary totals, leading result, and any warning or incomplete-data state without guidance.

**Acceptance Scenarios**:

1. **Given** a populated analytics overview, **When** an operator scans the page, **Then** scope controls, primary metrics, trends, rankings, and secondary distributions are visually distinct in that order.
2. **Given** dense tables, charts, or code snippets, **When** they are displayed, **Then** labels, values, timestamps, paths, and technical metadata remain readable and aligned without decorative typography competing with the data.
3. **Given** a loading, empty, partial, offline, unauthorized, success, warning, or error state, **When** it appears, **Then** it has a consistent visual treatment and communicates meaning with text or iconography in addition to color.
4. **Given** repeated controls and panels across Overview and Websites, **When** an operator moves between pages, **Then** equivalent elements retain the same typography, spacing, shape, icon treatment, and interaction states.

---

### User Story 3 - Work Comfortably in Light and Dark Environments (Priority: P2)

As an operator, I can use the console in light or dark mode for extended periods without losing contrast, chart clarity, focus visibility, or a sense of visual continuity.

**Why this priority**: Theme support is already part of the console experience; the redesign must make both themes intentional rather than treating one as a mechanical color inversion.

**Independent Test**: Exercise all main pages, controls, data states, tables, charts, and code blocks in both themes, including keyboard navigation, 200% zoom, and a narrow viewport.

**Acceptance Scenarios**:

1. **Given** either theme, **When** the operator views the same page, **Then** content hierarchy and semantic meaning remain consistent while surfaces, text, borders, and brand assets use theme-appropriate contrast.
2. **Given** a chart or status indicator, **When** viewed in either theme or with reduced color discrimination, **Then** values remain distinguishable through labels, shape, pattern, ordering, or direct text rather than hue alone.
3. **Given** keyboard-only navigation, **When** focus moves through the console, **Then** every interactive element has an obvious focus state that remains visible against its current surface.
4. **Given** an explicit theme preference, **When** the console is refreshed or restarted, **Then** the selected theme and its matching brand treatment return without a visually disruptive mismatch.

---

### User Story 4 - Use the Console Across Working Viewports (Priority: P2)

As an operator using a laptop, large monitor, zoomed browser, or narrow window, I can complete the same console tasks without clipped controls, unreadable charts, or unnecessary horizontal scrolling.

**Why this priority**: A modern developer console must work in split-screen and zoomed workflows as well as on a full desktop display.

**Independent Test**: Complete overview filtering and website-management flows at representative wide, medium, and narrow viewport widths and at 200% zoom.

**Acceptance Scenarios**:

1. **Given** a wide display, **When** the dashboard loads, **Then** it uses the available space for a clear, information-dense layout without excessively stretched cards or empty regions.
2. **Given** a narrow or zoomed viewport, **When** the same page reflows, **Then** navigation, filters, tables, charts, actions, and logo remain usable in a logical reading order without page-level horizontal scrolling.
3. **Given** a long website name, path, referrer, or technical value, **When** space is constrained, **Then** the value wraps, truncates with an accessible full value, or uses contained scrolling without breaking adjacent content.
4. **Given** a touch-first device, **When** the operator uses navigation, filters, disclosures, charts, or actions, **Then** every task can be completed without hover and interactive targets are comfortably selectable without triggering adjacent controls.
5. **Given** the viewport changes size or orientation while a page is open, **When** the layout adapts, **Then** the current project, website, time range, form input, open context, and scroll position remain stable wherever practical.
6. **Given** a popover, menu, or selector is open near a viewport edge, **When** space is limited, **Then** the overlay remains fully reachable, keeps essential actions visible, and allows its own content to scroll when necessary.

### User Story 5 - Operate the Console and Website with Guided Commands (Priority: P1)

As a technical operator, I can configure and run the local analytics console and deploy an existing
Direct Upload website through one guided entry point that tells me where each value comes from and
keeps unrelated credentials separate.

**Why this priority**: The previous multi-terminal instructions were easy to misapply, and a
Docker-only OneCLI gateway hostname caused a working installation to appear broken.

**Independent Test**: Starting from an installed checkout, run the guided setup and health check,
start both console processes with one command, and preview a Pages deployment without changing
Cloudflare until the exact project name is confirmed.

**Acceptance Scenarios**:

1. **Given** a first-time operator, **When** guided setup runs interactively, **Then** each prompt identifies where to find the requested non-secret value and makes optional website verification fields skippable.
2. **Given** a OneCLI-hosted console, **When** it starts, **Then** the host-reachable gateway is supplied explicitly and the real administrator secret remains only in OneCLI.
3. **Given** an operator wants to upload a Direct Upload Pages site, **When** the deploy command runs without confirmation, **Then** it prints the exact site, Functions directory, project, branch, and credential path and makes no change.
4. **Given** the exact Pages project is confirmed, **When** deployment proceeds, **Then** native Wrangler uploads the site and Functions without running through OneCLI and optional end-to-end verification follows.
5. **Given** Worker/D1/R2 deployment is needed, **When** the operator consults the guided workflow, **Then** it directs them to the existing approval-gated deployment commands instead of combining infrastructure mutations with console or Pages commands.

### Edge Cases

- The full horizontal logo does not fit beside theme and workspace controls.
- A browser renders only a 16-pixel favicon or applies a circular favicon mask.
- The preferred display font is unavailable or fonts are blocked; the fallback must preserve hierarchy and layout.
- The theme changes while a chart, popover, dialog, or loading state is visible.
- The operating system requests increased contrast, reduced motion, or reduced transparency.
- Metrics contain zero, very large values, long decimals, or unavailable values.
- Tables contain long Unicode paths, domains, country labels, or technical identifiers.
- A chart has one series, many categories, no data, partial data, or values too close to distinguish by hue alone.
- Theme preference storage is unavailable, invalid, or delayed during startup.
- The viewport is narrowed while a selector or disclosure is open.
- A mobile browser exposes a safe-area inset, collapsible browser chrome, or an on-screen keyboard that reduces usable height.
- Input changes between mouse, keyboard, touch, and stylus during the same session.
- A responsive chart is resized repeatedly or becomes narrower than its longest label.
- Navigation labels or translated text become substantially longer than the default English copy.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The console MUST use the approved V-and-rising-analytics-line concept as the canonical Vizoalica identity, replacing the existing magnifying-glass identity in redesigned console placements.
- **FR-002**: The production brand set MUST include separate scalable assets for a light-mode horizontal lockup, dark-mode horizontal lockup, standalone mark, favicon, and single-color use; a composite concept board MUST NOT be used directly as an interface asset.
- **FR-003**: The favicon MUST use only the simplified standalone mark, preserve a strong silhouette at 16 and 32 pixels, and remain identifiable against common light, dark, and browser-controlled tab surfaces.
- **FR-004**: Every main console page MUST display a theme-appropriate full logo in the application shell when space permits and MUST preserve an accessible Vizoalica name when the image is decorative, unavailable, or replaced by the compact mark.
- **FR-005**: Brand geometry, proportions, color relationships, and clear space MUST remain consistent across favicon, standalone mark, light lockup, and dark lockup variants.
- **FR-006**: The console MUST use a modern sans-serif typographic voice for interface copy and headings, with a complementary monospaced voice reserved for data, code, paths, timestamps, keyboard hints, and other technical content.
- **FR-007**: Decorative serif display type MUST NOT be used for primary console headings or metrics; numeric values MUST use alignment and numeral forms that make comparisons easy.
- **FR-008**: The visual palette MUST be based on graphite and neutral surfaces with restrained electric blue, cyan, and violet brand accents derived from the approved logo.
- **FR-009**: Semantic success, warning, danger, and informational colors MUST remain distinct from brand accents and MUST communicate their meaning through text or iconography as well as color.
- **FR-010**: Light and dark themes MUST each define intentional page, navigation, raised, muted, interactive, code, and overlay surfaces rather than relying on a simple inversion of the other theme.
- **FR-011**: Text, controls, icons, charts, focus indicators, and state treatments MUST meet WCAG 2.2 Level AA contrast and interaction requirements in both themes.
- **FR-012**: The console MUST establish a consistent visual hierarchy for product shell, page title, context, controls, primary metrics, charts, tables, supporting guidance, and footer content.
- **FR-013**: The console MUST use a consistent visual scale for spacing, sizing, borders, and corner radii across pages and MUST reduce unnecessary pills, oversized rounding, and decorative elevation where those treatments do not communicate state or grouping.
- **FR-014**: Data panels MUST favor flat, precise surfaces, fine separators, compact spacing, and intentional grouping; shadows MUST be subtle and limited to elements whose elevation communicates behavior, such as transient overlays.
- **FR-015**: Navigation MUST clearly distinguish current location, available destinations, workspace context, and local or offline state without consuming disproportionate space.
- **FR-016**: Primary, secondary, quiet, and destructive actions MUST have consistent hierarchy and complete default, hover, active, focus, disabled, busy, and failure states in both themes.
- **FR-017**: Form controls, selectors, popovers, disclosures, tables, charts, code blocks, notices, and empty states MUST share the same design language and remain distinguishable without relying solely on container cards.
- **FR-018**: The console MUST replace decorative Unicode symbols with a coherent icon treatment wherever an icon carries meaning, and decorative icons MUST be hidden from assistive technology.
- **FR-019**: Charts MUST use the brand palette sparingly, provide readable axes and labels, expose exact values outside pointer hover, and remain understandable when printed in grayscale or viewed with reduced color discrimination.
- **FR-020**: Dashboard density MUST prioritize rapid comparison: primary metrics and active filters MUST remain visible early in the reading order, while secondary explanatory content MUST not compete with analytics.
- **FR-021**: The redesigned shell and pages MUST reflow without page-level horizontal scrolling at a 320-pixel viewport and at 200% zoom, except for intentionally contained technical content such as wide code or data tables.
- **FR-022**: Motion and transitions MUST be brief, functional, and suppressed when the operator requests reduced motion; essential status changes MUST never depend on animation.
- **FR-023**: A theme change MUST update the logo, favicon where supported, controls, charts, code surfaces, and semantic states coherently without a mixed-theme intermediate state that persists beyond initial rendering.
- **FR-024**: Loading, empty, partial, unavailable, offline, unauthorized, success, warning, and error states MUST use documented, reusable patterns with clear recovery guidance where an operator action can help.
- **FR-025**: Existing analytics, website-management, privacy, authorization, theme-persistence, and version-display behavior MUST remain functionally unchanged by the visual redesign.
- **FR-026**: The redesign MUST cover the shared application shell, Overview page, Websites page, access states, theme control, filters, metrics, charts, tables, forms, integration snippets, status panels, notices, and footer.
- **FR-027**: The redesign MUST document the approved brand usage, typography roles, palette roles, spacing hierarchy, component states, chart treatment, responsive behavior, and accessibility guidance for future console work.
- **FR-028**: The layout MUST adapt across compact, medium, standard desktop, and wide desktop viewports by changing composition and density while preserving the same information and actions.
- **FR-029**: Wide layouts MUST use available space for useful comparison, medium layouts MUST reduce columns before content becomes cramped, and compact layouts MUST present the primary workflow in a single logical reading column.
- **FR-030**: The application header and navigation MUST provide a compact presentation when the full desktop arrangement no longer fits, without obscuring page content or removing access to any destination, workspace state, or theme control.
- **FR-031**: Responsive changes MUST preserve the operator's current project, website, time range, entered form values, selected item, and other active task context; resizing alone MUST NOT reset the workflow.
- **FR-032**: Tables and technical content MUST adapt through prioritization, wrapping, disclosure, or contained horizontal scrolling while keeping row identity, headers, actions, and the full value accessible.
- **FR-033**: Charts MUST resize without clipped marks or labels, provide a readable compact presentation, and retain access to exact values and textual alternatives at every supported width.
- **FR-034**: Popovers, menus, selectors, notices, and transient overlays MUST remain within the usable viewport, avoid covering their controlling element unnecessarily, and permit internal scrolling when content exceeds available height.
- **FR-035**: All primary touch targets MUST provide at least a 44-by-44-pixel selectable area, except inline text links where sufficient separation and an equivalent accessible interaction are provided.
- **FR-036**: No primary console workflow may depend on hover, precise pointer movement, or a specific input type; equivalent information and actions MUST be available by keyboard and touch.
- **FR-037**: Responsive layouts MUST respect safe-area insets and changes caused by browser chrome or an on-screen keyboard so focused controls and required actions remain visible.
- **FR-038**: Responsive adaptation MUST not duplicate meaningful content in a way that causes repeated screen-reader announcements or an inconsistent keyboard order.
- **FR-039**: The repository MUST expose one guided operations entry point for setup, diagnostics, local console startup, Direct Upload Pages deployment, and parameter-location help.
- **FR-040**: Guided setup MUST store only non-secret URLs, identifiers, paths, and a literal OneCLI placeholder; it MUST reject secret-bearing command options.
- **FR-041**: The local-console runner MUST explicitly use a gateway reachable from the host, reject the Docker-only `gateway` hostname, and start the API and web console together with one stop action.
- **FR-042**: A Pages deployment MUST use native Wrangler outside OneCLI, show its resolved target before mutation, and require the exact Pages project name as confirmation.
- **FR-043**: Worker/D1/R2 deployment, Pages upload, and local-console access MUST remain separate documented credential lanes.
- **FR-044**: Operations documentation MUST explain where every requested parameter is found and distinguish the internal Source ID from the public source key.

### Key Entities

- **Brand Asset Set**: The canonical Vizoalica mark and its light, dark, compact, favicon, and single-color variants, including minimum-size, clear-space, background, and accessible-name rules.
- **Visual Theme**: The coordinated light or dark presentation of surfaces, text, borders, brand assets, charts, focus, code, and semantic states.
- **Typography System**: The roles and hierarchy for interface text, headings, metrics, tabular values, code, paths, and technical metadata, including resilient fallbacks.
- **Visual Language**: The shared rules for spacing, density, borders, radii, elevation, iconography, controls, panels, tables, charts, and feedback states.
- **Console Shell**: The persistent product frame containing brand, navigation, workspace context, theme control, main content, and footer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability review, at least 4 of 5 representative technical operators describe the console as professional, modern, and appropriate for a developer analytics tool without being prompted with those words.
- **SC-002**: At least 90% of representative operators can identify the active project, website scope, time range, primary traffic values, and any warning state within 30 seconds of opening a populated overview.
- **SC-003**: The favicon remains recognizable as the Vizoalica V-and-graph mark in 100% of acceptance captures at 16 and 32 pixels on representative light and dark browser tab surfaces.
- **SC-004**: The full logo remains legible and correctly proportioned in 100% of reviewed header placements in light mode, dark mode, wide layout, narrow layout, and 200% zoom.
- **SC-005**: All redesigned pages and states pass automated accessibility checks and representative keyboard, screen-reader, 200% zoom, reduced-motion, light-theme, and dark-theme reviews with no critical or serious findings.
- **SC-006**: All normal text, controls, focus indicators, status treatments, and meaningful chart elements meet WCAG 2.2 Level AA contrast requirements in both themes.
- **SC-007**: Overview and Websites flows can be completed at a 320-pixel viewport and at 200% zoom without page-level horizontal scrolling or loss of required controls.
- **SC-008**: Equivalent components across all main console pages match the documented typography, spacing, color, shape, icon, and state rules in 100% of visual acceptance checks.
- **SC-009**: Light-to-dark and dark-to-light theme changes complete without a persistent mismatched logo, chart, control, or surface in 100% of theme-transition acceptance tests.
- **SC-010**: Existing analytics, website-management, privacy, authorization, theme-persistence, and version-display acceptance suites complete without functional regression.
- **SC-011**: At least 80% of representative operators prefer the redesigned console over the previous console in a side-by-side evaluation focused on scanability, credibility, and visual coherence.
- **SC-012**: All primary console workflows pass visual and interaction checks at representative viewport widths from 320 through 1440 pixels in both themes with no clipped content, overlapping controls, unreachable actions, or unintended page-level horizontal scrolling.
- **SC-013**: Project selection, website selection, time range, entered form data, and open task context remain unchanged in 100% of viewport-resize and orientation-change acceptance tests unless the operator explicitly changes them.
- **SC-014**: Every primary navigation item, filter, button, disclosure, and chart interaction can be completed by touch without hover, with no adjacent-target activation in representative touch testing.
- **SC-015**: Tables, charts, code snippets, menus, and selectors remain understandable and operable at 320 pixels wide, at 200% zoom, and with an on-screen keyboard visible in 100% of responsive acceptance scenarios.
- **SC-016**: An operator can configure the non-secret console and Pages coordinates, diagnose the setup, and start both local processes using only `pnpm ops` commands and one terminal for runtime processes.
- **SC-017**: A Pages deployment invoked without the exact configured project confirmation performs zero remote mutations and identifies the target and native-Wrangler credential path.
- **SC-018**: Automated operations tests reject secret-bearing flags and the Docker-only gateway hostname and prove that Pages and console commands use their intended credential paths.

## Assumptions

- The approved visual direction is the newly created geometric V combined with a rising analytics line and cyan, blue, and violet nodes; the previous magnifying-glass brand concept is superseded for this console redesign.
- The approved concept images are source references. Production usage requires separately prepared, clean, scalable brand assets rather than cropping the presentation board at runtime.
- The scope is the local Vizoalica administration and analytics console, not a public marketing site, documentation site, or unrelated product surface.
- Existing information architecture and product capabilities remain in place; this feature changes brand presentation, visual hierarchy, and interaction polish rather than adding analytics dimensions or administrative operations.
- The existing explicit light and dark preference behavior remains authoritative and is reused by the redesigned experience.
- The default design direction is a compact, precise developer-console aesthetic: modern sans-serif interface typography, monospaced technical accents, neutral graphite surfaces, restrained electric brand color, fine borders, limited elevation, and purposeful motion.
- Responsive presentation changes layout and density, not capability; compact-width operators retain access to every action and piece of information available on wider layouts.
- Representative responsive acceptance coverage spans 320 to 1440 pixels, portrait and landscape orientation, 200% zoom, and keyboard, pointer, and touch input.
- Existing privacy and security boundaries are unaffected because the redesign introduces no new analytics data or credentials.
- The prior dashboard visual-refresh work is a dependency and baseline; this specification supersedes its magnifying-glass branding direction and tightens the visual system across the entire console.

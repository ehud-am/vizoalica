# UI Contract: Vizoalica Console Visual System

## Scope

This contract governs the shared shell, Overview, Websites, access states, filters, metrics, charts, tables, forms, integration snippets, status panels, notices, theme control, and footer. It changes presentation only; existing analytics and administration interfaces remain unchanged.

## Brand asset contract

The deployable directory exposes these stable files:

| Asset | Purpose | Theme behavior |
|-------|---------|----------------|
| `/brand/favicon.svg` | Browser tab/bookmark mark, optimized for 16–32 px | Universal dark tile; does not switch with app theme |
| `/brand/vizoalica-mark.svg` | Standalone product mark at compact header/app-icon sizes | Universal approved mark |
| `/brand/vizoalica-lockup-light.svg` | Full lockup on light surfaces | Selected when resolved app theme is light |
| `/brand/vizoalica-lockup-dark.svg` | Full lockup on dark surfaces | Selected when resolved app theme is dark |
| `/brand/vizoalica-monochrome.svg` | One-ink print/export/fallback use | Used only on documented compatible surfaces |

All production SVGs must:

- have an intrinsic `viewBox`;
- contain path/vector geometry only;
- contain no `<text>`, `<image>`, script, animation, filter, or external reference;
- preserve the same canonical V-and-analytics mark geometry, with favicon-specific optical simplification permitted;
- remain transparent outside approved mark substrates.

The composite concept PNG and dark concept SVG are references, not deployable assets.

## Header brand contract

- The application exposes one focusable brand/home link with one accessible name.
- The logo image inside that link is decorative (`alt=""`) because the link supplies the name.
- Full layouts render exactly one theme-appropriate lockup.
- Compact layouts render exactly one standalone mark; no hidden duplicate meaningful logo is announced.
- Logo dimensions or aspect ratio are reserved before load to prevent shell layout shift.
- A resolved-theme change switches the full lockup without remounting or resetting the application shell.
- The accessible name describes the actual link behavior; a link named “home” must navigate to the Overview destination.

## Typography contract

- Interface family: `ui-sans-serif`, system user-interface fallbacks.
- Technical family: `ui-monospace`, platform monospace fallbacks.
- Display/page, section, body/control, metadata, metric, and code roles are defined once and reused.
- Metrics and numeric table columns use tabular numerals.
- Primary headings and metrics must not fall back to decorative serif presentation.
- Paths, URLs, identifiers, timestamps, and code use the technical role and retain access to the complete value.

## Theme-token contract

Components consume semantic roles rather than palette literals. Required roles include:

- page, navigation, raised, muted, interactive, code, and overlay surfaces;
- primary, secondary, muted, inverse, and link text;
- default, strong, input, and separator borders;
- hover, active, selected, disabled, focus, and overlay-shadow interaction states;
- information, success, warning, and danger surfaces/text/icons;
- primary/comparison/categorical chart series, chart grid/axis/cursor, and tooltip surface/border/text.

Light and dark theme mappings must each meet the applicable contrast requirements. Brand accents must not double as semantic success, warning, or danger colors.

## Responsive contract

### Compact: 320–639 px

- Mark-only header with visible theme/workspace controls.
- Overview and Websites remain visible as horizontal navigation; no hamburger is required for two destinations.
- Page headings, filters, metrics, dashboard panels, principles, website list/detail, health data, and action groups use one logical column.
- Page gutter is 16 px; panels use compact padding.

### Medium: 640–959 px

- Navigation remains horizontal.
- The full lockup may appear when available width supports it without crowding controls.
- Filters and primary metrics may use two columns when their minimum readable width is preserved.
- Charts, ranked tables, distributions, and website list/detail remain one column.

### Standard: 960–1279 px

- A compact sidebar is permitted.
- Analytics comparisons use two columns; the traffic trend spans both columns.
- Website list and selected detail use a split layout.

### Wide: 1280 px and above

- Sidebar width is approximately 240 px.
- Main content is capped at a readable 1120–1200 px.
- Additional space supports comparison and breathing room, not stretched text or arbitrarily wide controls.

### Invariants

- Responsive behavior is CSS-driven and preserves one semantic DOM order.
- Layout changes never reset destination, project, website, range, form, disclosure, popover, or focus context.
- No page-level horizontal scrolling occurs at 320 px or 200% zoom; essential wide technical data is contained in named local scroll regions.
- Primary targets expose at least a 44-by-44-pixel selectable area except documented inline text-link cases.
- No workflow depends on hover or precise pointer input.
- Safe-area insets, dynamic viewport height, and on-screen keyboards do not make focused controls or required actions unreachable.

## Table and technical-overflow contract

- Real table semantics, captions, row headers, and column headers remain intact.
- A table that can exceed its container sits inside a keyboard-focusable named overflow region.
- The full value of truncated or wrapped text is available by focus, activation, or adjacent accessible text.
- Code blocks keep contained scrolling and remain keyboard reachable.
- Responsive presentation does not create a second mobile-only copy of the same table.

## Chart contract

- Recharts visual output remains a supplemental visualization; an adjacent semantic table or list exposes the same values.
- Series use semantic theme tokens and retain non-color differentiation such as dash pattern, label, or stable ordering.
- Compact charts reduce tick density or label length before reducing readable type size.
- Grid, axes, cursor, legend, and tooltip are explicitly themed.
- Chart animation is disabled or suppressed when reduced motion is requested.
- Donut/pie layouts stack visual and legend when needed; legend values wrap without clipping.

## Overlay contract

- The time-range selector retains one mounted instance through responsive changes.
- Escape, Cancel, and successful Apply return focus to the trigger.
- Overlay height is bounded by the current dynamic viewport and safe-area insets.
- Overflow is contained within the overlay and required actions remain reachable.
- The existing non-modal interaction remains non-modal; `aria-modal` and focus trapping are not added unless the component is deliberately converted to a true modal dialog.

## Accessibility and state contract

- The console conforms to WCAG 2.2 Level AA; the feature additionally targets 44-pixel primary touch areas.
- Focus is visible and not fully obscured in every supported layout.
- Selected, busy, success, warning, error, partial, offline, and unauthorized states include text or icon meaning beyond color.
- Reduced-motion and forced-colors preferences retain usable feedback and navigation.
- Theme changes do not leave a persistent mixed-theme logo, chart, control, or surface.
- Automated accessibility results are evidence, not a substitute for keyboard and assistive-technology review.

## Interface compatibility

- No backend endpoint, analytics response, storage schema, authentication rule, or local preference schema changes.
- Existing theme persistence and version injection remain authoritative.
- Existing user flows and accessible names remain stable unless this contract explicitly corrects a label/behavior mismatch.

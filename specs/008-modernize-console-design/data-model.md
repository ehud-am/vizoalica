# Data Model: Modern Developer Console Design

This feature does not add or alter analytics, website, credential, or preference persistence. Its model consists of static design assets and presentation contracts that map the existing resolved theme and viewport to one coherent interface.

## Brand Asset Set

Represents one versioned family of Vizoalica artwork derived from the approved V-and-rising-analytics mark.

### Fields

- `identity`: fixed product name, `Vizoalica`
- `geometryVersion`: reviewable revision of the canonical mark geometry
- `palette`: off-white, graphite, blue, cyan, violet, and a single-ink fallback
- `variants`: favicon, standalone mark, light lockup, dark lockup, monochrome lockup
- `viewBox`: intrinsic coordinate system for each variant
- `minimumSize`: smallest approved rendered size for each variant
- `clearSpace`: minimum separation from surrounding content
- `approvedSurfaces`: theme/background roles on which the variant is valid
- `accessibilityUsage`: guidance for meaningful versus decorative HTML consumers

### Validation rules

- All production variants share the same canonical mark proportions.
- Production files contain vector paths only: no raster image, live text, script, filter, animation, or external reference.
- The favicon contains no wordmark and remains distinguishable at 16 and 32 pixels.
- The light lockup uses a dark wordmark; the dark lockup uses an off-white wordmark.
- The monochrome variant uses exactly one ink.
- Concept/reference artwork is not deployed as a production web asset.

## Visual Theme

Maps the existing resolved theme to semantic presentation roles and the correct brand lockup.

### Fields

- `mode`: `light` or `dark`
- `surfaces`: page, navigation, raised, muted, interactive, code, overlay
- `text`: primary, secondary, muted, inverse, link
- `borders`: default, strong, input, separator
- `interaction`: hover, active, selected, disabled, focus
- `semanticStates`: information, success, warning, danger
- `charts`: primary series, comparison series, categorical palette, grid, axis, tooltip
- `brandLockup`: light- or dark-background asset selected from the resolved mode

### Relationships

- One `Visual Theme` selects one full `Brand Asset Set` lockup.
- Every `Component Visual Contract` consumes semantic roles from the active theme.
- The universal favicon belongs to the brand set but is independent of theme mode.

### State transitions

1. Initial state resolves from the operating-system preference.
2. A stored explicit preference may replace that initial state.
3. An operator selection changes the resolved state immediately.
4. Successful persistence restores the selection on restart; persistence failure keeps the current session state and exposes nonblocking status.

The lockup, document theme, controls, charts, and semantic states must always derive from the same resolved state.

## Typography System

Defines the reading roles used throughout the console.

### Fields

- `interfaceFamily`: system sans-serif stack
- `technicalFamily`: system monospace stack
- `roles`: display, page title, section title, body, control, metadata, metric, table value, code
- `size`: approved size for each role
- `lineHeight`: approved line height for each role
- `weight`: approved emphasis range for each role
- `tracking`: letter spacing for each role
- `numericStyle`: tabular numerals for comparison-oriented values

### Validation rules

- Page headings and metrics do not use decorative serif type.
- Technical strings remain distinguishable from interface prose.
- Fallback fonts preserve readable hierarchy without horizontal clipping.
- Text remains readable at 200% zoom and supports user-agent text scaling.

## Layout Band

Represents a presentation state selected from available viewport width without changing product state or semantic DOM order.

### Values

| Band | Width | Shell | Primary content behavior |
|------|-------|-------|--------------------------|
| Compact | 320–639 px | Mark-only header, visible horizontal navigation | Single-column workflow, compact gutters, stacked actions as needed |
| Medium | 640–959 px | Horizontal navigation, full lockup when it fits | Flexible filters/metrics; charts, tables, and website sections stack |
| Standard | 960–1279 px | Compact sidebar and full lockup | Two-column comparisons, full-span trend, website list/detail split |
| Wide | 1280 px and above | 240 px sidebar and full lockup | Capped readable content with useful comparison density |

### Validation rules

- Layout-band transitions do not mount a second copy of meaningful content.
- Project, website, range, form, selection, disclosure, popover, and focus context survive a band transition.
- The document does not scroll horizontally at 320 pixels except inside named technical overflow regions.
- Safe-area insets and dynamic viewport height are respected.

## Component Visual Contract

Defines consistent presentation and interaction states for one reusable console pattern.

### Fields

- `role`: shell, navigation, action, form control, panel, metric, chart, table, code block, notice, overlay, status, empty state
- `typographyRole`: reference to the typography system
- `surfaceRole`: reference to the active visual theme
- `spacingRole`: value from the shared 4-pixel scale
- `radiusRole`: compact, standard, overlay, or pill
- `states`: default, hover, active, selected, focus, disabled, busy, success, warning, error
- `responsiveBehavior`: wrapping, stacking, spanning, compacting, or contained overflow
- `accessibleNameSource`: visible label, associated label, caption, or contextual consumer label

### Validation rules

- Equivalent roles have equivalent states across pages.
- Status and selection are never communicated by color alone.
- Primary controls have a 44-by-44-pixel touch area except approved inline-link cases.
- Hover-only information or actions are forbidden.
- Decorative icons are excluded from the accessibility tree.

## Responsive Task Context

Represents the user-owned application state that presentation changes must preserve.

### Fields

- current destination
- project selection
- website scope or selected website
- applied and draft time range
- entered form values
- open disclosure or popover
- focused control and recoverable reading context

### State rule

A viewport resize, orientation change, zoom change, or input-mode change may alter layout but must not alter these values. Exact scroll coordinates may move as content reflows; the active task and focused control must remain discoverable and visible.

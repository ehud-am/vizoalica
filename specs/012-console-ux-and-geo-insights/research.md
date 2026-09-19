# Research: Console UX Review, View/Manage Separation, and Geography Insights

All Technical Context unknowns are resolved below.

## R1. Where do map shapes come from without third-party requests?

- **Decision**: Generate static SVG path data once, at development time, from the Natural Earth
  110m TopoJSON (public domain, distributed as `world-atlas`), projected with a standard
  equal-area-friendly projection, and commit it as a TypeScript data file. The generator is a
  committed script and its inputs are dev dependencies only.
- **Rationale**: No runtime dependency, no network request, deterministic output, small bundle,
  and the license position is simple. It satisfies FR-022 and SC-009.
- **Alternatives**: Runtime map library (adds a dependency and bundle weight); tile map service
  (third-party requests, forbidden); hand-drawn tile-grid map (no geometry needed but less
  recognizable and harder to make accurate); GeoJSON fetched from a CDN (third-party request).

## R2. Country names and continents

- **Decision**: Generate `countries.ts` from a permissively licensed country reference dataset:
  alpha-2 code, numeric code (to join with map shapes), common English name, and continent
  derived from region/subregion (Americas split into North and South America). Add explicit
  entries for special values: `T1` → "Tor network", `XX` and `Unknown` → "Unknown location".
- **Rationale**: Deterministic names across browsers and tests. Common names ("United States",
  "South Korea") read better than formal ones. Runtime `Intl.DisplayNames` was rejected because
  its output varies by browser and ICU version.
- **Alternatives**: `Intl.DisplayNames` (nondeterministic across engines); maintaining names by
  hand (error-prone).

## R3. Previous-period comparison without a new endpoint

- **Decision**: Issue a second overview request for the immediately preceding equal-length range
  and use only its totals. Show the change as an absolute and percent difference; if the earlier
  range is incomplete or unavailable, show "not available" instead of a misleading number.
- **Rationale**: Avoids a Worker change. The overview response is small and already bounded.
- **Alternatives**: New comparison endpoint (Worker change and redeploy for little gain); compute
  from the trend (fails when the previous range is outside the loaded window).

## R4. Complete lists within bounded aggregates

- **Decision**: In the Worker, return up to 300 country rows and up to 100 rows for pages,
  referrers, and user agents, with the remainder in `otherCount`. Distributions keep their current
  shape. The console shows the top ten and offers "Show all", and works unchanged with an older
  Worker.
- **Rationale**: The queries already read every row and truncate afterward, so this adds no
  query cost, only response size (bounded by a few kilobytes). About 250 countries exist, so 300
  is complete.
- **Alternatives**: Separate "full list" endpoint (more surface, no benefit); unbounded lists
  (violates the bounded-aggregate rule).

## R5. Routing and persistence

- **Decision**: A small hash router (`#/analytics/geography`, `#/manage/websites`) and a scope
  provider that persists the last project, website, and range in `localStorage`, wrapped so it is
  optional. Invalid saved scope falls back to the first project and states what changed.
- **Rationale**: Back/forward and reload behave, with no new dependency. Storage is a per-viewer
  convenience only, as recommended for browser storage.
- **Alternatives**: A router library (dependency, unnecessary); putting scope in the URL (longer
  links, more state to validate), which can be added later.

## R6. Proving view/manage separation automatically

- **Decision**: Encode the capability matrix as data (`capabilities.ts`). Every mutating control
  is rendered through an action component that requires a capability id. A test renders every
  Analytics route with a recording API mock and asserts (a) no element carries a capability tag and
  (b) only read requests were issued. A second test asserts each matrix entry maps to the area
  where it renders.
- **Rationale**: Turns SC-001 into an executable check and provides the seam for later RBAC.
- **Alternatives**: Manual review only (regresses silently).

## R7. Confirmation dialogs

- **Decision**: A custom accessible confirmation dialog (`role="alertdialog"`, labelled and
  described, focus moves in, is trapped, and returns to the trigger on close; Escape cancels). The
  user must type nothing, but the destructive button is separate from the default focus, which
  lands on Cancel.
- **Rationale**: Replaces `window.confirm` (FR-006), keeps keyboard operability, and works in jsdom
  where `<dialog>.showModal` is unavailable.
- **Alternatives**: Native `<dialog>` (not fully supported in the test environment); type-to-confirm
  for every delete (heavy for websites, but reserved for project deletion since it removes all
  websites).

## R8. Chart form for distributions

- **Decision**: Replace pie charts with sorted horizontal bar lists (label, bar, percent, count)
  and a visible table toggle. Use a single-hue sequential ramp for the map and the existing
  categorical palette only where categories must be distinguished.
- **Rationale**: Bars compare better than slices for many categories, are readable without color,
  and follow the project's data-visualization guidance. Recharts stays for the trend.
- **Alternatives**: Keep pies (spec finding F-14).

## R9. Privacy review record (FR-025)

- **Decision**: Add `docs/privacy/audience-attributes-review.md` recording decisions: country and
  continent approved (already collected, derived); browser language deferred pending its own
  spec (would need a new stored field, a retention decision, and a small-count review); region
  or city rejected for now (higher re-identification risk); age, gender, and interests rejected
  (not collectable under the privacy-minimal principle).
- **Rationale**: Satisfies the constitution's requirement for a documented review before any new
  field, without collecting anything.

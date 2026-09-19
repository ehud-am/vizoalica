# Data Model: Console UX Review, View/Manage Separation, and Geography Insights

No stored data is added or changed. These are console-side and reference-data shapes.

## Reference data (generated, committed)

### Country

| Field | Type | Notes |
|---|---|---|
| `code` | string (2 letters, uppercase) | Key. Matches stored aggregate labels. |
| `numeric` | string | Joins to map shapes. |
| `name` | string | Common English name, for example "Germany". |
| `continent` | `Africa` \| `Antarctica` \| `Asia` \| `Europe` \| `North America` \| `Oceania` \| `South America` | Derived from region and subregion. |

### SpecialLocation

| Stored label | Display name | Continent |
|---|---|---|
| `T1` | Tor network | none (not on the map) |
| `XX`, `Unknown`, empty | Unknown location | none |
| any other unrecognized value | `<value> (unrecognized)` | none |

### MapShape

`{ numeric: string, path: string }` where `path` is an SVG path in a fixed viewBox. Shapes without
a matching country (for example disputed areas) are drawn inert.

## Console view models

### LocationRow

`{ label, name, code?, continent?, count, share }`. Derived from `RankedResult.items` plus
`otherCount`. `share` is `count / total`. Rows sort by count descending then name.

### ContinentTotal

`{ continent, count, share, countryCount }`. Locations without a continent are reported under a
separate "Unlocated" total so totals add up to the range total.

### MetricComparison

`{ current, previous?, delta?, percent?, state }` where `state` is `available`,
`no-previous-data` (the previous range predates complete aggregates), or `unavailable`. `percent` is omitted
when `previous` is 0.

### Scope

`{ projectId, websiteId | '' }` plus `range` (`AppliedRange`, existing type). Persisted per viewer.
Restored only when the project (and website) still exist; otherwise falls back and reports why.

### Capability

`{ id, class: 'view' | 'operate' | 'administer', area: 'analytics' | 'manage', destination }`.
The full list is the capability matrix in `ux-review.md` section 5 and lives in
`apps/admin-web/src/capabilities.ts`.

## State transitions

- **Scope**: `project chosen → website optional`. Changing project clears website. A deleted project
  or website in scope triggers fallback plus a visible notice.
- **Analytics data**: `idle → loading (placeholders) → ready | error (per section)`. Never shows
  values from a previous scope or range.
- **Destructive action**: `requested → confirming (dialog open) → running → done | failed`.
  Cancel returns to `requested` with focus on the trigger.

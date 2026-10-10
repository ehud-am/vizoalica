# Implementation Plan: Console UX Review, View/Manage Separation, and Geography Insights

**Branch**: `012-console-ux-and-geo-insights` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-console-ux-and-geo-insights/spec.md`

## Summary

Restructure the local operator console into two areas (Analytics for viewing, Manage for
configuration and administration) with one shell-level scope control, focused analytics views, and
a new Geography view (full country names, world map, complete table, continent totals). The work
is almost entirely in the console (`apps/admin-web`). The only backend change is raising the
country (and other ranking) result limits so complete lists are available; the console degrades
gracefully against a Worker that still returns the old top-ten shape. No new data is collected:
country names, continents, and map geometry are static reference data bundled with the console.
The FR-025 privacy review for further attributes is recorded as documentation only.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 22, React 19

**Primary Dependencies**: existing: React, Vite 6, Recharts 3, Tailwind 4. New at generation time
only (dev dependencies, not shipped): a TopoJSON world dataset, a TopoJSON reader, a map
projection library, and a country reference dataset, used by a generator script that emits
committed static TypeScript data files. No new runtime dependencies.

**Storage**: N/A for new data. Per-viewer convenience (last scope, last time range) is kept in
browser storage, guarded so the console works when storage is unavailable. Existing D1
dimension aggregates are read unchanged.

**Testing**: Vitest (jsdom + Testing Library) for units, components, and contract tests;
Playwright + axe for responsive, keyboard, and accessibility checks against a mocked API.
Repository coverage must stay above 90% lines and branches.

**Target Platform**: Local console served on a loopback address, in current evergreen browsers
(Chromium, Firefox, WebKit); Worker on Cloudflare (unchanged deployment).

**Project Type**: Web application (React console) plus an existing Worker API.

**Performance Goals**: Region/scope switch renders placeholders immediately; complete results for
a 30-day range appear at the same speed as today; the world map adds no network requests and
under about 150 KB to the console bundle.

**Constraints**: No third-party requests from the console. No new collected data. No roles or
authorization changes. Bounded aggregates only. WCAG 2.2 AA. Must not touch a real Cloudflare
account during development or testing (all tests use mocks or local fixtures).

**Scale/Scope**: About 250 country entries; up to 300 country rows per response; other rankings
capped at 100 rows; 6 analytics views and 4 manage destinations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle / rule | Assessment |
|---|---|
| I. Privacy-minimal analytics | Pass. No new fields. Country was already aggregated. Rankings stay aggregates and are bounded (300 and 100 rows). Age and gender are explicitly not collected. Privacy review for language and region recorded (FR-025). |
| II. Security and abuse resistance | Pass. No new externally reachable interface. The map makes no third-party requests. Destructive actions get stronger confirmation. Negative tests: Analytics area makes no mutating calls; unrecognized country codes render safely; labels are rendered as text, never as markup. |
| III. Open source and portability | Pass. Map data is public-domain (Natural Earth) or permissively licensed and attributed. The generator script is committed. |
| IV. Minimal infrastructure | Pass. No new services. The Worker change is a limit change. |
| V. Human-readable and AI-ready engineering | Pass. Specs precede code; docs and `llms.txt` updated (FR-027). Generated data files are labelled as generated with the script that produces them. |
| Accessible product experience | Pass by design: map has a full table equivalent, no color-only meaning; extended axe and keyboard tests. |
| Architecture: raw events separate from aggregates | Pass. No raw-event access. |
| Development workflow and release gates | Pass with note: the alignment review, QA report, and go/no-go are release tasks. They are prepared (QA report draft) but the release decision stays with the human owner. |

No violations; Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/012-console-ux-and-geo-insights/
├── spec.md
├── ux-review.md
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── console-navigation.md
│   ├── rankings-limits.md
│   └── geography-display.md
├── checklists/requirements.md
├── tasks.md             # from /speckit-tasks
└── qa-report.md         # written at the end of implementation
```

### Source Code (repository root)

```text
apps/admin-web/src/
├── App.tsx                        # shell only: connect, route, scope provider
├── router.ts                      # small hash router (no new dependency)
├── capabilities.ts                # capability matrix as data; used by tests
├── scope/                         # ScopeProvider, persisted scope + range
├── shell/                         # Header, ScopeBar, AreaNav, HelpMenu
├── analytics/                     # Overview, Pages, Sources, Geography, Technology, TrafficQuality
│   └── geo/                       # WorldMap, CountryTable, ContinentSummary
├── manage/                        # Projects, Websites, Installation, Health, DangerZone
├── components/                    # shared: ConfirmDialog, RankedList, Distribution, MetricCard, ...
└── geo/                           # GENERATED: countries.ts, world-paths.ts, plus geo-labels.ts
scripts/generate-world-geo.mjs     # generator for the two data files
apps/ingest-worker/src/storage/d1-repositories.ts   # ranking limits only
apps/admin-web/tests/              # unit + component + contract tests
apps/admin-web/e2e/                # Playwright + axe
docs/privacy/audience-attributes-review.md          # FR-025 record
```

**Structure Decision**: Keep the existing single-page React console and split its two large pages
by area rather than introducing a routing framework. A small hash router keeps deep links and the
back button working with no dependency. Analytics views share one data provider so switching
between them does not refetch.

## Design Decisions (summary; details in research.md)

1. **Two areas, one seam.** `Analytics` and `Manage` are separate route trees and separate folders.
   Every mutating control carries a capability tag from the matrix, and a test asserts none exist
   under Analytics and that Analytics issues only read requests.
2. **Scope is a single provider.** Project and website are chosen only in the shell; pages read
   them. The add-website form keeps its explicit first-field project choice.
3. **Geography is reference data plus presentation.** Names, continents, and map paths come from
   generated static files; historical data works untouched.
4. **Previous-period comparison** uses a second request to the existing overview endpoint for the
   preceding equal-length range, so no new endpoint is needed. If the earlier range is
   unavailable or incomplete, the comparison shows "not available".
5. **Complete lists** come from raising the Worker limits; the console shows the top ten with a
   control to show all and tolerates the older shape.

## Complexity Tracking

Not applicable; no constitution violations.

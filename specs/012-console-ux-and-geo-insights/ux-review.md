# Console UX Review (First Pass)

**Feature**: [spec.md](./spec.md) · **Date**: 2026-09-19 · **Status**: First pass; every finding resolved or deferred (see the resolution table in section 7)

**Method**: Static review of the console source (`apps/admin-web/src`) and the aggregate schema,
plus general familiarity with other analytics products. After implementation the result was viewed
in Chromium against a mocked API (light, dark, phone). It has **not** been walked with real data,
and the benchmark notes have not been re-verified against the live products. Severity: **H** blocks task success or risks a wrong action, **M** slows or
confuses users, **L** polish.

## 1. Current console map

| Destination | What it contains | View or manage |
|---|---|---|
| Projects | Create project form, project cards with Select / Analytics / Websites / **Delete project** | Mixed |
| Overview | Project + website + time-range filters, 2 totals, trend, 4 ranked tables, 4 pie charts, "principles" panel | View only |
| Websites | Project picker, website list, add/edit forms, Disable / **Delete**, status, reachability, installation snippets | Mixed |
| Shell | Theme toggle, "Local workspace" pill, "Private by design" note, footer | Chrome |

## 2. Findings

### Organization and separation of view versus manage

| ID | Sev | Finding | Evidence | Resolved by |
|---|---|---|---|---|
| F-01 | H | Viewing and managing are interleaved. The Projects page places Delete next to the Analytics shortcut, and Websites holds status, editing, disabling, deleting, and install steps together. There is no seam along which access could later be split. | `ProjectsPage.tsx`, `WebsitesPage.tsx` | FR-001–005 |
| F-02 | H | Navigation is one flat "Workspace" list of three items with no grouping by purpose. | `App.tsx` | FR-001, FR-012 |
| F-03 | H | Destructive actions look routine: Disable and Delete sit side by side with equal weight, and confirmation is a native `window.confirm`. | `WebsitesPage.tsx`, `ProjectsPage.tsx` | FR-006 |
| F-04 | M | Manage tasks are buried: adding a website is a disclosure under the list, editing is a disclosure inside the detail card, and installation is a long block at the bottom of the same column. | `WebsitesPage.tsx`, `IntegrationSnippet.tsx` | FR-024 |
| F-05 | M | Health is only visible per website after selecting it. There is no at-a-glance view of what needs attention across the scope. | `OperationalStatus.tsx` | FR-024 |

### Scope and context

| ID | Sev | Finding | Evidence | Resolved by |
|---|---|---|---|---|
| F-06 | H | Project selection is repeated in three places (Projects "Select project", Overview filter, Websites "Browsing project"), and the current project is not visible in the shell. | `ProjectsPage.tsx`, `WebsiteSelector.tsx`, `WebsitesPage.tsx` | FR-007, FR-008 |
| F-07 | M | With no project, Overview says "Choose a project to view analytics" but offers no way to create one. | `AnalyticsPage.tsx` | FR-009 |
| F-08 | M | Deleted projects stay in the list with every action disabled, which adds noise without value. | `ProjectsPage.tsx` | FR-024 (Projects destination decides) |
| F-09 | L | "Local workspace" is a jargon pill that needs a popover to explain; "Private by design" repeats the same reassurance in the sidebar. | `WorkspaceContextHelp.tsx`, `App.tsx` | FR-010 |

### Dashboard information design

| ID | Sev | Finding | Evidence | Resolved by |
|---|---|---|---|---|
| F-10 | H | Eleven cards of similar weight in one grid, with no hierarchy or grouping. Only two headline numbers, and neither has a comparison to a previous period. | `AnalyticsPage.tsx` | FR-011, FR-012 |
| F-11 | M | Ranked tables show a "Rank" column that adds nothing, a generic "Value" header, and no share of total. Countries are labelled "Views" while other places are ambiguous about what is counted. | `RankedTable.tsx` | FR-013 |
| F-12 | M | Only the top ten of each ranking is available, with the remainder collapsed to "Other". | `d1-repositories.ts` (`ranked`), `RankedTable.tsx` | FR-013, FR-020 |
| F-13 | M | "Top user agents" is jargon and overlaps with Browsers and Operating systems. | `AnalyticsPage.tsx` | FR-014 |
| F-14 | M | Pie/donut charts are used for up to twelve categories, which are hard to compare and depend on color to decode. | `DistributionChart.tsx` | FR-015 |
| F-15 | M | Every filter change blanks the whole dashboard and replaces it with "Loading…", so layout jumps. An error in one call replaces the whole page. | `AnalyticsPage.tsx` | FR-016 |
| F-16 | L | A "principles" panel ("Bounded aggregates", "Private unique counts") takes prime space and is not actionable, and the H1 "Understand what's happening." is a slogan rather than a page title. | `AnalyticsPage.tsx` | FR-010 |
| F-17 | M | There is no first-run state for a website that exists but has received nothing. | `AnalyticsPage.tsx` | FR-017 |

### Geography

| ID | Sev | Finding | Evidence | Resolved by |
|---|---|---|---|---|
| F-18 | H | Countries are shown as raw two-letter codes, and the values `T1` (Tor) and `Unknown` are unexplained. | `classifier.ts` (`countryFor`), `RankedTable.tsx` | FR-018, FR-019 |
| F-19 | H | No map, no continent view, and no complete country list. | `AnalyticsPage.tsx` | FR-020, FR-021 |
| F-20 | M | Nothing beyond country is available (no language or region), and it is not documented why or whether that is deliberate. | `classifier.ts` | FR-025, FR-026 |

### Deferred from this pass

| ID | Finding | Why deferred |
|---|---|---|
| D-01 | Click a value to filter the rest of the view (cross-filtering). | Aggregates are per dimension (`dashboard_minute_dimensions` holds one kind and label per row), so this needs new data and a re-identification review. |
| D-02 | Unique users by country. | Visitor aggregates have no country breakdown. |
| D-03 | Localized country names. | English only for now. |
| D-04 | Real-time view, saved views, exports, scheduled reports. | Outside the organization and geography scope. |

## 3. Benchmark notes (to verify hands-on)

Patterns recalled from public products. Treat them as inspiration only.

| Tool | Pattern worth borrowing | Relevance |
|---|---|---|
| Plausible | One dense page: headline metrics with period comparison on top, then paired cards; a location card toggles between Map and Countries. | Overview hierarchy, Geography |
| Matomo | Reports are a separate area from a gear-icon admin area, and the Locations report has a map plus a table. | View/manage seam, Geography |
| Google Analytics 4 | A Reports area is separate from an Admin area; demographic details pair a table with a map. | View/manage seam |
| Umami | A compact top navigation of report pages, with website settings behind a separate gear. | Focused views, Manage area |
| Fathom, Simple Analytics | Minimal single-page dashboards that put the headline number and a comparison first. | Overview |
| PostHog | Project settings live apart from insights; a persistent project switcher is in the shell. | Scope control |
| Cloudflare Web Analytics | A simple country table alongside other rankings. | Country baseline |

**Takeaways**: (1) separate reports from settings at the top level; (2) a persistent scope switcher
in the shell; (3) headline metrics with a comparison, then focused views; (4) pair every
geography map with a table.

## 4. Proposed information architecture

```text
Shell:  [Logo]  [ Project ▾ › Website ▾ ]  [ Time range ▾ ]      [Help] [Theme]

Analytics (view)                      Manage (operate / administer)
  Overview                              Projects
  Pages                                 Websites
  Sources                               Installation
  Geography                             Health
  Technology
  Traffic quality
```

## 5. Capability matrix (draft)

`V` = view, `O` = operate, `A` = administer. This is the basis for later role work.

| Capability | Class | Area | Today |
|---|---|---|---|
| See analytics for a project or website | V | Analytics | Overview |
| See geography, sources, technology, traffic quality | V | Analytics | Overview (partly) |
| See website health and reachability | V | Manage > Health | Websites |
| View installation guidance | V | Manage > Installation | Websites |
| Add or edit a website | O | Manage > Websites | Websites |
| Disable or enable a website | O | Manage > Websites | Websites |
| Create a project | O | Manage > Projects | Projects |
| Delete a website | A | Manage > Websites (danger zone) | Websites |
| Delete a project | A | Manage > Projects (danger zone) | Projects |
| Change theme | V (personal preference) | Shell | Topbar |

Open question for the RBAC spec: whether "view installation guidance" and "view health" belong
with analysts or operators. The layout keeps them in Manage so either answer is a policy change,
not a redesign.

## 6. Data note for Geography

The classifier keeps the country code from the edge request, `T1` for Tor, and "Unknown"
otherwise (`classifier.ts`), and dimension aggregates are stored per country code. Full names,
continents, the map, and the table are therefore presentation and reporting work. The one
possible backend change is the top-ten limit on country rankings (`ranked` in
`d1-repositories.ts`), which would need to return all countries within the bounded-aggregate rule.

## 7. Resolution (after implementation)

| ID | Status | Where |
|---|---|---|
| F-01 | Resolved | Analytics and Manage are separate route trees; `area-separation.test.tsx` and the e2e suite assert no state-changing control or request in Analytics |
| F-02 | Resolved | Two labelled groups in `AreaNav` |
| F-03 | Resolved | `DangerZone` and in-console `ConfirmDialog`; project delete needs the typed name |
| F-04 | Resolved | Manage split into Projects, Websites, Installation, Health; add-website form is a visible panel |
| F-05 | Resolved | Manage > Health lists every website in scope with a next step |
| F-06 | Resolved | One scope control in the shell; scope and range are restored after reload |
| F-07 | Resolved | `NoProject` with a "Create a project" link on every scope-bound screen |
| F-08 | Resolved | Deleted projects sit in a collapsed "Deleted projects" list on Manage > Projects |
| F-09 | Resolved | The privacy note moved into the single help popover; the sidebar note is gone |
| F-10 | Resolved | Overview leads with two headline metrics with previous-period change; content split across focused views |
| F-11 | Resolved | `RankedList`: no rank column, named count column, share of total |
| F-12 | Resolved | Worker limits raised (300 countries, 100 for others); "Show all" and links to full lists |
| F-13 | Resolved | "Top user agents" is now "Browser versions" on Technology |
| F-14 | Resolved | `DistributionBars` with a table view replaces pie charts |
| F-15 | Resolved | `AnalyticsView` keeps the heading and shows placeholders; errors have a retry (see QA report for the one-request limitation) |
| F-16 | Resolved | The "principles" panel is removed and the H1 is now the page name |
| F-17 | Resolved | A "No page views yet" notice links to Installation and Health |
| F-18 | Resolved | Full names everywhere; `T1` is "Tor network"; unknown is "Unknown location" |
| F-19 | Resolved | Geography view: map, complete table, continent totals |
| F-20 | Resolved (documented) | `docs/privacy/audience-attributes-review.md` |
| D-01 to D-04 | Still deferred | See section 2 |

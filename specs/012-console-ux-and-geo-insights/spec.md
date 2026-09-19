# Feature Specification: Console UX Review, View/Manage Separation, and Geography Insights

**Feature Branch**: `012-console-ux-and-geo-insights`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "We have updated the README; merge it into this new spec and add more. We are back on console improvement. Take a first stab at a full review of the UI from a usability perspective and an information-organization perspective. There are many problems in how the console is organized and in the separation between viewing and managing (in one of the next specs we will start to support RBAC, mainly separating analysts, operators, and admins). Review samples from other web analytics tools for inspiration. One additional ask: more information on the geography/demographics of users. Show full country names and not just codes, and let users visualize all of this."

**Companion artifact**: [ux-review.md](./ux-review.md) is the first-pass usability and information-organization review of the current console, with the benchmark notes and the proposed view/manage capability matrix. This spec turns its findings into requirements; every finding is either covered by a requirement below or explicitly deferred.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Analyze Without Managing (Priority: P1)

As an analyst, I can open a clearly labelled Analytics area that only shows information. Nothing
in it can create, change, disable, or delete a project or website. Everything that changes the
system lives in a separate Manage area. The split is clean enough that a later release can grant
or deny each area independently by role.

**Why this priority**: Today viewing and managing are interleaved (for example, Delete sits beside
the Analytics shortcut on each project card, and the Websites page mixes status, snippets, editing,
and deletion). Separating them is the most important structural fix and the prerequisite for
role-based access in the next specification.

**Independent Test**: Walk every screen in the Analytics area and confirm it contains no control
that changes state. Walk every screen in the Manage area and confirm it contains no analytics
reporting beyond setup and health information. Confirm each destination and action appears in the
capability matrix under exactly one area.

**Acceptance Scenarios**:

1. **Given** the console opens, **When** the operator looks at the primary navigation, **Then** it
   shows two labelled groups, Analytics and Manage, each listing only its own destinations.
2. **Given** any screen in the Analytics area, **When** it is inspected, **Then** it contains no
   control that creates, edits, enables, disables, or deletes a project, website, or configuration.
   Links that navigate to the Manage area are allowed and are visibly navigation, not actions.
3. **Given** any screen in the Manage area, **When** it is inspected, **Then** it presents setup,
   installation, health, and administration only, and points to the Analytics area for reporting.
4. **Given** a future rule that hides the Manage area from a role, **When** the Manage area is
   removed from navigation, **Then** the Analytics area remains fully usable and no Analytics screen
   depends on a Manage-only control.
5. **Given** the capability matrix, **When** it is reviewed, **Then** every console capability is
   classified as view, operate, or administer, and the classification matches the area in which
   the capability appears.

---

### User Story 2 - Always Know and Control My Scope (Priority: P1)

As any console user, I see in one consistent place which project and which website (or all
websites) I am looking at, and I change it from that one place on any screen.

**Why this priority**: Project selection is currently repeated as a separate picker on the
Projects page ("Select project"), the Overview filters, and the Websites page ("Browsing
project"), and the current project is not visible in the shell. This is the main source of
"which project am I in?" errors.

**Independent Test**: With two projects, one with two websites, change scope from three different
screens using only the shell scope control, and verify that every screen agrees on scope.

**Acceptance Scenarios**:

1. **Given** any screen after the console has connected, **When** it is displayed, **Then** the
   current project and website scope is visible in the shell without scrolling.
2. **Given** the operator changes scope in the shell, **When** they move between Analytics and
   Manage destinations, **Then** every scope-bound screen reflects the new scope and its heading
   names it.
3. **Given** a screen that is not scope-bound (for example, the project list), **When** it is
   displayed, **Then** it does not present a second, competing project picker.
4. **Given** the add-website flow, **When** it opens, **Then** it still requires an explicit
   project choice as its first field (unchanged from the project-first console).
5. **Given** the page is reloaded, **When** the console reconnects, **Then** the previous scope
   and time range are restored if they still exist, and otherwise fall back safely with a visible
   explanation.
6. **Given** no project exists, **When** the operator opens any Analytics destination, **Then**
   the screen explains that a project is needed and offers a direct path to create one.

---

### User Story 3 - See Where My Visitors Come From (Priority: P1)

As an analyst, I can see visitor geography by full country name, on a world map and in a complete
table, with continent-level totals, so I can understand where my audience is without decoding
country codes.

**Why this priority**: Countries are currently shown as two-letter codes (plus the unexplained
values `T1` and `Unknown`), limited to the top 10, with no visual. Geography is a core expectation
of a web analytics tool and is explicitly requested.

**Independent Test**: With traffic from at least 12 countries, plus Tor and unknown-location
traffic, open Geography and verify full names, the complete list, the map, the continent
summary, and the special-value labels, in both color themes and with keyboard only.

**Acceptance Scenarios**:

1. **Given** stored country codes such as `DE` or `US`, **When** they are displayed anywhere in
   the console, **Then** the full country name (for example, Germany, United States) is shown; the
   code may appear only as secondary text.
2. **Given** traffic that arrived through the Tor network or with no determinable location,
   **When** it is displayed, **Then** it is labelled "Tor network" and "Unknown location"; raw
   values such as `T1` or `XX` never appear.
3. **Given** traffic from more than ten countries, **When** the operator opens the Geography view,
   **Then** the table lists every country with traffic in the range (not only the top 10), with
   page views and share of total, sortable by name and by count.
4. **Given** the Geography view, **When** it loads, **Then** a world map shades each country by
   its share of the chosen measure, with a legend showing the scale, and countries with no traffic
   are visibly distinct from countries with little traffic.
5. **Given** a keyboard-only or screen-reader user, **When** they use the Geography view, **Then**
   they can reach the same information as the map through the table, and no information is
   conveyed by color alone.
6. **Given** the Geography view, **When** it loads, **Then** continent totals are shown so the
   operator can read regional distribution at a glance.
7. **Given** historical data that was recorded before this feature, **When** the Geography view
   is opened, **Then** it shows full names for that data too, without re-collection.
8. **Given** the map is displayed, **When** it renders, **Then** it makes no request to any
   third-party service and works when the console is used offline from the internet apart from
   the analytics backend.

---

### User Story 4 - Read the Dashboard at a Glance (Priority: P2)

As an analyst, I open Analytics and immediately see the headline numbers with how they changed,
and I can move to focused views (Pages, Sources, Geography, Technology, Traffic quality) instead
of scanning one long grid of eleven equal-weight cards.

**Why this priority**: The current Overview shows two totals and a trend followed by nine
similar cards, a decorative principles panel, and jargon such as "Top user agents". Better
information organization makes every existing metric faster to find and easier to read, and it
gives Geography a natural home.

**Independent Test**: A first-time tester answers five standard questions (busiest page, top
referrer, top country, share of mobile visitors, whether traffic is up or down versus the previous
period) using only the console, timing each answer.

**Acceptance Scenarios**:

1. **Given** the Overview, **When** it loads, **Then** page views and unique users appear first,
   each with the change versus the immediately preceding period of equal length and a trend, above
   the fold on a typical laptop screen.
2. **Given** the analytics navigation, **When** it is used, **Then** Pages, Sources, Geography,
   Technology (browsers, operating systems, devices), and Traffic quality (human, bot, unknown)
   are each reachable in one action from Overview.
3. **Given** any ranked list, **When** it is shown, **Then** each row shows the value, its count
   labelled with what is counted (for example, "Page views"), and its share of the total. There
   is no redundant rank-number column.
4. **Given** a ranked list with more than ten values, **When** the operator asks to see all,
   **Then** the complete bounded list is shown.
5. **Given** a distribution with many categories, **When** it is displayed, **Then** categories
   are directly comparable and every value is readable without relying on color, and a table
   view of the same data is available.
6. **Given** the range, scope, or filters change, **When** results reload, **Then** section
   headings and layout stay in place with loading placeholders, and no stale numbers are shown.
7. **Given** a failure affecting one section, **When** the page renders, **Then** the failure
   is shown in that section with a retry, and the other sections stay usable.
8. **Given** a website that is registered but has received no events, **When** the operator
   views its analytics, **Then** a first-run state says it is waiting for the first event and links
   to installation and verification in the Manage area.

---

### User Story 5 - Manage Safely and Clearly (Priority: P2)

As an operator, I manage projects, websites, installation, and health from a Manage area that is
organized by task, and I cannot delete something by accident.

**Why this priority**: The Websites page currently stacks a project picker, list, disclosure-based
add and edit forms, status, reachability, a long installation section, and Disable/Delete buttons
in one page, and deletion uses browser-native confirmation. Tasks are hard to find and destructive
actions look like routine ones.

**Independent Test**: A tester completes create project, add website, install snippet, verify
health, disable website, and delete website, and the tester is observed for wrong-target or
accidental destructive actions.

**Acceptance Scenarios**:

1. **Given** the Manage area, **When** it is opened, **Then** it separates Projects, Websites,
   Installation, and Health into distinct task-oriented destinations or clearly delimited
   sections.
2. **Given** a website or project, **When** the operator wants to delete or disable it, **Then**
   the action is in a visually distinct danger zone, separated from editing, and never adjacent
   to a routine action with equal visual weight.
3. **Given** a destructive action, **When** it is started, **Then** an in-console confirmation
   names the target, states the consequence (including the retention and removal timing already
   documented), and requires a deliberate confirming action; it is fully keyboard operable and
   replaces native browser dialogs.
4. **Given** the Manage area, **When** a website's health is unknown or degraded, **Then** the
   Health destination shows the collection, aggregation, configuration, and data-access status
   for each website of the current scope in one place, with the next recommended step.
5. **Given** the installation guidance, **When** it is opened, **Then** it is presented as an
   ordered, step-by-step task separate from editing website details.

---

### User Story 6 - Explore Richer Audience Attributes (Priority: P3)

As an analyst, I can learn more about my audience than country alone, but only with attributes
that are privacy-reviewed and approved for collection.

**Why this priority**: The request mentions "geo/demographic" information. Country and continent
derived from data already collected are covered by User Story 3. Anything that needs new data
collection, or that describes people rather than places, must pass the project's privacy review
first, so it is separated and optional.

**Independent Test**: For each candidate attribute, a documented privacy review exists; for each
approved attribute, a tester can see it in the console as an aggregate; for each rejected
attribute, the documented rationale is present and nothing is collected.

**Acceptance Scenarios**:

1. **Given** each candidate attribute (see FR-025), **When** the review is completed, **Then** a
   recorded decision states its purpose, retention, access boundary, and approve or reject.
2. **Given** an approved attribute, **When** it is displayed, **Then** it appears only as a
   bounded aggregate, never as visitor-level data, and follows the same full-name and
   visualization rules as countries.
3. **Given** demographic attributes about people (such as age or gender), **When** they are
   considered, **Then** they are not collected, and the documentation says why.

---

### Edge Cases

- A country code that is valid but missing from the name list (newly assigned or reserved): the
  console shows the code labelled as unrecognized and never fails to render.
- Traffic from disputed or dependent territories: shown under their standard recognized name; the
  map places it on the nearest recognized region without dropping the count from totals.
- Very small countries and territories that are too small to see on a map: still present in the
  table and continent totals.
- A range containing only one country, or no traffic: the map and table show a clear single-value
  or empty state, not a blank frame.
- Data recorded before geography was expanded, with incomplete availability: the existing
  incomplete-range notice still applies.
- The operator's scope becomes invalid (project deleted elsewhere): the shell control shows the
  fallback and states what changed.
- A website is disabled: it stays selectable in Analytics for history, labelled as disabled, and
  is not offered anywhere that would imply it collects data.
- A narrow screen or 200% zoom: navigation groups, the scope control, and the map alternative
  remain usable without horizontal page scrolling.
- The local workspace connection drops while viewing: sections show their own error and retry, and
  the shell keeps its scope visible.

## Requirements *(mandatory)*

### Functional Requirements

**View and manage separation**

- **FR-001**: The console MUST present two clearly labelled areas, Analytics (viewing only) and
  Manage (configuration and administration), and every destination MUST belong to exactly one.
- **FR-002**: The project MUST maintain a capability matrix that classifies every console
  capability as view, operate, or administer, and each capability's placement MUST match its
  classification.
- **FR-003**: No Analytics screen MAY contain a control that creates, edits, enables, disables, or
  deletes a project, website, or configuration. Navigation links into Manage are permitted.
- **FR-004**: Manage screens MUST NOT present analytics reporting beyond setup and health
  information, and MUST link to the Analytics area for reporting.
- **FR-005**: The separation MUST be structural (distinct destinations and distinct
  responsibilities), so that a later access-control feature can allow or deny an area without
  redesigning screens. This feature MUST NOT introduce roles, accounts, or new authorization.
- **FR-006**: Destructive actions (delete project, delete website, disable website) MUST be
  placed in a distinct danger zone, separated from routine editing, and MUST use an in-console
  confirmation that names the target and states the consequence and removal timing. Native browser
  dialogs MUST NOT be used for these confirmations.

**Scope and navigation**

- **FR-007**: The shell MUST show the current project and website scope on every scope-bound
  screen, and it MUST be the single place to change it. Other screens MUST NOT present competing
  project pickers, except that the add-website flow MUST still require an explicit project choice
  as its first field.
- **FR-008**: The scope and time range MUST persist across destination changes and be restored
  after reload when still valid, with a visible explanation when a fallback is applied.
- **FR-009**: When no project exists, every Analytics destination MUST explain what is needed and
  offer a direct path to create a project.
- **FR-010**: The console's decorative or non-actionable panels (such as the "principles" panel on
  Overview) MUST be removed from working screens; privacy and local-workspace explanations MUST live
  in a single help location.

**Analytics organization**

- **FR-011**: Overview MUST lead with page views and unique users, each with a comparison to the
  immediately preceding period of equal length and a trend, visible without scrolling on a typical
  laptop viewport.
- **FR-012**: Analytics MUST provide focused views for Pages, Sources, Geography, Technology
  (browsers, operating systems, devices), and Traffic quality, each reachable in one action from
  Overview.
- **FR-013**: Every ranked list MUST show value, count (labelled with what is counted), and share
  of total, MUST NOT show a redundant rank column, and MUST offer the complete bounded list beyond
  the top ten.
- **FR-014**: Technical labels MUST be replaced with plain language (for example, "Top user
  agents" MUST be replaced by browser and device wording), and overlap between the browser and
  user-agent views MUST be resolved.
- **FR-015**: Every distribution MUST be readable without color alone and MUST offer a table view
  of the same data.
- **FR-016**: Reloading MUST preserve layout with placeholders, MUST NOT show stale numbers, and
  MUST isolate failures to the affected section with a retry.
- **FR-017**: A registered website with no events MUST show a first-run state that links to
  installation and verification.

**Geography**

- **FR-018**: Everywhere a country is shown, the console MUST show its full name; the code MAY
  appear only as secondary text. `T1` MUST display as "Tor network" and unknown or `XX` values as
  "Unknown location".
- **FR-019**: Full names MUST be produced for all existing stored data without re-collection or
  data migration, and an unrecognized code MUST render safely with an "unrecognized" label.
- **FR-020**: A Geography view MUST show a world map shaded by share of page views with a legend,
  and a table of all countries with traffic (name, page views, share), sortable by name and count.
- **FR-021**: The Geography view MUST provide continent totals.
- **FR-022**: The map MUST have a complete non-visual equivalent, MUST NOT rely on color alone,
  MUST be keyboard reachable, and MUST NOT request any third-party service.
- **FR-023**: Geography MUST respect the current scope and time range and MUST use bounded
  aggregates only.

**Manage organization**

- **FR-024**: Manage MUST separate Projects, Websites, Installation, and Health into
  task-oriented destinations or clearly delimited sections, and Health MUST show each website's
  collection, aggregation, configuration, and data-access status with a recommended next step.
- **FR-025**: Before any new audience attribute is collected, a documented privacy review MUST
  decide on each candidate: browser language, region or state within a country, and any other
  place- or device-derived attribute. This feature delivers country and continent only; the
  review outcome for the others is recorded and nothing new is collected.
- **FR-026**: Demographic attributes about people (for example age or gender) MUST NOT be
  collected, and the documentation MUST state why.

**Documentation and quality**

- **FR-027**: README, documentation, and machine-readable project descriptions MUST reflect the
  new console organization and geography. This includes carrying the updated README (architecture
  diagram and quick start) already prepared on the documentation branch.
- **FR-028**: All changed console screens MUST conform to WCAG 2.2 Level AA, work responsively down
  to phone width and at 200% zoom, and be covered by extended automated and manual accessibility
  checks.
- **FR-029**: Every finding in the companion UX review MUST be mapped to a requirement or an
  explicitly recorded deferral.

### Key Entities *(include if feature involves data)*

- **Console Area**: A top-level grouping of destinations, either Analytics (view) or Manage
  (operate and administer). Each destination belongs to exactly one.
- **Capability**: A single thing a console user can see or do, classified as view, operate, or
  administer. The set of capabilities forms the capability matrix that later role work builds on.
- **Scope**: The current project and website (or all websites) plus the time range that bound
  what every scope-bound screen shows.
- **Country Aggregate**: Page views for a country in a scope and range, identified by its stored
  code and displayed by full name, with its continent and share of total.
- **Special Location**: A non-country value: Tor network or unknown location.
- **Metric Comparison**: A current-period value paired with the preceding equal-length period and
  the change between them.
- **Review Finding**: A recorded usability or information-organization problem with severity,
  evidence, and either the requirement that resolves it or a deferral.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of console destinations and actions appear in the capability matrix, and an
  automated check finds zero state-changing controls in the Analytics area.
- **SC-002**: A tester can read and change the current project and website from any scope-bound
  screen in at most two actions, and no screen shows more than one scope control (the add-website
  flow excepted).
- **SC-003**: For all country codes present in test data, 100% are shown as full names, and no
  raw two-letter code, `T1`, or `XX` appears as a label.
- **SC-004**: At least 90% of first-time testers (minimum of five) identify the top country and
  the busiest continent within 10 seconds of opening Geography.
- **SC-005**: With traffic from 25 countries, the Geography view lists all 25, not 10.
- **SC-006**: Page views and unique users, each with previous-period comparison, are visible
  without scrolling at 1280×800.
- **SC-007**: At least 90% of first-time testers answer the five standard questions (busiest
  page, top referrer, top country, mobile share, up or down versus previous period) correctly
  and without assistance, each within 30 seconds.
- **SC-008**: In moderated sessions, zero testers delete or disable the wrong project or website,
  and every destructive action requires a named-target confirmation.
- **SC-009**: Opening Overview or Geography causes zero requests to origins outside the local
  console and the configured analytics backend.
- **SC-010**: All changed screens pass automated accessibility checks with zero serious or
  critical violations, and a keyboard-only tester completes the Geography and Manage tasks.
- **SC-011**: Every finding in the companion review is closed by a requirement or a recorded
  deferral before release.

## Assumptions

- Scope decision (chosen by default while the owner was away, to be confirmed at pre-release
  testing): this feature delivers country and continent only. Browser language and region/state
  are documented in a privacy review as candidates, and no new data is collected.
- Role-based access control is a separate, later specification. This feature only shapes the
  console so that the Analytics and Manage areas can be allowed or denied independently. It adds
  no accounts, roles, or permission checks.
- Country data already exists: the ingestion path records a country code (or Tor or unknown
  markers) per aggregate, so full names, continents, the map, and the complete list can be delivered
  as presentation and reporting changes without new collection. Complete-list reporting may
  require raising the current top-ten limit on country aggregates within the bounded-aggregate
  rule.
- Full names are shown in English. Localization of names to the viewer's language is out of scope.
- Geography measures page views. Unique users by country is out of scope because unique-visitor
  aggregates are not currently broken down by country.
- Cross-filtering (for example choosing a country to see its pages or browsers) is out of scope:
  aggregates are stored per dimension, and cross-dimension breakdowns would need new data and a
  re-identification review. It is recorded as a candidate for a later specification.
- Country-level counts are coarse enough that no small-count suppression is needed. Any finer
  location (region or city) would need that decision in its privacy review.
- Demographic attributes about people (age, gender, interests) are out of scope by the
  privacy-minimal principle and are not collected.
- The companion review's benchmark notes come from familiarity with public products (for example
  Plausible, Umami, Matomo, Fathom, Google Analytics 4, PostHog) and are to be re-verified hands-on
  during planning. They are inspiration, not a specification to copy.
- The README changes on the documentation branch (architecture diagram and quick start) are
  brought into this feature's branch as its starting point and are updated further per FR-027.
- Existing behavior stays: the project-first setup, the static and dynamic installation choices,
  the theme setting, the footer, and the local-workspace explanation. Only their placement may
  change.

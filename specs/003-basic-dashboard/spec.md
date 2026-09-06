# Feature Specification: Basic Analytics Dashboard

**Feature Branch**: `003-basic-dashboard`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Build a very basic dashboard, something like Google Analytics, that shows the number of users and page views."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View website totals (Priority: P1)

An authorized operator opens a basic dashboard for one configured website and immediately sees its
unique-user count and page-view count for a recent date range.

**Why this priority**: Two trustworthy top-level metrics demonstrate Vizoalica's value without a
complex reporting product.

**Independent Test**: Record activity for two sources, open one source dashboard, and confirm its
two totals match only that source's accepted events.

**Acceptance Scenarios**:

1. **Given** an authorized operator and a source with accepted activity, **When** the operator
   opens its dashboard, **Then** the dashboard shows unique users and page views for the last seven
   complete calendar days plus today.
2. **Given** two projects or sources with different activity, **When** an operator selects one
   source, **Then** the dashboard excludes the other source's totals.
3. **Given** a configured source with no accepted activity, **When** its dashboard opens, **Then**
   both metrics show zero and the page remains understandable.
4. **Given** an unauthenticated request, **When** it requests dashboard data or the dashboard
   page, **Then** it receives no dashboard or analytics data.

---

### User Story 2 - Change the reporting period (Priority: P2)

An authorized operator selects one supported reporting period and sees both metrics update for the
same source and period.

**Why this priority**: A short comparison range is necessary to make the basic totals useful while
keeping the first dashboard bounded and inexpensive.

**Independent Test**: Record activity across more than one date, select each supported range, and
confirm the displayed totals change only according to the selected period.

**Acceptance Scenarios**:

1. **Given** an open source dashboard, **When** the operator selects today, seven days, or 30
   days, **Then** both displayed metrics use that one inclusive period.
2. **Given** an unsupported, malformed, or oversized period request, **When** it is submitted,
   **Then** the system rejects it without an unbounded analytics query.

### Edge Cases

- A source is disabled after it has historic aggregate activity.
- A date range spans a calendar boundary or contains days with no activity.
- Delayed accepted events arrive after a dashboard period has been viewed.
- A unique visitor generates multiple page views during the selected period.
- A metric query cannot access its aggregate data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a minimal browser-rendered dashboard accessible only with
  the existing administrator credential.
- **FR-002**: The dashboard MUST require the operator to choose one configured project and one of
  its sources before returning metrics.
- **FR-003**: The dashboard MUST display the selected source's unique-user total and page-view
  total prominently, including the applied inclusive date range.
- **FR-004**: The system MUST support only today, last seven days, and last 30 days in this
  release, and MUST reject any other range before an analytics query runs.
- **FR-005**: The system MUST scope every dashboard query to a source that belongs to the selected
  project and MUST not disclose another project's configuration or aggregates.
- **FR-006**: The system MUST calculate page views from accepted aggregate activity only.
- **FR-007**: The system MUST calculate unique users from anonymous visitor activity without
  returning visitor identifiers, sessions, raw events, or raw event payloads to the browser.
- **FR-008**: Dashboard results and errors MUST not expose credentials, raw event bodies, raw URL
  query values, visitor identifiers, session identifiers, or other project's data.
- **FR-009**: The dashboard MUST show a clear zero-data state and a safe unavailable-data state.
- **FR-010**: The dashboard MUST document its definitions of users, page views, ranges, access,
  and known data limitations.

### Key Entities

- **Dashboard Selection**: A project, source, and supported reporting period selected by an
  authorized operator.
- **Dashboard Summary**: Source-scoped aggregate unique-user and page-view totals with their
  inclusive date range and availability state.
- **Unique User**: A distinct anonymous visitor seen in accepted activity during one selected
  reporting period; it is never returned as an identifier.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized operator can select a source and view both metrics in under 30 seconds.
- **SC-002**: The dashboard returns a supported period's two totals in under five seconds for a
  source with up to 100,000 retained aggregate records.
- **SC-003**: In source-isolation tests, 100% of displayed totals belong only to the selected
  project and source.
- **SC-004**: Dashboard responses and rendered content expose zero visitor, session, credential,
  raw-event, or raw-query values.

## Assumptions

- The existing administrator credential protects the initial dashboard; no user accounts or roles
  are introduced.
- Unique users means distinct anonymous visitors across the selected period, represented only by a
  privacy-reviewed bounded aggregate and never by identifiers in dashboard output.
- This release excludes charts, acquisition data, geography, event breakdowns, exports, comparison
  periods, alerts, and custom date ranges.

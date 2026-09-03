# Feature Specification: Secure Admin and MCP Access

**Feature Branch**: `002-admin-mcp-access`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "Add a minimal, secure administrative capability to configure Vizoalica, create multiple websites and assign Vizoalica IDs, plus an MCP capability to query basic analytics such as page-view counts."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure an analytics website (Priority: P1)

An authorized operator creates an analytics project and an active website source without using a
graphical interface. The system returns the project identifier, source identifier, and public
source key that the operator needs to configure the website integration.

**Why this priority**: A real website cannot send correctly isolated analytics events until an
operator can create and control its configuration.

**Independent Test**: An operator can create two projects with one source each, receive distinct
identifiers, and confirm that each source belongs only to its requested project.

**Acceptance Scenarios**:

1. **Given** a valid administrator credential, **When** an operator creates a project with a
   website name and retention policy, **Then** the system creates a unique project identifier and
   returns it without exposing administrative credentials.
2. **Given** a valid administrator credential and an existing project, **When** an operator adds
   a source with one or more exact allowed website origins, **Then** the system creates a unique
   source identifier and public source key scoped to that project.
3. **Given** an invalid, missing, or revoked administrator credential, **When** a caller attempts
   any administrative operation, **Then** no configuration is created or changed and no sensitive
   configuration details are returned.
4. **Given** an existing source, **When** an operator disables it, **Then** subsequent ingestion
   requests for that source are rejected while other projects continue to operate.

---

### User Story 2 - Inspect basic analytics through MCP (Priority: P2)

An authorized analytics client uses a read-only MCP capability to list accessible websites and ask
for page-view totals for one website and a bounded date range.

**Why this priority**: This demonstrates the value of Vizoalica without a dashboard or exposing
raw visitor activity.

**Independent Test**: After recording page views for two sources, an authorized client retrieves
the requested source's total and receives no raw events or counts from the other source.

**Acceptance Scenarios**:

1. **Given** a valid administrator credential and recorded aggregate data, **When** a client asks
   for page-view totals for one configured source in a permitted date range, **Then** it receives
   the total and path-level aggregate counts for only that source.
2. **Given** a valid administrator credential, **When** a client lists configured websites,
   **Then** it receives project and source identifiers, names, allowed origins, and source status,
   but no secrets, tokens, visitor identifiers, sessions, or raw events.
3. **Given** an unauthenticated caller, **When** it invokes an MCP capability, **Then** it receives
   an authorization failure and no analytics or configuration data.
4. **Given** a request outside the permitted date range, **When** a client asks for totals, **Then**
   the system rejects it without performing an unbounded analytics query.

---

### User Story 3 - Audit administrative access (Priority: P3)

An operator can determine which successful or denied administrative and MCP operations occurred
without retaining secrets or visitor data in the audit record.

**Why this priority**: Minimal administration must still be accountable, especially because a
single credential controls all configured websites in this MVP.

**Independent Test**: A successful configuration change and a denied read attempt produce
separate audit records containing an operation outcome and no credential value or raw analytics
payload.

**Acceptance Scenarios**:

1. **Given** an administrative or MCP request, **When** it completes or is denied, **Then** the
   system records the operation category, outcome, time, and affected project/source when known.
2. **Given** an audit record, **When** an operator inspects it, **Then** it contains no bearer
   credential, token claim, visitor identifier, session identifier, raw URL query, or event body.

### Edge Cases

- A project name, source key, or allowed origin duplicates an existing configuration.
- An allowed origin is malformed, uses a wildcard, includes a path, or differs only by an omitted
  scheme or port.
- A request attempts to create a source for a project that does not exist or is disabled.
- A page-view query names a source from another project, has an invalid date, or exceeds the
  maximum date span.
- A credential is rotated while a request is in progress.
- Aggregate data has not yet been recorded for the requested source or date range.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide non-UI administrative operations to create and list
  analytics projects.
- **FR-002**: The system MUST provide non-UI administrative operations to create, list, and
  disable website sources within a project.
- **FR-003**: Each project and source MUST receive a system-generated stable identifier; each
  source MUST receive a distinct public source key that is not treated as a secret.
- **FR-004**: Source creation MUST require at least one exact allowed browser origin and MUST
  reject wildcard origins, path-bearing values, malformed origins, and duplicate public source
  keys.
- **FR-005**: The system MUST require a valid administrator credential for every administrative
  operation and every MCP capability invocation, and MUST fail closed when the credential is
  absent, invalid, revoked, or unavailable.
- **FR-006**: The administrator credential MUST be configured and rotated only through an
  operator-controlled secret mechanism; it MUST never be returned, stored in audit records, or
  accepted from a website integration.
- **FR-007**: The system MUST enforce a bounded, conservative quota and retention policy for each
  newly created source unless an authorized operator explicitly supplies stricter values.
- **FR-008**: The MCP capability MUST be read-only and MUST offer only a fixed, documented set of
  analytics and configuration queries; it MUST not accept arbitrary database queries, write
  operations, or raw event retrieval.
- **FR-009**: The MCP capability MUST support listing authorized projects and sources and querying
  page-view totals by one source and a bounded date range, including aggregate counts by page path.
- **FR-010**: Analytics query results MUST be scoped to the requested configured source and MUST
  include only aggregate counts, source metadata, and date/path grouping fields needed to answer
  the request.
- **FR-011**: The system MUST reject an analytics query whose date range exceeds 31 calendar days,
  has invalid boundaries, or requests a source that does not belong to the specified project.
- **FR-012**: The system MUST record safe audit entries for successful and denied administrative
  and MCP operations without storing credentials, raw event payloads, visitor identifiers,
  session identifiers, or raw URL query values.
- **FR-013**: The system MUST preserve project and source isolation: configuration changes and
  analytics queries for one project MUST not disclose or alter another project's data.
- **FR-014**: The system MUST document credential setup, rotation, revocation, source
  configuration, MCP connection, supported queries, authorization failures, and cost limits.

### Key Entities *(include if feature involves data)*

- **Administrator Credential**: An operator-controlled secret authorizing the minimal
  administration and read-only MCP capabilities; it has no browser use.
- **Project**: An isolated analytics property with a generated identifier, a name, and a default
  quota/retention policy.
- **Website Source**: A configured website within one project, with a generated identifier, a
  public source key, exact allowed origins, status, and applicable limits.
- **Aggregate Page-View Result**: A bounded summary of page-view counts grouped by date and page
  path for one source; it contains no raw events or visitor context.
- **Administrative Audit Entry**: A privacy-safe record of an administrative or MCP operation,
  its outcome, time, and affected configuration scope when known.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized operator can create a project and source and obtain all required
  website configuration identifiers in under two minutes.
- **SC-002**: An authorized client can retrieve a source's page-view total for a seven-day period
  in under five seconds for a project with up to 100,000 retained daily aggregate records.
- **SC-003**: 100% of administrative and MCP requests lacking a valid administrator credential are
  denied without returning analytics, configuration, or secret data.
- **SC-004**: In an isolation test with two projects, 100% of source configuration and aggregate
  query results belong only to the requested project and source.
- **SC-005**: Audit samples for successful and denied operations contain zero credential values,
  visitor identifiers, session identifiers, raw event bodies, and raw query values.

## Assumptions

- The initial viable release has one operator-controlled administrator credential and no user
  accounts, roles, graphical administration interface, or per-user authorization model.
- The credential is stored in the deployment platform's secret facility and rotation replaces the
  prior credential immediately; multi-credential rotation grace periods are out of scope.
- Newly created test sources use low-cost defaults no less restrictive than 100 accepted events per
  day and seven days of raw-event retention.
- Existing ingestion rollups remain the source of aggregate page-view answers; this feature does
  not add raw-event search, exports, funnels, charts, session replay, or page text collection.
- MCP clients are trusted operator tools, but every request is authenticated and constrained as if
  it were hostile input.

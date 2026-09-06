# Feature Specification: Local Analytics Operations

**Feature Branch**: `004-local-analytics-operations`

**Created**: 2026-09-05

**Status**: Draft

**Input**: User description: "Keep website instrumentation and its R2 event delivery unchanged while moving administration, maintenance, and analytics into local clients operated from a remote personal machine. Provide both a local web application and a local MCP server backed by the same local operations API. Establish minimal infrastructure and cost as a core project principle."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect product analytics locally (Priority: P1)

An authorized project operator opens the local analytics workspace on their personal machine, selects a project and time range, and explores the aggregate activity derived from the events already collected for that project.

**Why this priority**: Viewing trusted analytics is the primary product value and must not require a continuously hosted analytics application.

**Independent Test**: With a project containing representative events, an operator can complete the standard analytics questions for a chosen time range from a local workspace without deploying an analytics service.

**Acceptance Scenarios**:

1. **Given** an operator has authorized access to a project with stored event data, **When** they select a time range and request an overview, **Then** they receive project-scoped aggregate results for that range.
2. **Given** the local workspace cannot reach the project data, **When** the operator requests analytics, **Then** it clearly reports the failure and does not present stale or partial results as current.

---

### User Story 2 - Maintain a project locally (Priority: P2)

An authorized operator uses the local workspace to review project configuration and operational health, then performs approved maintenance actions without a permanently hosted administrative console.

**Why this priority**: Operators need a safe, low-overhead way to keep collection and analytics usable after initial setup.

**Independent Test**: An operator can inspect the project's collection status and configuration, make a permitted maintenance change, and confirm the recorded result from the local workspace.

**Acceptance Scenarios**:

1. **Given** an operator is authorized for a project, **When** they review its operational status, **Then** they can distinguish collection, aggregation, and data-access issues.
2. **Given** a maintenance action is allowed for the project, **When** the operator performs it, **Then** the action is scoped to that project and produces an auditable outcome.

---

### User Story 3 - Control local access and credentials (Priority: P3)

An operator can configure and revoke the local workspace's access to a project while keeping administrative credentials out of websites and shared analytics links.

**Why this priority**: Local operation reduces hosted infrastructure only if it preserves strong access control and prevents accidental credential exposure.

**Independent Test**: An operator can authorize a local workspace, use it for permitted actions, revoke its access, and verify that subsequent actions are refused.

**Acceptance Scenarios**:

1. **Given** a local workspace has not been authorized, **When** it attempts to access a project, **Then** it receives no project data and cannot perform maintenance.
2. **Given** the operator revokes a local workspace's authorization, **When** that workspace next attempts an analytics or maintenance action, **Then** the action is denied.

---

### User Story 4 - Use the same operations through AI tools (Priority: P3)

An authorized operator uses an AI-capable tool to inspect analytics or perform an approved maintenance action, receiving the same project-scoped results and authorization protections available through the local web workspace.

**Why this priority**: AI-assisted workflows are useful for exploration and automation, but must not create a separate administrative surface with different data, permissions, or behavior.

**Independent Test**: For the same authorized operator and project, equivalent analytics and maintenance requests made through the web workspace and AI-capable tool yield equivalent scoped results and audit outcomes.

**Acceptance Scenarios**:

1. **Given** an operator is authorized for a project through the local workspace, **When** they use an AI-capable tool to request a supported analytics result, **Then** the result follows the same access boundaries and completeness labeling as the web workspace.
2. **Given** an AI-capable tool requests an approved maintenance action, **When** the request is authorized, **Then** it follows the same validation and audit requirements as the equivalent web-workspace action.

### Edge Cases

- The local workspace is offline, the remote data store is unavailable, or credentials have expired while the operator is working.
- A requested time range contains no events, incomplete aggregate data, or data whose processing is still in progress.
- An operator attempts an action for a project they are not authorized to access.
- A local machine is lost or compromised after it has been authorized for project access.
- A maintenance operation is interrupted after it begins; the operator must be able to determine whether it completed, failed, or requires safe retry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST preserve the existing website instrumentation contract and its event-delivery behavior while this feature is introduced.
- **FR-002**: The system MUST retain a backend collection and aggregation capability for accepted events, with raw-event storage remaining separate from configuration and quota metadata.
- **FR-003**: Authorized operators MUST be able to view project-scoped aggregate analytics from a locally operated workspace without deploying a continuously available hosted analytics interface.
- **FR-004**: The local workspace MUST let authorized operators select a project and time range and receive clearly labeled aggregate results, including an explicit indication when results are incomplete or unavailable.
- **FR-005**: The local workspace MUST let authorized operators inspect project configuration and operational status and perform approved project-scoped maintenance actions.
- **FR-006**: The system MUST authenticate and authorize every analytics and maintenance request, enforce tenant/project isolation, and prevent administrative credentials from being distributed with website instrumentation or shared client views.
- **FR-007**: The system MUST support credential revocation and ensure revoked local workspaces can no longer access project analytics or maintenance actions.
- **FR-008**: The system MUST create an audit record for administrative and maintenance actions that identifies the project, actor, action, outcome, and time.
- **FR-009**: The system MUST provide recoverable, understandable failure states for unavailable data, expired access, interrupted maintenance, and local workspace connectivity failures.
- **FR-010**: The operational design and documentation MUST demonstrate that the administration and analytics experience does not require a permanently running customer-facing control-plane service.
- **FR-011**: The project constitution MUST be amended before implementation to establish minimal required infrastructure and ongoing operational cost as governing design priorities, while retaining privacy, security, and abuse-resistance obligations.
- **FR-012**: The system MUST preserve an export or migration path for analytics data and configuration so local operation does not create vendor lock-in.
- **FR-013**: The locally operated control plane MUST provide two clients: a web application for direct human use and an MCP server for AI-assisted or automated use.
- **FR-014**: Both local clients MUST use the same local operations API server for analytics, administration, and maintenance capabilities; they MUST NOT implement separate business rules, authorization paths, or data-access behavior.
- **FR-015**: The shared local operations API server MUST be the only local component permitted to access remote project data and perform remote administrative or maintenance actions on behalf of either client.

### Key Entities

- **Local Workspace Authorization**: A revocable grant that permits one locally operated workspace to act for a defined operator and project scope.
- **Analytics Query**: A project-scoped request for aggregate activity over a selected time range, with a result freshness and completeness state.
- **Project Operational Status**: A summarized view of collection, aggregation, data availability, and configuration health for one project.
- **Maintenance Action**: An authorized, auditable, project-scoped operational change or repair attempt with a recorded outcome.
- **Audit Record**: The immutable account of an administrative or maintenance action, including its actor, scope, outcome, and time.
- **Local Operations API**: The shared local service that enforces the business rules, authorization, remote-data access, and audit behavior used by both local clients.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized operator can complete the primary analytics overview for a project and selected 30-day period in under 2 minutes from a newly opened local workspace.
- **SC-002**: In usability validation, at least 90% of authorized operators can distinguish complete results, processing-in-progress results, and unavailable results without assistance.
- **SC-003**: In authorization testing, 100% of cross-project, revoked-access, and unauthenticated analytics or maintenance attempts are denied.
- **SC-004**: Every completed or interrupted maintenance action has an operator-visible outcome and an audit record within 60 seconds of the action ending.
- **SC-005**: Operating the administration and analytics experience requires no continuously running customer-facing control-plane service beyond the backend collection and aggregation capabilities already required for event processing.
- **SC-006**: For a representative set of authorized analytics and maintenance operations, the web application and MCP client produce equivalent project scope, authorization decision, result state, and audit record in 100% of automated compatibility tests.

## Assumptions

- The existing browser instrumentation, event schema, ingestion endpoint, and R2-backed raw-event storage remain in scope as compatibility constraints rather than being redesigned by this feature.
- A project operator has a personal machine capable of running the local workspace and can establish an authenticated connection to project data when they need analytics or maintenance capabilities.
- The local web application and MCP server run on the operator's personal machine and communicate only with a shared local operations API server, which in turn communicates with the remote data plane.
- Initial scope targets a trusted single-operator or small-team workflow; simultaneous multi-user collaboration and a public hosted dashboard are out of scope.
- Aggregates may be eventually consistent; the workspace will communicate freshness and completeness rather than implying real-time accuracy.
- A constitution amendment will be prepared and ratified through the project governance workflow before implementation planning begins.

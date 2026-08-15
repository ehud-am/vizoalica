# Feature Specification: Event Collection Foundation

**Feature Branch**: `001-event-collection-foundation`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "For version 0.1.0, provide a simple script to embed in web pages that reports website activity, and a backend that captures these messages at high volume. If the backend is down, the website must continue operating. The system must be privacy-aware, avoid sensitive information, be security-oriented, resist fake data, avoid DDoS and cost manipulation, prefer open standards such as OAuth, be open source, AI-ready, minimal for the first version, and ready to expand later."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Embed analytics safely (Priority: P1)

As a website owner, I want to add one small analytics snippet to my site so Vizoalica can record basic product usage without risking my site's reliability.

**Why this priority**: Without safe embedding and collection, there is no usable product analytics foundation.

**Independent Test**: Add the snippet to a test website, trigger common user activity, then verify the website remains usable and collected activity appears in the receiving system.

**Acceptance Scenarios**:

1. **Given** a web page with the Vizoalica snippet installed, **When** a visitor loads the page, **Then** a page activity event is queued for reporting without blocking page rendering.
2. **Given** the Vizoalica receiving endpoint is unavailable, **When** a visitor uses the website, **Then** the website continues to operate normally and the analytics script does not surface an error to the visitor.
3. **Given** multiple activity events occur quickly, **When** the script reports them, **Then** events are batched or limited so normal website performance is preserved.

---

### User Story 2 - Receive high-volume activity safely (Priority: P1)

As a self-hosting operator, I want the backend to accept large volumes of analytics messages while protecting availability and operating cost.

**Why this priority**: The public ingestion endpoint is the highest-risk and highest-volume part of the first release.

**Independent Test**: Send a sustained mix of valid, invalid, oversized, duplicate, and excessive traffic to a test deployment and verify valid events are accepted while abusive traffic is bounded.

**Acceptance Scenarios**:

1. **Given** valid activity messages arrive within configured limits, **When** the backend receives them, **Then** it acknowledges receipt and stores or stages them for later analysis.
2. **Given** malformed, oversized, unauthorized, or excessive messages arrive, **When** the backend evaluates them, **Then** it rejects or drops them before expensive processing.
3. **Given** one project sends excessive traffic, **When** limits are exceeded, **Then** that project is throttled without degrading unrelated projects.

---

### User Story 3 - Protect privacy by default (Priority: P1)

As a privacy-conscious product owner, I want Vizoalica to collect useful product analytics without collecting sensitive information by default.

**Why this priority**: Privacy is a core differentiator and must be designed before schemas and ingestion behavior are fixed.

**Independent Test**: Generate activity from pages containing forms, query parameters, and user identifiers, then verify sensitive values are not accepted or stored unless explicitly allowed by safe configuration.

**Acceptance Scenarios**:

1. **Given** a page URL includes potentially sensitive query parameters, **When** activity is reported, **Then** sensitive parameter values are redacted or omitted.
2. **Given** a page contains form fields, **When** user activity is captured, **Then** field contents are not collected.
3. **Given** a customer configures custom event properties, **When** properties are sent, **Then** the backend validates them against size, type, and naming rules before accepting them.

---

### User Story 4 - Prepare for future analysis and AI (Priority: P2)

As a product team, I want collected events to follow clear names, schemas, and project boundaries so future dashboards, exports, and AI-assisted insights can be built on trustworthy data.

**Why this priority**: v0.1.0 should stay minimal but must not create a data foundation that blocks expansion.

**Independent Test**: Inspect stored activity from multiple projects and verify each event has consistent identity, time, source, consent, schema, and project context.

**Acceptance Scenarios**:

1. **Given** events from multiple websites, **When** they are collected, **Then** each event is associated with exactly one project and source configuration.
2. **Given** events are stored for future use, **When** they are inspected, **Then** they include enough structured context to support later reporting without relying on raw sensitive content.

---

### Edge Cases

- The analytics endpoint is unreachable, slow, returns errors, or is blocked by the browser.
- The browser is offline or closes before queued events are delivered.
- A malicious party copies a public website identifier and sends fabricated browser events.
- A project receives traffic far above its configured quota.
- A payload includes secrets, raw form values, emails, phone numbers, tokens, or sensitive URL parameters.
- A payload is syntactically valid but semantically invalid, duplicated, replayed, too old, or too far in the future.
- Multiple tenants/projects send traffic concurrently and one becomes abusive.
- A customer wants to use authenticated user identity but the visitor has not logged in yet.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide an embeddable website snippet that can be installed on ordinary web pages with minimal setup.
- **FR-002**: The snippet MUST report a minimal default set of website activity events, including page views and explicitly configured custom events.
- **FR-003**: The snippet MUST fail silently and non-blockingly when Vizoalica is unavailable, slow, misconfigured, or blocked.
- **FR-004**: The snippet MUST avoid collecting raw form input, passwords, payment data, secrets, page text, or other sensitive content by default.
- **FR-005**: The snippet MUST redact or omit common sensitive URL components, including known secret-like query parameters.
- **FR-006**: The backend MUST expose an ingestion path for receiving browser activity messages from configured websites.
- **FR-007**: The backend MUST validate every received message against a strict schema before accepting it.
- **FR-008**: The backend MUST enforce maximum request size, event count, event age, field length, field count, and supported data type limits before persistence or expensive processing.
- **FR-009**: The backend MUST associate every accepted event with exactly one configured project.
- **FR-010**: The backend MUST reject events from unconfigured or disallowed website origins.
- **FR-011**: The backend MUST provide abuse controls that bound traffic, storage, and processing per project and per source.
- **FR-012**: The backend MUST isolate abusive or over-quota projects so they cannot degrade unrelated projects.
- **FR-013**: The system MUST treat browser-distributed identifiers as public and MUST NOT rely on them as private proof of authenticity.
- **FR-014**: Production ingestion MUST require short-lived server-issued or server-attested ingest tokens, while any unsigned public-ID ingestion MUST be explicitly limited to demo/development mode and marked lower trust.
- **FR-015**: Administrative access and future integrations SHOULD prefer standard authorization and identity mechanisms over proprietary account systems where practical.
- **FR-016**: The system MUST use a standards-aligned event envelope and versioned event schemas to support future analytics, export, and AI-assisted insights without storing unnecessary sensitive raw data.
- **FR-017**: The system MUST provide documented safe defaults for privacy, security, quotas, and self-hosted operation.
- **FR-018**: The system MUST make ingestion health observable to operators without exposing visitor-sensitive data in logs.

### Key Entities *(include if feature involves data)*

- **Project**: A configured analytics property owned by a self-hosting operator or team; contains allowed origins, limits, privacy settings, and ingestion identifiers.
- **Source**: A website or application environment allowed to send events for a project.
- **Event**: A normalized activity record such as page view or custom action, with name, timestamp, source, project, consent state, anonymous visitor/session context, and validated properties.
- **Visitor Context**: A privacy-preserving identifier or attributes used to group activity where allowed; must avoid sensitive personal data by default.
- **Quota Policy**: Per-project and per-source limits for requests, event volume, payload size, and storage growth.
- **Consent State**: A representation of whether analytics collection is allowed for a visitor/session and which categories of data may be collected.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new website owner can install the snippet and see a test page-view event in under 15 minutes using documented instructions.
- **SC-002**: When the backend is unavailable, the host website remains usable and visitor-facing pages do not show analytics errors.
- **SC-003**: The ingestion path accepts at least 1,000 valid events per second in a controlled test deployment while continuing to reject invalid messages.
- **SC-004**: 100% of accepted events conform to the documented v0.1.0 event schema.
- **SC-005**: Oversized or malformed requests are rejected before storage in 100% of validation tests.
- **SC-006**: A project that exceeds configured traffic limits is throttled without causing unrelated projects to fail in abuse tests.
- **SC-007**: Privacy tests confirm that raw form input, password-like values, and common secret-like URL parameters are not stored by default.
- **SC-008**: Operators can understand ingestion volume, rejection counts, and quota status without inspecting visitor-sensitive payloads.

## Assumptions

- v0.1.0 focuses on collection and ingestion, not full dashboards, session replay, in-app guides, or advanced reporting.
- Anonymous usage analytics are in scope; authenticated visitor identity is optional and must use a privacy-reviewed integration path.
- Browser-only event authenticity cannot be perfect because browser-delivered identifiers are visible to visitors; v0.1.0 production mode will require short-lived signed ingest tokens and retain a clearly marked unsigned demo mode only for onboarding and local validation.
- Self-hosted deployment is a primary scenario, so defaults must work without relying on an expensive managed service.
- Consent handling will be represented in event context, while site owners remain responsible for showing consent UI appropriate to their jurisdiction.

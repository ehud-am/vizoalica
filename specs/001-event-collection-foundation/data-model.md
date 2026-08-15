# Data Model: Event Collection Foundation

## Project

Represents one analytics property.

**Fields**:
- `id`: stable project identifier
- `name`: human-readable name
- `mode`: `production` or `demo`
- `created_at`, `updated_at`
- `default_retention_days`
- `privacy_policy`: redaction and allowed-property policy reference
- `quota_policy_id`

**Validation rules**:
- Project IDs are globally unique.
- Production projects require at least one active source and signing key.
- Demo projects must mark accepted events with low trust.

## Source

Represents an allowed website/application origin for a project.

**Fields**:
- `id`
- `project_id`
- `allowed_origins`
- `public_source_key`
- `status`: `active`, `disabled`, `rotating`
- `created_at`, `updated_at`

**Validation rules**:
- Events must match an active source.
- Browser origin must match an allowlisted origin unless explicitly in demo mode.
- Public source keys are routing identifiers, not secrets.

## Signing Key

Represents a server-side key used to verify short-lived ingest tokens.

**Fields**:
- `id`
- `project_id`
- `source_id`
- `algorithm`
- `public_key_or_secret_reference`
- `status`: `active`, `retiring`, `disabled`
- `created_at`, `not_before`, `expires_at`

**Validation rules**:
- Disabled keys cannot verify tokens.
- Retiring keys may verify existing tokens but should not mint new ones.
- Key material must never be exposed to browser SDK configuration.

## Ingest Token

Represents claims carried by a short-lived signed token.

**Fields / claims**:
- `iss`: customer/backend issuer
- `aud`: Vizoalica ingestion audience
- `sub`: source or session subject
- `project_id`
- `source_id`
- `origin`
- `scope`: allowed operation, e.g. `events:write`
- `iat`, `nbf`, `exp`
- `jti`: token identifier for replay controls
- optional `visitor_id`, `session_id`, `consent_state`
- optional `max_events`

**Validation rules**:
- Token expiry must be short-lived.
- Token project/source/origin must match request context.
- `jti` should support replay detection within the token lifetime.
- Browser SDK may hold a token but never the signing secret.

## Event Batch

Represents one ingestion request containing one or more events.

**Fields**:
- HTTP request metadata: received time, origin, IP-derived abuse context
- `events`: CloudEvents JSON array
- `batch_size_bytes`
- `event_count`
- `auth_context`: signed, unsigned-demo, invalid

**Validation rules**:
- Batch must not exceed configured byte or event-count limits.
- Every event must be independently valid.
- Invalid production authentication rejects the full batch.

## Event

Represents a normalized product analytics event.

**CloudEvents fields**:
- `specversion`
- `id`
- `type`
- `source`
- `subject`
- `time`
- `datacontenttype`
- extension attributes: `vizoalicaproject`, `vizoalicasource`, `vizoalicaauth`, `vizoalicaconsent`, optional `traceparent`, optional `tracestate`
- `data`

**Supported v0.1.0 types**:
- `com.vizoalica.page_view.v1`
- `com.vizoalica.custom_event.v1`

**Validation rules**:
- Event IDs must be unique enough for deduplication within a project/time window.
- Event time must be within allowed skew and age.
- Event type must map to a known JSON Schema.
- Event data must pass schema and privacy policy validation.

## Page View Event Data

**Fields**:
- `page.url_origin`
- `page.url_path`
- `page.url_query_redacted`
- optional `page.title`
- `visitor.anonymous_id`
- `session.id`
- optional `referrer.origin`
- optional `screen` dimensions bucketed or minimized

**Validation rules**:
- Query values are redacted by default.
- Raw page text and form values are forbidden.
- Visitor/session identifiers must be privacy-preserving pseudonymous values.

## Custom Event Data

**Fields**:
- `name`
- `properties`
- `visitor.anonymous_id`
- `session.id`

**Validation rules**:
- Event names must follow documented naming rules.
- Properties must be scalar or shallow structured values within size/type limits.
- Property names that indicate secrets or sensitive data are rejected or redacted.

## Quota Policy

Defines project/source limits.

**Fields**:
- `max_request_bytes`
- `max_events_per_batch`
- `max_events_per_token`
- `max_events_per_second`
- `max_events_per_day`
- `max_property_count`
- `max_property_value_length`
- `retention_days`

**Validation rules**:
- Quotas are enforced before persistence.
- Exceeding quota produces throttling/drop decisions and operational counters.

## Ingestion Decision

Represents the outcome of processing a request or event.

**Fields**:
- `decision`: `accepted`, `partial`, `rejected`, `throttled`
- `reason_codes`
- `accepted_count`
- `rejected_count`
- `project_id`, `source_id`
- `received_at`

**Validation rules**:
- Logs and metrics must avoid raw sensitive payload data.
- Decision reason codes must be safe for operator dashboards and debugging.

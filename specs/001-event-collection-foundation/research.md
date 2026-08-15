# Phase 0 Research: Event Collection Foundation

## Decision: CloudEvents JSON as the event envelope

**Rationale**: CloudEvents provides a standard envelope with `id`, `source`, `type`, `time`, `subject`, `datacontenttype`, and extension attributes. It also supports JSON batch format, which maps naturally to browser event batching.

**Alternatives considered**:
- Proprietary envelope: simpler initially but violates the open-standards principle and creates migration work.
- OpenTelemetry logs/events as the primary shape: valuable ecosystem, but heavier and more observability-oriented than product analytics ingestion.

## Decision: JSON Schema for event data validation

**Rationale**: JSON Schema gives strict, versioned, language-neutral validation for browser and backend event contracts. It supports documentation, tests, compatibility checks, and AI-readable structure.

**Alternatives considered**:
- TypeScript types only: useful for implementation but not a portable external contract.
- Ad hoc validation: faster to start but weaker for security and compatibility.

## Decision: Short-lived JWT/JOSE ingest tokens from day one

**Rationale**: Production ingestion should not rely on browser-visible project identifiers as proof of authenticity. A server-minted short-lived token can bind project, source, origin, expiry, token id, and optional anonymous visitor/session context. This does not make browser analytics impossible to fake, but it improves replay resistance and gives the backend a strong trust signal.

**Alternatives considered**:
- Public project ID only: easy onboarding but trivial to spoof and difficult to distinguish from trusted events.
- Long-lived browser secret: rejected because browser secrets are extractable.
- mTLS/client certificates: too heavy for ordinary website analytics v0.1.0.

## Decision: Explicit trust levels

**Rationale**: The system should distinguish production signed events from demo/dev unsigned events. This allows v0.1.0 to preserve an easy demo path while preventing low-trust data from being confused with verified production data.

**Alternatives considered**:
- Disable unsigned ingestion entirely: strongest security posture, but makes static-site demos and first-run validation harder.
- Treat all events equally: rejected because it hides data quality differences.

## Decision: W3C Trace Context compatibility, not dependency

**Rationale**: Supporting `traceparent` and `tracestate` fields allows product events to correlate with existing distributed traces when a customer has them. It should be optional so ordinary websites do not need tracing infrastructure.

**Alternatives considered**:
- Proprietary correlation IDs only: easy, but less interoperable.
- Require OpenTelemetry instrumentation: too heavy for v0.1.0.

## Decision: Consent state in every accepted event

**Rationale**: Consent state must be first-class so later reporting and exports can distinguish why an event was collected. Sites that use IAB TCF can pass a TCF string; other sites can pass simpler analytics consent states.

**Alternatives considered**:
- Build a consent banner in v0.1.0: too much scope and legal complexity.
- Ignore consent until later: risky because early data would lack governance context.

## Decision: Early rejection and quotas before persistence

**Rationale**: Public ingestion endpoints are vulnerable to denial of service and cost amplification. The backend must reject oversized, malformed, unauthorized, stale, replayed, or over-quota data before storage or downstream fan-out.

**Alternatives considered**:
- Store then filter: simpler pipeline, but unsafe and expensive under abuse.
- Rely only on infrastructure rate limiting: insufficient because limits must be project/source-aware.

## Decision: Container-first self-hosting with a simple durable store

**Rationale**: v0.1.0 should be easy to run locally and on a small server. A single durable store can support the first release if the ingestion code keeps a clear boundary for future queue/batch storage.

**Alternatives considered**:
- Serverless-only design: can scale well but may cause vendor lock-in and variable costs.
- Kubernetes-first design: powerful but too operationally heavy for the first release.

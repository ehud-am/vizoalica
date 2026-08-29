<!--
Sync Impact Report
Version change: 1.0.0 → 2.0.0
Modified principles: IV. Self-Hosted, Low-Cost Operations → IV. Cloudflare-First,
Low-Cost Operations
Added sections: none
Removed sections: self-hosted/no-paid-managed-service default requirement
Follow-up TODOs: Define alternative deployment profiles when they are proposed for a future release.
-->
# Vizoalica Constitution

## Core Principles

### I. Privacy-Minimal Analytics
Vizoalica MUST collect the minimum data required to answer product analytics questions.
Collection of sensitive information, raw page content, secrets, passwords, payment data,
health data, or unnecessary personal data is forbidden by default. Any new data field MUST
have a documented product purpose, retention expectation, and privacy review before it is
accepted.

Rationale: The project exists to provide product insight without turning analytics into a
liability for site owners or their users.

### II. Security and Abuse Resistance by Design
Every externally reachable interface MUST be designed as hostile-input infrastructure.
Ingestion paths MUST validate schemas, reject oversized or malformed payloads, isolate
tenants/projects, enforce quotas, and fail closed for writes while preserving the host
website's normal operation. Authentication, authorization, key rotation, and auditability
MUST be explicit requirements, not implementation afterthoughts.

Rationale: Analytics systems are high-volume public endpoints; weak controls invite fake
data, denial of service, cost amplification, and data breaches.

### III. Open Standards and Interoperability
Vizoalica MUST prefer established standards and protocols over proprietary mechanisms when
reasonable, including standards for identity, authorization, consent signaling, data export,
and deployment interfaces. Proprietary formats MAY be introduced only when a standard does
not meet the documented need, and an export or migration path MUST be provided.

Rationale: Open-source product analytics should avoid vendor lock-in and be easy to adopt,
audit, replace, and integrate.

### IV. Cloudflare-First, Low-Cost Operations
Vizoalica v0.1.0 MUST use Cloudflare as its native production deployment platform. Designs
MUST favor managed edge ingestion, bounded resource usage, predictable storage growth,
graceful degradation, and cost controls before adding scale-oriented complexity. Alternative
deployment profiles, including self-hosted and other cloud providers, are deferred until a
later release and MUST preserve the portable event and storage boundaries established in v0.1.0.

Rationale: A single native deployment model lets the first release focus on secure, low-cost
operation rather than splitting implementation and support effort across infrastructure stacks.

### V. AI-Ready, Human-Governed Product Data
Analytics events, schemas, documentation, and administrative workflows MUST be structured so
future AI-assisted analysis can reason over them safely. AI-readiness MUST NOT weaken
privacy, security, explainability, or user control. Automated insights MUST be traceable to
underlying events and must avoid exposing data beyond the requesting user's authorization.

Rationale: AI can make analytics easier to use, but only if the underlying data is governed,
structured, and safe.

## Product & Architecture Constraints

- The embedded website integration MUST never block or break the host website if Vizoalica is
  unavailable, slow, misconfigured, or rate-limited.
- Browser-distributed credentials MUST be treated as public identifiers, not secrets.
- Server-side secrets, private signing keys, and administrative credentials MUST never be
  embedded in customer websites or client bundles.
- Ingestion MUST apply cost and abuse limits before expensive processing, persistence, or
  downstream fan-out.
- Data models MUST support future expansion without requiring a breaking rewrite of captured
  event history.
- The v0.1.0 default deployment MUST be documented for Cloudflare and MUST keep raw-event
  storage separate from configuration and quota metadata.
- Future deployment profiles MUST use the documented event and storage interfaces; they MUST
  not require breaking changes to browser integrations or accepted event history.

## Development Workflow & Quality Gates

- Requirements and architecture decisions MUST be documented before implementation begins.
- Security, privacy, abuse resistance, and operational cost MUST be reviewed for every feature
  that touches data collection, ingestion, storage, identity, authorization, or exports.
- Tests MUST cover schema validation, privacy filtering, failure behavior, authorization
  boundaries, quota enforcement, and tenant/project isolation for relevant changes.
- Public APIs, event schemas, and configuration formats MUST be versioned or explicitly marked
  experimental before release.
- Documentation MUST explain safe integration defaults and known limits honestly, including
  cases where perfect guarantees are impossible in browser-based telemetry.

## Governance

This constitution supersedes informal project practices. Specifications, plans, tasks, code
reviews, and release decisions MUST check compliance with these principles.

Amendments require:
1. A written proposal explaining the change and its impact.
2. Review of privacy, security, cost, and open-source interoperability consequences.
3. An updated Sync Impact Report in this file.
4. Semantic versioning of the constitution: MAJOR for incompatible principle changes, MINOR
   for new or materially expanded principles, and PATCH for clarifications.

Release readiness requires documented evidence that the applicable quality gates were met or
that any exception was explicitly accepted with a follow-up plan.

**Version**: 2.0.0 | **Ratified**: 2026-08-15 | **Last Amended**: 2026-08-28

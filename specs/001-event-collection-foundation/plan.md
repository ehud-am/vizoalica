# Implementation Plan: Event Collection Foundation

**Branch**: `001-event-collection-foundation` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-event-collection-foundation/spec.md`

**Note**: This template is filled in by the `$speckit-plan` command; its definition describes the execution workflow.

## Summary

Build the v0.1.0 analytics foundation: a non-blocking browser SDK that emits privacy-filtered CloudEvents JSON batches and an ingestion service that validates short-lived signed ingest tokens, enforces strict JSON Schemas and quotas, and stores accepted events for future analysis. The first release intentionally excludes dashboards, session replay, heatmaps, in-app guides, and AI insight generation while preserving expansion paths for them.

## Technical Context

**Language/Version**: TypeScript targeting modern browsers and current LTS server runtimes

**Primary Dependencies**: Browser SDK with no runtime dependency requirement; Cloudflare Workers runtime; Web Crypto-compatible JWT verification; JSON Schema validator; CloudEvents-compatible event envelope; OpenAPI for HTTP contracts; Wrangler for deployment and local validation

**Storage**: Cloudflare D1 for project/source configuration, public identifiers, signing-key metadata, quota policies, and non-sensitive ingestion counters; Cloudflare R2 for immutable, lifecycle-managed raw event batches. A successful production response is returned only after the accepted batch is durably written to R2. Ingestion must preserve repository boundaries so future deployment targets can replace these implementations without changing event contracts.

**Testing**: Unit tests for privacy filters, schemas, token validation, quota decisions, and Cloudflare adapters; contract tests from OpenAPI/JSON Schema; Miniflare/Wrangler integration tests for snippet-to-Worker flows; load/abuse tests for high-volume valid and invalid traffic.

**Target Platform**: Web browsers for the SDK; Cloudflare Workers for the v0.1.0 ingestion API, with D1 and R2 as native persistence services.

**Project Type**: Monorepo containing browser SDK, Cloudflare ingestion worker, shared contracts/schemas, and Cloudflare deployment assets.

**Performance Goals**: Accept at least 1,000 valid events per second in a controlled single-deployment test while rejecting malformed/oversized traffic before persistence; snippet must not block host page rendering.

**Constraints**: Browser integration must fail silently; no long-lived secrets in the browser; signed ingest tokens required for production mode; public-ID unsigned ingestion allowed only for explicitly marked demo/dev mode; strict event/payload limits before D1 or R2 access; no raw form content or sensitive URL query values stored by default; D1 is not the raw-event store; R2 object keys and metadata must not disclose visitor-sensitive data.

**Scale/Scope**: v0.1.0 supports page-view and custom-event collection, Cloudflare project/source configuration, event ingestion, validation, quota enforcement, R2 retention, and minimal operator health metrics. Dashboards, account UI, consent-banner UI, session replay, AI insights, and non-Cloudflare deployment profiles are deferred.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Privacy-Minimal Analytics**: PASS — plan defaults to minimal event types, privacy filters, redacted URLs, no form content, and schema-bound custom properties.
- **Security and Abuse Resistance by Design**: PASS — signed short-lived tokens, origin checks, schema validation, size limits, quotas, replay/age controls, and early rejection are core requirements.
- **Open Standards and Interoperability**: PASS — CloudEvents JSON, JSON Schema, JWT/JOSE, OpenAPI, W3C Trace Context compatibility, and optional IAB TCF consent strings are selected where relevant.
- **Cloudflare-First, Low-Cost Operations**: PASS — managed edge deployment, bounded resource usage, early rejection, quota enforcement, retention controls, and minimal scope reduce operating cost.
- **AI-Ready, Human-Governed Product Data**: PASS — structured schemas, stable event names, consent/trust metadata, and traceable event records prepare data for future AI without adding AI features now.

## Project Structure

### Documentation (this feature)

```text
specs/001-event-collection-foundation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── openapi.yaml
│   └── schemas/
│       ├── cloudevent-batch.schema.json
│       ├── event-data-custom-event.schema.json
│       ├── event-data-page-view.schema.json
│       └── token-claims.schema.json
└── tasks.md
```

### Source Code (repository root)

```text
apps/
├── ingest-api/
│   ├── src/
│   │   ├── http/
│   │   ├── ingestion/
│   │   ├── auth/
│   │   ├── quotas/
│   │   ├── storage/
│   │   └── observability/
│   └── tests/
│       ├── contract/
│       ├── integration/
│       └── load/
├── ingest-worker/
    ├── src/
    └── tests/
└── token-demo/
    └── src/

packages/
├── browser-sdk/
│   ├── src/
│   └── tests/
├── event-contracts/
│   ├── schemas/
│   └── src/
└── privacy/
    ├── src/
    └── tests/

deploy/
└── cloudflare/
    └── wrangler.toml

docs/
└── operations/
```

**Structure Decision**: Use a TypeScript monorepo with a Cloudflare Worker adapter as the deployable ingestion surface and a runtime-neutral ingestion core. Shared contracts live in `packages/event-contracts` so the browser SDK, worker, tests, and docs validate against the same event definitions. Cloudflare adapters implement the storage boundary: D1 holds configuration and bounded operational state, while R2 holds immutable accepted batches. Alternative deployment profiles are deferred.

## Complexity Tracking

No constitution violations or complexity exceptions are required for this plan.

## Phase 0 Research Summary

See [research.md](./research.md). Key decisions: CloudEvents JSON batch envelope, JSON Schema validation, JWT/JOSE short-lived ingest tokens, W3C Trace Context compatibility, optional IAB TCF consent propagation, and a Cloudflare-native v0.1.0 deployment.

## Phase 1 Design Summary

See [data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml), and [quickstart.md](./quickstart.md). The core design centers on Project, Source, Ingest Token, Event Batch, Event, Consent State, Quota Policy, and Ingestion Decision entities.

## Post-Design Constitution Check

- **Privacy-Minimal Analytics**: PASS — contracts exclude raw form data and require redacted URL behavior.
- **Security and Abuse Resistance by Design**: PASS — contracts require bearer ingest tokens in production mode and specify early validation failure responses.
- **Open Standards and Interoperability**: PASS — all public contracts use OpenAPI, JSON Schema, JWT claims, and CloudEvents-style envelopes.
- **Cloudflare-First, Low-Cost Operations**: PASS — quickstart validates Cloudflare operation and quota behavior.
- **AI-Ready, Human-Governed Product Data**: PASS — schemas include stable event types, trust level, consent state, project/source binding, and structured properties.

# Implementation Plan: Event Collection Foundation

**Branch**: `001-event-collection-foundation` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-event-collection-foundation/spec.md`

**Note**: This template is filled in by the `$speckit-plan` command; its definition describes the execution workflow.

## Summary

Build the v0.1.0 analytics foundation: a non-blocking browser SDK that emits privacy-filtered CloudEvents JSON batches and an ingestion service that validates short-lived signed ingest tokens, enforces strict JSON Schemas and quotas, and stores accepted events through an ultra-low-cost bounded in-memory Parquet chunk path. The first release intentionally excludes dashboards, session replay, heatmaps, in-app guides, and AI insight generation while preserving expansion paths for them.

## Technical Context

**Language/Version**: TypeScript targeting modern browsers and current LTS server runtimes

**Primary Dependencies**: Browser SDK with no runtime dependency requirement; backend HTTP service; JOSE-compatible JWT verification; JSON Schema validator; CloudEvents-compatible event envelope; OpenAPI for HTTP contracts; DuckDB Node API for MVP Parquet analysis

**Storage**: Hot ingestion keeps accepted CloudEvents JSON batches in bounded memory briefly, then writes larger partitioned Parquet chunk files with stable analytics-ready top-level columns. The default v0.1.0 storage path avoids per-event database/document writes and accepts bounded loss; JSONL gzip remains an optional fallback/legacy adapter. MVP analysis uses DuckDB to query Parquet directly and produce summary JSON.

**Testing**: Unit tests for privacy filters, schemas, token validation, and quota decisions; contract tests from OpenAPI/JSON Schema; integration tests for snippet-to-ingestion flows; load/abuse tests for high-volume valid and invalid traffic.

**Target Platform**: Web browsers for the SDK; self-hosted Linux-compatible backend deployment with container-first packaging.

**Project Type**: Monorepo containing browser SDK, ingestion web service, shared contracts/schemas, and self-hosting deployment assets.

**Performance Goals**: Accept at least 1,000 valid events per second in a controlled single-deployment test while rejecting malformed/oversized traffic before persistence; keep the low-cost GCP profile at or below $0.50 per 1 million visits with up to 5 batched events per visit; snippet must not block host page rendering.

**Constraints**: Browser integration must fail silently; no long-lived secrets in the browser; signed ingest tokens required for production mode; public-ID unsigned ingestion allowed only for explicitly marked demo/dev mode; strict event/payload limits before expensive work; no raw form content or sensitive URL query values stored by default; JSON stays the wire format; Parquet chunk writes are allowed only through bounded micro-batches, never per event.

**Scale/Scope**: v0.1.0 supports page-view and custom-event collection, project/source configuration, event ingestion, validation, quota enforcement, and minimal operator health metrics. Dashboards, account UI, consent-banner UI, session replay, and AI insights are deferred.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Privacy-Minimal Analytics**: PASS — plan defaults to minimal event types, privacy filters, redacted URLs, no form content, and schema-bound custom properties.
- **Security and Abuse Resistance by Design**: PASS — signed short-lived tokens, origin checks, schema validation, size limits, quotas, replay/age controls, and early rejection are core requirements.
- **Open Standards and Interoperability**: PASS — CloudEvents JSON, JSON Schema, JWT/JOSE, OpenAPI, W3C Trace Context compatibility, and optional IAB TCF consent strings are selected where relevant.
- **Self-Hosted, Low-Cost Operations**: PASS — container-first deployment, bounded resource usage, early rejection, quota enforcement, and minimal scope reduce operating cost.
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
└── compose/

docs/
└── operations/
```

**Structure Decision**: Use a TypeScript monorepo with separate deployable ingestion service and publishable browser SDK packages. Shared contracts live in `packages/event-contracts` so the browser SDK, backend, tests, and docs validate against the same event definitions.

## Complexity Tracking

No constitution violations or complexity exceptions are required for this plan.

## Phase 0 Research Summary

See [research.md](./research.md). Key decisions: CloudEvents JSON batch envelope, JSON Schema validation, JWT/JOSE short-lived ingest tokens, W3C Trace Context compatibility, optional IAB TCF consent propagation, bounded Parquet chunk raw storage, optional JSONL gzip fallback, and container-first self-hosting.

## Phase 1 Design Summary

See [data-model.md](./data-model.md), [contracts/openapi.yaml](./contracts/openapi.yaml), and [quickstart.md](./quickstart.md). The core design centers on Project, Source, Ingest Token, Event Batch, Event, Raw Event Batch File, Consent State, Quota Policy, and Ingestion Decision entities.

## Post-Design Constitution Check

- **Privacy-Minimal Analytics**: PASS — contracts exclude raw form data and require redacted URL behavior.
- **Security and Abuse Resistance by Design**: PASS — contracts require bearer ingest tokens in production mode and specify early validation failure responses.
- **Open Standards and Interoperability**: PASS — all public contracts use OpenAPI, JSON Schema, JWT claims, and CloudEvents-style envelopes.
- **Self-Hosted, Low-Cost Operations**: PASS — quickstart validates local self-hosted operation and quota behavior; v0.1.0 storage avoids per-event managed database writes by using bounded Parquet chunks.
- **AI-Ready, Human-Governed Product Data**: PASS — schemas include stable event types, trust level, consent state, project/source binding, and structured properties.

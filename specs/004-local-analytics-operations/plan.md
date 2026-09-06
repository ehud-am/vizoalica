# Implementation Plan: Local Analytics Operations — Web Console Slice

**Branch**: `004-local-analytics-operations` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification plus this iteration's scope: a local web console for website management and the initial page-view and unique-user counters. The MCP client is deferred.

## Summary

Build an on-demand local admin console that creates, updates, disables (soft-deletes), and lists websites; generates a safe browser integration snippet; and presents source-scoped page-view and unique-user counts for rolling 24-hour, 7-day, and 30-day windows. The React web client talks only to a loopback Node operations API. That API owns the remote administrative credential and calls the existing Cloudflare Worker. The Worker remains the backend data plane and extends its D1 aggregates to support the two metrics. No hosted dashboard, new managed datastore, or MCP implementation is introduced in this slice.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 22, ES2022, React 19

**Primary Dependencies**: React and Vite for the local web client; Node built-in HTTP/crypto APIs and existing Ajv validation for the local operations API; Cloudflare Workers, D1, R2, Wrangler, and Vitest for the remote data plane

**Storage**: D1 holds website configuration, audit entries, hourly page-view counters, and private visitor-digest presence rows; R2 retains raw accepted batches only; the local API stores its launch configuration and remote admin credential in a user-only local configuration file

**Testing**: Vitest unit, API contract, Worker integration, local API integration, and browser UI tests; manual quickstart validation against a local Worker/D1 environment

**Target Platform**: macOS personal machine for the local web console and Node API; Cloudflare Workers for existing ingestion, aggregation, and protected remote admin endpoints

**Project Type**: TypeScript monorepo with a local web application, local operations API, and a Cloudflare Worker data plane

**Performance Goals**: Render website management actions in under 2 seconds and each supported analytics summary in under 5 seconds for a source with up to 100,000 retained aggregate rows

**Constraints**: The embedded SDK and event-delivery contract do not change; loopback-only local API; no remote credential, signing key, visitor identifier, raw event, or raw URL query value may reach the browser; fixed rolling windows only; no raw R2 scans for normal analytics; the website's server, not the console, issues short-lived ingest JWTs

**Scale/Scope**: A trusted single operator or small team manages multiple isolated projects and websites. This slice implements the web client only; MCP, user accounts, multi-user collaboration, charts, exports, arbitrary date ranges, permanent hosted console, and data deletion are deferred.

## Constitution Check

*GATE: Passed before research; rechecked after design.*

- **Privacy-Minimal Analytics**: PASS — only page-view counters and opaque, non-reversible visitor-digest presence rows are retained for analytics. The browser receives only totals.
- **Security, Privacy, and Abuse Resistance**: PASS — the local API binds to loopback, keeps the remote admin credential out of the browser, validates each request, enforces project/source ownership remotely, and records configuration mutations in the existing audit trail.
- **Open Source and Portable Interoperability**: PASS — the existing event and browser integration contracts remain stable; the generated snippet documents the public source key and the site's standard token-issuer endpoint.
- **Minimal Infrastructure and AI-Assisted Deployment**: PASS — existing Worker/D1/R2 infrastructure remains the production data plane. Fixed windows and indexed hourly D1 aggregates avoid a hosted console, R2 scans, KV, Durable Objects, and R2 SQL. The local API establishes the documented boundary the later MCP adapter will use.
- **Human-Readable and AI-Ready Engineering**: PASS — the web console is human-operated; the local API boundary is deliberately reusable by the deferred MCP client without adding it now. Implementation must provide reproducible commands, clear contracts, and the required automated tests.
- **Accessible Product Experience**: PASS — implementation will meet WCAG 2.2 AA with keyboard-operable, semantic, responsive local-console controls and automated plus representative manual accessibility checks.

**Governance prerequisite**: SATISFIED — FR-011 is fulfilled by the ratified v3.0.0 constitution before implementation begins.

## Project Structure

### Documentation (this feature)

```text
specs/004-local-analytics-operations/
├── contracts/local-operations-api.md
├── data-model.md
├── plan.md
├── quickstart.md
└── research.md
```

### Source Code (repository root)

```text
apps/
├── admin-web/                 # New React/Vite local web console
│   ├── src/{pages,components,api}/
│   └── tests/
├── local-ops-api/             # New loopback-only Node operations API
│   ├── src/{config,remote-client,routes}/
│   └── tests/
├── ingest-api/                # Existing runtime-neutral contracts and ingestion logic
└── ingest-worker/             # Existing Worker admin, ingest, and D1 aggregation
    ├── src/{http,storage}/
    └── tests/
deploy/cloudflare/migrations/  # D1 schema migrations
docs/operations/               # Operator and integration guidance
```

**Structure Decision**: Add separate local-web and local-API applications. The browser calls only the local API; only the local API calls the remote Worker. Keep configuration and aggregation changes in the existing Worker and D1 repositories. This is the shared API boundary required by the larger feature, even though the MCP client is deferred.

## Complexity Tracking

No constitution violations or complexity exceptions are required.

## Phase 0 Research Summary

See [research.md](./research.md). Retain D1 as the configuration and aggregate store; implement hourly page-view and opaque visitor-digest presence aggregates for exact rolling windows. Treat a website's generated public source key as an identifier, not a secret. The website itself continues to issue short-lived ingest tokens.

## Phase 1 Design Summary

See [data-model.md](./data-model.md), [contracts/local-operations-api.md](./contracts/local-operations-api.md), and [quickstart.md](./quickstart.md). Website delete is a soft delete that disables future ingestion and preserves history/audit records. The browser-facing console never directly connects to R2, D1, or Cloudflare administration endpoints.

## Post-Design Constitution Check

- **Privacy-Minimal Analytics**: PASS — visitor digests remain internal to D1; analytics responses contain only totals and safe website metadata.
- **Security, Privacy, and Abuse Resistance**: PASS — local session protection, strict loopback binding, no CORS, bounded validation, remote authorization, and audit records are specified.
- **Open Source and Portable Interoperability**: PASS — no browser instrumentation change; generated integration guidance uses the existing documented embed contract.
- **Minimal Infrastructure and AI-Assisted Deployment**: PASS — no always-on control plane or added managed service; D1 writes/reads are bounded by accepted events and the three fixed ranges.
- **Human-Readable and AI-Ready Engineering**: PASS — the common local API is documented for a later MCP adapter but the first delivery remains human-operated; specifications, contracts, quickstart, and test requirements are explicit.
- **Accessible Product Experience**: PASS — the local-console implementation must include WCAG 2.2 AA automated and representative manual accessibility validation before release.

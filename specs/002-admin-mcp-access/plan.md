# Implementation Plan: Secure Admin and MCP Access

**Branch**: `002-admin-mcp-access` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

## Summary

Add a protected, non-UI operator surface for creating isolated projects and website sources, plus
two read-only MCP tools that return source-scoped page-view aggregates. A distinct administrator
secret, fixed D1 operations, safe audit entries, and stateless authenticated MCP Streamable HTTP
keep the feature secure and low cost.

## Technical Context

**Language/Version**: TypeScript 5.7 targeting ES2022 and Cloudflare Workers

**Primary Dependencies**: Cloudflare Workers and D1, Ajv, official MCP TypeScript SDK, Wrangler, Vitest

**Storage**: D1 for configuration, conservative source policies, bounded rollups, and safe audit
entries; R2 remains raw-ingestion storage only

**Testing**: Vitest unit, Worker adapter, repository, and integration tests

**Target Platform**: Cloudflare Workers with D1; HTTPS operator and MCP clients

**Project Type**: TypeScript monorepo with a Cloudflare Worker web service

**Performance Goals**: Complete configuration and 31-day source-scoped aggregate queries in under
five seconds while retaining the existing 1,000 events/second ingestion target

**Constraints**: One secret-backed administrator credential; no browser admin access; read-only
MCP; no raw events, arbitrary SQL, credentials, visitor/session data, or unbounded date queries;
31-day maximum date range; fixed parameterized D1 statements

**Scale/Scope**: Multiple isolated projects and sources, two MCP tools, one operator credential.
User accounts, UI, exports, raw event access, and write MCP tools are deferred.

## Constitution Check

*GATE: Passed before research and rechecked after design.*

- **Privacy-Minimal Analytics**: PASS — only safe metadata and existing aggregates are read; audit
  records exclude credentials, payloads, visitor/session IDs, and raw URL data.
- **Security and Abuse Resistance by Design**: PASS — a distinct administrator secret protects
  every admin/MCP request; requests are validated, scoped, bounded, and safely audited.
- **Open Standards and Interoperability**: PASS — MCP uses standard Streamable HTTP; browser event
  contracts do not change.
- **Cloudflare-First, Low-Cost Operations**: PASS — fixed D1 queries, a 31-day cap, source-level
  conservative defaults, and no raw-event reads constrain cost.
- **AI-Ready, Human-Governed Product Data**: PASS — read-only, attributable, scoped tools provide
  basic answers without autonomous configuration changes.

## Project Structure

```text
apps/
├── ingest-api/src/
│   ├── auth/
│   ├── domain/
│   ├── ingestion/
│   └── storage/
└── ingest-worker/
    ├── src/
    │   ├── auth/
    │   ├── http/
    │   └── storage/
    └── tests/
deploy/cloudflare/migrations/
docs/operations/
specs/002-admin-mcp-access/
├── contracts/
├── data-model.md
├── plan.md
├── quickstart.md
└── research.md
```

**Structure Decision**: Runtime-neutral types and storage interfaces stay in `ingest-api`.
Worker-only authorization, MCP transport, routing, and D1 implementation stay in `ingest-worker`.

## Complexity Tracking

No constitution violations or complexity exceptions are required.

## Phase 0 Research Summary

See [research.md](./research.md). Use a distinct administrator secret with constant-time
comparison, protected fixed administration routes, source-specific conservative policies, and
stateless authenticated MCP Streamable HTTP. Existing dashboard rollups already answer the basic
page-view question.

## Phase 1 Design Summary

See [data-model.md](./data-model.md), [contracts/admin-mcp.md](./contracts/admin-mcp.md), and
[quickstart.md](./quickstart.md). The design adds safe administrative audit entries and two
read-only MCP tools without exposing raw events.

## Post-Design Constitution Check

- **Privacy-Minimal Analytics**: PASS — contracts return only aggregate counts and safe metadata.
- **Security and Abuse Resistance by Design**: PASS — each request authenticates independently;
  no CORS, arbitrary queries, or cross-project reads are allowed.
- **Open Standards and Interoperability**: PASS — standard MCP Streamable HTTP with documented
  tool schemas.
- **Cloudflare-First, Low-Cost Operations**: PASS — indexed, bounded D1 reads and conservative
  source defaults.
- **AI-Ready, Human-Governed Product Data**: PASS — project-scoped, read-only tools preserve
  operator control.

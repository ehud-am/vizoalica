# Implementation Plan: Basic Analytics Dashboard

**Branch**: `003-basic-dashboard` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

## Summary

Add a small authenticated dashboard that lets an operator select one configured website and view
unique anonymous users and accepted page views for today, seven days, or 30 days. It uses bounded,
source-scoped aggregates and returns no visitor identity or raw event data.

## Technical Context

**Language/Version**: TypeScript 5.7, ES2022, Cloudflare Workers

**Primary Dependencies**: Existing Worker, D1, browser-rendered static response, Vitest

**Storage**: D1 bounded dashboard rollups plus a privacy-reviewed daily unique-visitor aggregate;
R2 remains raw ingestion storage and is never read by the dashboard

**Testing**: Vitest Worker route, aggregate, privacy, range, and project-isolation tests

**Target Platform**: Authenticated HTTPS Worker dashboard

**Constraints**: Existing administrator credential; no browser CORS; three fixed ranges; no raw
events, identifiers, raw URLs, or unbounded D1 reads

## Constitution Check

- **Privacy-Minimal Analytics**: PASS — unique users are computed as a bounded aggregate and never
  returned as visitor identifiers.
- **Security and Abuse Resistance**: PASS — the existing admin credential protects HTML and data;
  strict project/source ownership and fixed ranges precede every aggregate query.
- **Cloudflare-First, Low-Cost Operations**: PASS — fixed periods, indexed D1 aggregates, and no
  R2 reads bound cost.
- **AI-Ready, Human-Governed Data**: PASS — dashboard summaries are source-scoped and traceable.

## Project Structure

```text
apps/ingest-api/src/ingestion/
apps/ingest-worker/src/http/
apps/ingest-worker/src/storage/
apps/ingest-worker/tests/
deploy/cloudflare/migrations/
docs/operations/
specs/003-basic-dashboard/
```

## Phase 0 Research Summary

See [research.md](./research.md). Daily deduplicated anonymous-user aggregates are the smallest
privacy-safe source for range totals; dashboard rendering stays server-delivered and authenticated.

## Phase 1 Design Summary

See [data-model.md](./data-model.md), [contracts/dashboard.md](./contracts/dashboard.md), and
[quickstart.md](./quickstart.md). The design adds no user accounts, charts, raw-event access, or
custom date ranges.

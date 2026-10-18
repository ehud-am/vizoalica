# Implementation Plan: UTM Campaign Report

**Branch**: `022-utm-campaign-report` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

## Summary

Read three UTM parameters in the browser on the landing page view, clean them with one shared function, carry
them in an optional `campaign` object on the page-view event, re-clean at ingestion, aggregate per minute in
three new D1 tables, and report through a new admin route, a console page and an MCP tool. It follows the shape
of the custom events report (0.10.0) so the new code looks like the old code.

## Technical Context

- **Language**: TypeScript (Node 22 for tooling, Cloudflare Workers runtime, React for the console).
- **Storage**: D1, additive migration `0005_campaign_reports.sql`. Raw events remain in R2 unchanged.
- **Testing**: Vitest (unit, contract, integration through `worker.fetch` on the real schema), Playwright with axe
  for the console.
- **Constraints**: nothing stored in the browser; no new network request; ingestion keeps rejecting oversized and
  malformed input; the SDK never throws into the host page.

## Constitution Check

| Principle                         | Result                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| I Privacy-minimal                 | Three labels, cleaned, capped, 32 days; purpose, retention, access documented in the spec. No identifiers returned. |
| II Security and abuse             | Hostile-input tests for the SDK cleaner, the schema and the guard; bounded output; roles and scopes reuse existing. |
| III Open source / portable        | Optional field in the public event schema (versioned doc); migration additive; no vendor feature.                   |
| IV Minimal infrastructure         | No new service, binding or request. Three tables.                                                                   |
| V Readable engineering            | Mirrors `custom-event-rollups.ts`; one cleaner in `@vizoalica/privacy`.                                             |
| Accessibility                     | New page tested with axe, keyboard, reflow.                                                                         |
| Gates                             | Tests with negative cases; coverage >90%; alignment review and QA report before release (see tasks).                |

No violations; no complexity exceptions.

## Project Structure (touched files)

```text
packages/privacy/src/campaign.ts            # cleanCampaignValue, extractCampaign (shared by browser + ingestion)
packages/event-contracts/                   # schema: optional page_view.campaign; CampaignData type
packages/browser-sdk/src/{events,index,privacy}.ts   # attach to first page view only
apps/ingest-api/src/ingestion/privacy-guard.ts       # re-clean campaign
apps/ingest-api/src/domain/types.ts, storage/repositories.ts   # CampaignsReport, filters, repository method
apps/ingest-worker/src/storage/campaign-rollups.ts   # expand + statements + report queries
apps/ingest-worker/src/storage/d1-repositories.ts    # wire rollups, retention, purge lists
apps/ingest-worker/src/http/admin-adapter.ts         # GET .../analytics/campaigns
apps/ingest-worker/src/index.ts                      # bind getCampaignsReport (explicit list!)
apps/ingest-worker/src/schema-version.ts             # EXPECTED_SCHEMA_VERSION (see feature 023: 6)
deploy/cloudflare/migrations/0005_campaign_reports.sql
apps/local-ops-api/src/{contracts,routes/analytics,server}.ts
apps/admin-web/src/analytics/CampaignsPage.tsx (+hook, tables), router, nav, API client, e2e mock
apps/cli/src/mcp/server.ts                           # get_campaigns
skills/vizoalica/ (SKILL.md + reference), docs/operations/campaigns.md, privacy, browser-sdk, ai pages
```

## Phases

1. **Contract and cleaner** (blocks the rest): shared cleaner, event schema, types.
2. **Collection**: SDK attaches to the landing view; guard re-cleans.
3. **Storage and report**: migration, rollups, queries, admin route, repository binding (including `index.ts`).
4. **Console and MCP**: page, hook, route proxy, tool.
5. **Docs, skill, release notes** and the alignment checks.

## Risks

| Risk                                                                                       | Mitigation                                                                                            |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| A repository method missing from the Worker's explicit list returns 404 in production      | Task requires a test through `worker.fetch` on the real schema (see memory note / actions test)       |
| Backend older than the SDK rejects batches with `campaign`                                 | Release note, docs "Update order", and the SDK already sends page views in their own batch            |
| Row growth from hostile combinations                                                       | Bounded output, retention, existing quotas; test with 1,000 distinct values                            |
| Double counting on route changes                                                           | Landing-only rule with a test of 50 route changes                                                      |

# Implementation Plan: Exclude Internal Traffic

**Branch**: `023-exclude-internal-traffic` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

## Summary

Add a per-website list of excluded addresses (and ranges), match the request's client address in the ingestion
pipeline before anything is stored, count what was dropped per day, and let owners edit the list and see the
count in the console. Add an SDK browser opt-out switch that needs no list. Mirrors how `tokenRequired` (a
per-website setting) was added in 0.9.0.

## Technical Context

Same stack as feature 022. Storage: additive migration `0006_internal_traffic_exclusion.sql` (one column on
`sources`, one counter table). The address match is pure code with no dependency.

## Constitution Check

| Principle                  | Result                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| I Privacy-minimal          | Reduces collection. Configured addresses are admin settings with a stated purpose/retention/access; counter holds no address; client address never stored. |
| II Security and abuse      | Exclusion only after authentication; strict list validation; analysts cannot read addresses; negative tests.       |
| III Portable               | Plain header + column; no provider feature beyond the `cf-connecting-ip` header already used.                      |
| IV Minimal infrastructure  | No new binding; zero extra statements when the list is empty.                                                       |
| V Readable                 | One small `address-match.ts` module with table-driven tests.                                                         |
| Accessibility              | Form field with label, hint and error association; card tested with axe/keyboard.                                    |

## Project Structure (touched files)

```text
apps/ingest-api/src/ingestion/address-match.ts        # parseAddressEntry, canonical form, matchesAny (v4/v6/CIDR)
apps/ingest-api/src/domain/types.ts                   # Source.excludedAddresses, IngestionDecision 'excluded'
apps/ingest-api/src/ingestion/pipeline.ts             # clientAddress input, drop step, counter call
apps/ingest-api/src/storage/repositories.ts           # recordExcludedHits, getExcludedHits; updateSource field
apps/ingest-api/src/http/events.ts + worker-adapter   # pass cf-connecting-ip; 'excluded' response
apps/ingest-worker/src/storage/d1-repositories.ts     # column read/write, counter, report, retention, purge
apps/ingest-worker/src/http/admin-adapter.ts          # excludedAddresses on POST/PATCH, role stripping, hits route, status
apps/ingest-worker/src/index.ts                       # bind new methods (explicit list!)
deploy/cloudflare/migrations/0006_internal_traffic_exclusion.sql ; schema-version.ts -> 6
packages/browser-sdk/src/ignore.ts + index.ts         # opt-out
apps/local-ops-api/src/{contracts,routes/websites,routes/...}.ts
apps/admin-web/src/components/WebsiteForm.tsx, manage/WebsitePage.tsx (+ card)
apps/cli/src/mcp/server.ts                            # website_status additions
docs/operations/internal-traffic.md, privacy, browser-sdk, ai, skill
```

## Phases

1. Address parsing and matching (pure, table-driven tests first).
2. Pipeline drop, counter, migration, Worker binding, end-to-end test through `worker.fetch`.
3. Admin API (validation, role stripping, hits report, status).
4. SDK opt-out.
5. Console form and card; MCP status.
6. Docs, skill, release notes.

## Risks

| Risk                                                                              | Mitigation                                                                                  |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A new repository method missing from `index.ts` 404s in production                | End-to-end test through `worker.fetch` on the real schema                                    |
| Wrongly excluding real visitors (shared address)                                  | Counter visible, docs warning, whole-save validation, easy removal                           |
| Old Worker ignores the setting while the console says it is on                    | Console shows the backend schema warning already used for new pages; docs update order      |
| Exclusion acts as an oracle for which address is listed                           | Only after authentication; only reveals the sender's own status                              |
| IPv6 matching bugs                                                                | Table-driven boundary tests; BigInt comparison                                               |

# Implementation Plan: Rage Clicks

**Spec**: [spec.md](spec.md) · **Date**: 2026-10-24

## Summary

Detect bursts in the SDK, carry them as `action.rage: true`, count them in a new additive table, and report them
through one admin route, one console page, and one MCP tool, mirroring the Campaigns report (spec 022).

## Technical context

- **SDK** (`packages/browser-sdk/src/actions.ts`): per-control timestamps in a bounded map; detection before the
  duplicate filter; `detail > 0` only; cooldown and per-minute caps. `index.ts` flushes bursts as a third request.
- **Contract** (`packages/event-contracts`): `action.rage` const true in the action schema and `ActionData`.
- **Backend** (`apps/ingest-worker`): `expandActionEvent` marks a burst; `d1-repositories.ts` routes it to
  `rage-rollups.ts` (statements guarded by the `dashboard_seen_events` nonce, run after the other rollups and
  tolerant of a missing table); `getRageClicksReport`; admin route `analytics/rage-clicks` with `needingSchema`.
  Retention and purge lists gain the new table. `EXPECTED_SCHEMA_VERSION` 7.
- **Local API** (`apps/local-ops-api`): proxy route `GET /api/projects/:id/analytics/rage-clicks`.
- **Console** (`apps/admin-web`): `RageClicksPage`, `useRageClicksReport`, `RageClickTables`, router entry after
  Events.
- **MCP** (`apps/cli/src/mcp/server.ts`): `get_rage_clicks`.

## Constitution check

- **Privacy-minimal**: counts only, no new identifier, no position; review in `docs/privacy/rage-clicks-review.md`.
- **Minimal infrastructure**: one table, one row per control per minute, no new request except a burst; no new
  secret, binding or service.
- **Safety**: caps in the SDK, bounded report, additive migration, old backends reject only the burst.
- **Accessibility**: same page structure as Campaigns; axe checks in both themes.

## Cost

One row per control per minute with bursts, removed at 32 days. Reads: six bounded statements per report.

# Feature Specification: Rage Clicks

**Feature Branch**: `024-rage-clicks`

**Created**: 2026-10-24

**Status**: Implemented for v0.12.0; awaiting the clean-context QA review and the release owner's go/no-go.

**Input**: "Let's do 0.12 a dedicated release for rage clicks." Dead clicks were considered and dropped from
scope (see Decisions). Backlog entry: friction signals, WSJF 1.6 as bundled; as rage clicks only, size 3,
(BV 4 + TC 2 + RR 2) / 3 = 2.7 [guess] (`research/pendo-usage-analytics-wsjf.md`).

## Decisions (2026-10-24)

| #   | Question                         | Decision                                                                                                                                                                                                                         |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | What is a rage click             | 3 or more mouse or touch clicks on the same recorded control (same page, name, kind, destination) within 1000 ms.                                                                                                              |
| Q2  | Where it is detected             | In the SDK, before the 500 ms duplicate filter (which would drop the quick repeats). Keyboard and programmatic clicks (`detail` 0) never count: a held Enter repeats clicks without frustration.                                 |
| Q3  | Volume bounds                    | At most one burst per control per 5 s and 20 bursts per minute per page load. The existing 100 actions per minute cap is unchanged and bursts do not use it.                                                                    |
| Q4  | Wire format                      | The existing action event with `action.rage: true` (schema: `const true`). The burst is an extra signal, not a click: it never adds to action counts.                                                                           |
| Q5  | Old backends                     | The SDK sends bursts in their own request, after page views and ordinary actions. A backend older than 0.12 rejects only that request (400), and the SDK drops it as a permanent rejection.                                       |
| Q6  | Storage                          | New table `dashboard_minute_rage_clicks` (count per minute, page, name, kind, destination) in migration 0007, plus an availability row. No visitor digest table: a burst is a count, not a person. Existing action tables are untouched. |
| Q7  | Report                           | `GET /v1/admin/projects/:id/analytics/rage-clicks` (range, `source_id`, optional exact `page` and `action`). Totals (bursts, all clicks), trend, at most 50 controls with their own click totals, exact "Other".                  |
| Q8  | Surfaces                         | Console page **Rage clicks** after Events (view-only, no filters in the UI); MCP tool `get_rage_clicks`; docs; skill. No CLI command.                                                                                            |
| Q9  | Stale database                   | Burst counts run in their own batch after the other rollups, so a database without 0007 loses only the bursts. The report answers `503 database_update_needed`, as for campaigns.                                                |
| Q10 | Dead clicks                      | Out of scope. They need a DOM or network observer after each click and listening to non-interactive elements (wider collection), and give noisy numbers.                                                                          |
| Q11 | Visitors per burst               | Not stored (see the privacy review). The report cannot say how many different people were affected.                                                                                                                              |

## User Scenarios & Testing _(mandatory)_

### User Story 1 - See which controls frustrate visitors (Priority: P1)

As a website owner, I open **Rage clicks** and see the buttons and links people click repeatedly, so I can check
whether they respond.

**Independent Test**: Click a recorded button three times within a second on a site running the SDK. Within the
processing delay, Rage clicks lists that control with 1 burst and the clicks recorded on it.

**Acceptance Scenarios**:

1. **Given** 3 mouse clicks on one button within 1 s, **Then** exactly one action event with `rage: true` is sent
   (plus the ordinary click events), in a separate request.
2. **Given** slow clicks (over 1 s apart), clicks on different controls, or keyboard activation, **Then** no
   burst is sent.
3. **Given** a long burst, **Then** at most one burst per 5 s per control, and 20 a minute overall, are sent.
4. **Given** a burst, **When** it is aggregated, **Then** click counts and click visitors are unchanged and only
   the rage table gains a count; a replayed burst counts once.
5. **Given** a range with no bursts, **Then** the page explains what a burst is instead of showing empty tables.
6. **Given** more than 50 controls, **Then** the rest are summed as Other and `sum(rows) + other = total`.

### User Story 2 - Ask my assistant (Priority: P1)

`get_rage_clicks` returns the same report, trimmed to `limit`, with the environment and range named, and says
control names are untrusted text.

### User Story 3 - Privacy and safe rollout (Priority: P1)

No position, element path, text, visitor or session is read or stored for a burst; the detection adds no network
request unless a burst happens; an old backend or an un-migrated database never loses page views or clicks.

## Requirements

- **FR-001** The SDK MUST detect bursts per Q1 to Q3 and MUST NOT read anything it does not already read for actions.
- **FR-002** The event schema MUST accept `action.rage` only as `true`.
- **FR-003** The backend MUST count a burst in `dashboard_minute_rage_clicks` once per event id and MUST NOT change
  action counts.
- **FR-004** The report MUST be bounded (50 controls) and exact, scoped by project and role like the actions report.
- **FR-005** A database without migration 0007 MUST keep recording page views and clicks and answer the report with
  `database_update_needed`.
- **FR-006** The console page MUST meet WCAG 2.2 AA in light and dark, at 320 px and 200% zoom, and offer no
  state-changing control.
- **FR-007** Docs, skill, release notes and a privacy review MUST ship with the feature.

## Out of scope

Dead clicks, click positions or heatmaps, visitors per burst, per-burst severity, alerting, UI filters (the API and
tool accept `page` and `action`).

# Data Model: Rage Clicks

## Event

`com.vizoalica.action.v1` with `data.action.rage: true` (optional; `const true`). All other fields are as for an
ordinary action: `page`, `action.name`, `action.kind`, optional `action.destination`, `visitor`, `session`. The
visitor and session are used for the replay-safe event digest only and are not stored with the burst.

## Tables (migration `0007_rage_click_reports.sql`)

| Table                              | Columns                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboard_minute_rage_clicks`     | `project_id`, `source_id`, `minute_utc`, `page_path`, `action_name`, `action_kind`, `destination` (primary key), `burst_count` (>= 0)                   |
| `dashboard_rage_click_availability` | `id` (1), `available_from_utc`: when bursts began to be counted, so earlier ranges report `incomplete`                                                |

No visitor digest, session, or position column exists. Rows are removed at retention (32 days) and purge.

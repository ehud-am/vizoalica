# Data Model: Basic Analytics Dashboard

## Daily Unique-User Aggregate

| Field | Rule |
| --- | --- |
| Project and source | Exact configured ownership scope. |
| Date | Server-derived UTC calendar day. |
| Unique-user count | Bounded count of distinct anonymous visitors for that source/day. |

No anonymous visitor ID is retained in the dashboard aggregate or returned by it.

## Dashboard Summary

Project/source identifiers, supported period, inclusive start/end dates, page-view total,
unique-user total, and safe availability state. It excludes raw events, session IDs, visitor IDs,
tokens, and raw URLs.

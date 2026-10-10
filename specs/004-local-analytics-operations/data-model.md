# Data Model: Local Analytics Operations — Web Console Slice

## Website

Represents one instrumented website within a project. It extends the existing source concept.

| Field | Rules |
| --- | --- |
| `id` | Immutable generated identifier. |
| `projectId` | Must reference the owning project; all reads and mutations are scoped through it. |
| `name` | Required operator-facing label, 1–120 characters. |
| `allowedOrigins` | One to ten distinct exact `http` or `https` origins. |
| `publicSourceKey` | Generated public identifier used by the browser snippet; never presented as a secret. |
| `status` | `active`, `disabled`, or `deleted`; only `active` accepts new events. |
| `createdAt` / `updatedAt` | Audit-safe timestamps. |

**Transitions**: `active → disabled → active` for reversible operational control; `active` or `disabled → deleted` for soft deletion. `deleted` is terminal in this slice and preserves historic aggregates and audit evidence.

## Integration Snippet

An operator-facing derived artifact, never a persistence source of truth. It contains the Worker event endpoint, website public source key, optional project identifier, and a placeholder URL for the website-owned short-lived token issuer. It excludes signing secrets and issued JWTs.

## Local Session

Represents a browser's authenticated connection to the loopback API. It has a random, short-lived opaque identifier in a secure local session cookie and an origin that must match the console served by the local API. It authorizes only local console access; the remote administrator credential remains in local API configuration and is never returned to the browser.

## Hourly Page-View Aggregate

The composite key is `projectId`, `websiteId`, and UTC `hour`. `pageViewCount` is incremented only for accepted page-view events. The 24-hour, 7-day, and 30-day totals sum the applicable 24, 168, or 720 buckets.

## Hourly Visitor Presence

The composite key is `projectId`, `websiteId`, UTC `hour`, and `visitorDigest`. The digest is a keyed non-reversible internal value. Insertion is idempotent: a duplicate digest in the same bucket does not create another row. A summary counts distinct digests across the selected window and never returns a digest.

## Analytics Summary

`projectId` and `websiteId` must belong together. `window` is exactly `24h`, `7d`, or `30d`; `startUtc` and `endUtc` define a half-open rolling window `[startUtc, endUtc)`. `pageViews` and `uniqueUsers` are non-negative totals. `availability` is `complete`, `processing`, or `unavailable`. `processing` includes the latest completed aggregate timestamp and clearly labels results as incomplete; `unavailable` returns no totals. Incomplete data is never represented as complete.

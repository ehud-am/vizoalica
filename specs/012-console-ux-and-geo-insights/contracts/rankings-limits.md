# Contract: Ranking Result Limits (Worker overview response)

Applies to `GET /v1/admin/projects/{projectId}/analytics` and the console's pass-through.

## Change

The response shape is unchanged. `rankings.*` is still `{ items, otherCount, total }`. Only the
number of `items` changes.

| Ranking | Before | After |
|---|---|---|
| `countries` | top 10 | up to 300 (complete for all real countries) |
| `pagePaths`, `referrers`, `userAgents` | top 10 | up to 100 |

- `items` are ordered by count descending, then label ascending.
- `otherCount` is the sum of rows beyond the limit. `total` is the sum of all rows.
- `distributions.*` are unchanged (top 11 plus `Other`).
- Response size remains bounded (at most about 400 rows across rankings).

## Compatibility

- An older Worker returning at most 10 items is valid. The console shows what it receives and
  labels the remainder as "Other".
- No new fields, no new endpoints, no change to authorization or project isolation.

## Tests

- Contract: with 12 countries of data, `countries.items` has 12 entries and `otherCount` is 0.
- Contract: with more than 100 distinct page paths, `pagePaths.items` has 100 entries and
  `otherCount` is the remainder.
- Existing isolation tests continue to pass unchanged.

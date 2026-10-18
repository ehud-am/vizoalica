# Data Model: Exclude Internal Traffic

## Migration `0006_internal_traffic_exclusion.sql` (additive)

```sql
ALTER TABLE sources ADD COLUMN excluded_addresses_json TEXT NOT NULL DEFAULT '[]';

CREATE TABLE dashboard_excluded_hits (
  project_id TEXT NOT NULL,
  source_id  TEXT NOT NULL,
  day_utc    TEXT NOT NULL,                       -- YYYY-MM-DD
  hit_count  INTEGER NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  PRIMARY KEY (project_id, source_id, day_utc)
);
```

Retention: rows with `day_utc` before the 32-day boundary are deleted by the scheduled job. Purge: listed with
the other per-website tables.

## Address entries

Canonical forms stored: IPv4 dotted decimal (`203.0.113.7`), IPv4 CIDR (`203.0.113.0/24`, a single address is
stored without `/32`), IPv6 compressed lowercase (`2001:db8::1`), IPv6 CIDR (`2001:db8::/48`). Host bits in a
CIDR are zeroed (`203.0.113.9/24` is stored as `203.0.113.0/24`). IPv4-mapped IPv6 input is stored as IPv4.
Limit: 25 entries, each at most 49 characters.

## Entities in API

`Source.excludedAddresses?: string[]` (admin, owner) and `Source.excludedAddressCount: number` (all roles).
`ExcludedHitsReport { total, days: [{ day, count }] }`. See
[contracts/exclusion-api.md](contracts/exclusion-api.md).

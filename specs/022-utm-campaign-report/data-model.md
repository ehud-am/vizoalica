# Data Model: UTM Campaign Report

## Event contract change

`com.vizoalica.page_view.v1` data gains one optional property (additive, same event type and version):

```json
"campaign": {
  "type": "object",
  "properties": {
    "source":   { "type": "string", "maxLength": 64 },
    "medium":   { "type": "string", "maxLength": 64 },
    "campaign": { "type": "string", "maxLength": 64 }
  },
  "additionalProperties": false,
  "minProperties": 1
}
```

Absent means "no campaign". The field is sent only on the first page view of a page load.

## Cleaning rules (`cleanCampaignValue`)

Input any string. Steps, in order: take at most the first 400 characters; trim and collapse whitespace; lowercase;
`redactLabel` (email -> `[email]`, six or more digits -> `[number]`, token-shaped word -> `[token]`); keep only
`\p{L}`, `\p{N}`, space, `_ - . + : / [ ]` (the brackets only so the placeholders survive); cut to 64; trim.
Empty result means absent. Idempotent.

## Tables (migration `0005_campaign_reports.sql`, additive)

```sql
dashboard_minute_campaigns (
  project_id, source_id, minute_utc,
  utm_source TEXT NOT NULL, utm_medium TEXT NOT NULL, utm_campaign TEXT NOT NULL,   -- '' means not set
  page_view_count INTEGER NOT NULL DEFAULT 0 CHECK (page_view_count >= 0),
  PRIMARY KEY (project_id, source_id, minute_utc, utm_source, utm_medium, utm_campaign))

dashboard_minute_campaign_visitors (
  project_id, source_id, minute_utc, utm_source, utm_medium, utm_campaign,
  visitor_digest TEXT NOT NULL,
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('source-local','project-supplied')),
  PRIMARY KEY (project_id, source_id, minute_utc, utm_source, utm_medium, utm_campaign, visitor_digest, identity_kind))

dashboard_campaign_availability (id INTEGER PRIMARY KEY CHECK (id = 1), available_from_utc TEXT NOT NULL)
```

The availability row is inserted at migration time. Retention: `minute_utc` older than 32 days. Purge: both minute
tables are listed with the other per-website tables.

## Report entities (API)

See [contracts/campaigns-report-api.md](contracts/campaigns-report-api.md).

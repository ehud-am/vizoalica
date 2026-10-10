-- Custom event reports.
-- Additive only: four new tables, no change to existing ones.
--
-- Custom events sent with `vizoalica.track(name, { properties })` were collected but never
-- reported. These tables hold per-minute counts, like the page view and action tables. Only events
-- received after this migration are counted; `dashboard_custom_event_availability` records when
-- that began, so a range that starts earlier is reported as partly available.
--
-- `page_path` is a page key (identifiers already replaced by `:id`), '' for an event sent by an
-- SDK that does not report a page.
CREATE TABLE dashboard_minute_custom_events (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  page_path TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  PRIMARY KEY (project_id, source_id, minute_utc, page_path, event_name)
);

-- Distinct visitors per event and minute, kept as keyed digests, never raw identifiers.
CREATE TABLE dashboard_minute_custom_event_visitors (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  page_path TEXT NOT NULL,
  event_name TEXT NOT NULL,
  visitor_digest TEXT NOT NULL,
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('source-local', 'project-supplied')),
  PRIMARY KEY (project_id, source_id, minute_utc, page_path, event_name, visitor_digest, identity_kind)
);

-- How often each property value occurred with an event, per minute. Only text and true/false
-- values are kept, redacted and cut to 64 characters; numbers are not, because they are rarely
-- worth grouping and would multiply the rows.
CREATE TABLE dashboard_minute_custom_event_properties (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  event_name TEXT NOT NULL,
  property_key TEXT NOT NULL,
  property_value TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  PRIMARY KEY (project_id, source_id, minute_utc, event_name, property_key, property_value)
);

CREATE TABLE dashboard_custom_event_availability (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  available_from_utc TEXT NOT NULL
);
INSERT INTO dashboard_custom_event_availability (id, available_from_utc)
  VALUES (1, strftime('%Y-%m-%dT%H:%M:00.000Z', 'now'));

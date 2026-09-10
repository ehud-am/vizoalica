CREATE TABLE IF NOT EXISTS dashboard_minute_totals (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  page_view_count INTEGER NOT NULL DEFAULT 0 CHECK (page_view_count >= 0),
  PRIMARY KEY (project_id, source_id, minute_utc)
);

CREATE TABLE IF NOT EXISTS dashboard_minute_dimensions (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  dimension_kind TEXT NOT NULL CHECK (dimension_kind IN ('page_path', 'country', 'user_agent', 'browser', 'os', 'device', 'traffic', 'referrer')),
  dimension_value TEXT NOT NULL,
  taxonomy_version INTEGER NOT NULL DEFAULT 1 CHECK (taxonomy_version >= 1),
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  PRIMARY KEY (project_id, source_id, minute_utc, dimension_kind, dimension_value, taxonomy_version)
);

CREATE TABLE IF NOT EXISTS dashboard_minute_visitors (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  visitor_digest TEXT NOT NULL,
  digest_version INTEGER NOT NULL DEFAULT 1,
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('source-local', 'project-supplied')),
  PRIMARY KEY (project_id, source_id, minute_utc, visitor_digest, digest_version, identity_kind)
);

CREATE TABLE IF NOT EXISTS dashboard_seen_events (
  project_id TEXT NOT NULL,
  event_digest TEXT NOT NULL,
  received_at TEXT NOT NULL,
  request_nonce TEXT,
  digest_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (project_id, event_digest, digest_version)
);

CREATE TABLE IF NOT EXISTS dashboard_aggregate_watermarks (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  expanded_from_utc TEXT NOT NULL,
  last_completed_at TEXT NOT NULL,
  taxonomy_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (project_id, source_id)
);

CREATE INDEX IF NOT EXISTS dashboard_minute_totals_source_range ON dashboard_minute_totals(project_id, source_id, minute_utc);
CREATE INDEX IF NOT EXISTS dashboard_minute_totals_project_range ON dashboard_minute_totals(project_id, minute_utc, source_id);
CREATE INDEX IF NOT EXISTS dashboard_minute_dimensions_source_range ON dashboard_minute_dimensions(project_id, source_id, dimension_kind, minute_utc, dimension_value);
CREATE INDEX IF NOT EXISTS dashboard_minute_dimensions_project_range ON dashboard_minute_dimensions(project_id, dimension_kind, minute_utc, source_id, dimension_value);
CREATE INDEX IF NOT EXISTS dashboard_minute_visitors_source_range ON dashboard_minute_visitors(project_id, source_id, minute_utc, visitor_digest);
CREATE INDEX IF NOT EXISTS dashboard_minute_visitors_project_range ON dashboard_minute_visitors(project_id, minute_utc, source_id, visitor_digest);
CREATE INDEX IF NOT EXISTS dashboard_seen_events_retention ON dashboard_seen_events(received_at);

INSERT OR IGNORE INTO dashboard_aggregate_watermarks (
  project_id, source_id, expanded_from_utc, last_completed_at, taxonomy_version
)
SELECT
  project_id,
  id,
  strftime('%Y-%m-%dT%H:%M:00.000Z', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  1
FROM sources;

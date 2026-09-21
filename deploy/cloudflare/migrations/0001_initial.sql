-- Fresh schema baseline for Vizoalica 0.5.0.
-- This release supports new, empty D1 databases only.

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('production', 'demo')),
  default_retention_days INTEGER NOT NULL,
  quota_policy_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted'))
);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  public_source_key TEXT NOT NULL UNIQUE,
  allowed_origins_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'deleted', 'rotating')),
  quota_policy_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX sources_project_status ON sources(project_id, status);

CREATE TABLE quota_policies (
  id TEXT PRIMARY KEY,
  max_request_bytes INTEGER NOT NULL,
  max_events_per_batch INTEGER NOT NULL,
  max_events_per_token INTEGER NOT NULL,
  max_events_per_second INTEGER NOT NULL,
  max_events_per_day INTEGER NOT NULL,
  max_property_count INTEGER NOT NULL,
  max_property_value_length INTEGER NOT NULL,
  retention_days INTEGER NOT NULL
);

CREATE TABLE ingestion_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT,
  source_id TEXT,
  decision TEXT NOT NULL,
  accepted_count INTEGER NOT NULL,
  rejected_count INTEGER NOT NULL,
  reason_codes_json TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE dashboard_rollups (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_type TEXT NOT NULL,
  page_path TEXT NOT NULL DEFAULT '',
  event_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, source_id, event_date, event_type, page_path)
);

CREATE INDEX dashboard_rollups_project_source_date_type
  ON dashboard_rollups (project_id, source_id, event_date, event_type);

CREATE TABLE quota_windows (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  window_kind TEXT NOT NULL CHECK (window_kind IN ('second', 'day')),
  window_start TEXT NOT NULL,
  accepted_events INTEGER NOT NULL DEFAULT 0,
  accepted_bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, source_id, window_kind, window_start)
);

CREATE TABLE administrative_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  operation TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied')),
  project_id TEXT,
  source_id TEXT,
  reason_code TEXT NOT NULL
);

CREATE TABLE dashboard_daily_users (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  event_date TEXT NOT NULL,
  unique_user_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, source_id, event_date)
);

CREATE INDEX dashboard_daily_users_project_source_date
  ON dashboard_daily_users (project_id, source_id, event_date);

CREATE TABLE dashboard_hourly_page_views (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  hour_utc TEXT NOT NULL,
  page_view_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, source_id, hour_utc)
);

CREATE TABLE dashboard_hourly_visitors (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  hour_utc TEXT NOT NULL,
  visitor_digest TEXT NOT NULL,
  PRIMARY KEY (project_id, source_id, hour_utc, visitor_digest)
);

CREATE INDEX dashboard_hourly_page_views_lookup
  ON dashboard_hourly_page_views(project_id, source_id, hour_utc);

CREATE INDEX dashboard_hourly_visitors_lookup
  ON dashboard_hourly_visitors(project_id, source_id, hour_utc);

CREATE TABLE dashboard_minute_totals (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  page_view_count INTEGER NOT NULL DEFAULT 0 CHECK (page_view_count >= 0),
  PRIMARY KEY (project_id, source_id, minute_utc)
);

CREATE TABLE dashboard_minute_dimensions (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  dimension_kind TEXT NOT NULL CHECK (dimension_kind IN ('page_path', 'country', 'user_agent', 'browser', 'os', 'device', 'traffic', 'referrer')),
  dimension_value TEXT NOT NULL,
  taxonomy_version INTEGER NOT NULL DEFAULT 1 CHECK (taxonomy_version >= 1),
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  PRIMARY KEY (project_id, source_id, minute_utc, dimension_kind, dimension_value, taxonomy_version)
);

CREATE TABLE dashboard_minute_visitors (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  visitor_digest TEXT NOT NULL,
  digest_version INTEGER NOT NULL DEFAULT 1,
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('source-local', 'project-supplied')),
  PRIMARY KEY (project_id, source_id, minute_utc, visitor_digest, digest_version, identity_kind)
);

CREATE TABLE dashboard_seen_events (
  project_id TEXT NOT NULL,
  event_digest TEXT NOT NULL,
  received_at TEXT NOT NULL,
  request_nonce TEXT,
  digest_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (project_id, event_digest, digest_version)
);

CREATE TABLE dashboard_aggregate_watermarks (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  expanded_from_utc TEXT NOT NULL,
  last_completed_at TEXT NOT NULL,
  taxonomy_version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (project_id, source_id)
);

-- What visitors clicked, per minute. `page_path` is a page key (identifiers already replaced by
-- `:id`); `destination` is '' for anything that is not a link, otherwise origin plus path.
CREATE TABLE dashboard_minute_actions (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  page_path TEXT NOT NULL,
  action_name TEXT NOT NULL,
  action_kind TEXT NOT NULL CHECK (action_kind IN ('button', 'link', 'other')),
  destination TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  PRIMARY KEY (project_id, source_id, minute_utc, page_path, action_name, action_kind, destination)
);

-- Distinct visitors per action and minute, kept as keyed digests, never raw identifiers. The
-- primary keys serve every read of both action tables, so neither has a secondary index: each one
-- would add a write to every action.
CREATE TABLE dashboard_minute_action_visitors (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  page_path TEXT NOT NULL,
  action_name TEXT NOT NULL,
  action_kind TEXT NOT NULL CHECK (action_kind IN ('button', 'link', 'other')),
  destination TEXT NOT NULL,
  visitor_digest TEXT NOT NULL,
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('source-local', 'project-supplied')),
  PRIMARY KEY (project_id, source_id, minute_utc, page_path, action_name, action_kind, destination, visitor_digest, identity_kind)
);

CREATE INDEX dashboard_minute_totals_source_range
  ON dashboard_minute_totals(project_id, source_id, minute_utc);
CREATE INDEX dashboard_minute_totals_project_range
  ON dashboard_minute_totals(project_id, minute_utc, source_id);
CREATE INDEX dashboard_minute_dimensions_source_range
  ON dashboard_minute_dimensions(project_id, source_id, dimension_kind, minute_utc, dimension_value);
CREATE INDEX dashboard_minute_dimensions_project_range
  ON dashboard_minute_dimensions(project_id, dimension_kind, minute_utc, source_id, dimension_value);
CREATE INDEX dashboard_minute_visitors_source_range
  ON dashboard_minute_visitors(project_id, source_id, minute_utc, visitor_digest);
CREATE INDEX dashboard_minute_visitors_project_range
  ON dashboard_minute_visitors(project_id, minute_utc, source_id, visitor_digest);
CREATE INDEX dashboard_seen_events_retention ON dashboard_seen_events(received_at);

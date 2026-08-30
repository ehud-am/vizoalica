CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('production', 'demo')),
  default_retention_days INTEGER NOT NULL,
  quota_policy_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  public_source_key TEXT NOT NULL UNIQUE,
  allowed_origins_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'rotating'))
);
CREATE TABLE IF NOT EXISTS quota_policies (
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
CREATE TABLE IF NOT EXISTS ingestion_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT,
  source_id TEXT,
  decision TEXT NOT NULL,
  accepted_count INTEGER NOT NULL,
  rejected_count INTEGER NOT NULL,
  reason_codes_json TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dashboard_rollups (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_type TEXT NOT NULL,
  page_path TEXT NOT NULL DEFAULT '',
  event_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, source_id, event_date, event_type, page_path)
);
CREATE TABLE IF NOT EXISTS quota_windows (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  window_kind TEXT NOT NULL CHECK (window_kind IN ('second', 'day')),
  window_start TEXT NOT NULL,
  accepted_events INTEGER NOT NULL DEFAULT 0,
  accepted_bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, source_id, window_kind, window_start)
);

CREATE TABLE IF NOT EXISTS dashboard_hourly_page_views (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  hour_utc TEXT NOT NULL,
  page_view_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, source_id, hour_utc)
);
CREATE TABLE IF NOT EXISTS dashboard_hourly_visitors (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  hour_utc TEXT NOT NULL,
  visitor_digest TEXT NOT NULL,
  PRIMARY KEY (project_id, source_id, hour_utc, visitor_digest)
);
CREATE INDEX IF NOT EXISTS dashboard_hourly_page_views_lookup ON dashboard_hourly_page_views(project_id, source_id, hour_utc);
CREATE INDEX IF NOT EXISTS dashboard_hourly_visitors_lookup ON dashboard_hourly_visitors(project_id, source_id, hour_utc);

-- Rebuild sources so soft deletion is a first-class, terminal state and local
-- operators have stable display metadata without changing the public source key.
ALTER TABLE sources RENAME TO sources_before_local_operations;
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
INSERT INTO sources (
  id, project_id, name, public_source_key, allowed_origins_json, status,
  quota_policy_id, created_at, updated_at
)
SELECT
  id, project_id, id, public_source_key, allowed_origins_json, status,
  quota_policy_id, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM sources_before_local_operations;
DROP TABLE sources_before_local_operations;
CREATE INDEX IF NOT EXISTS sources_project_status ON sources(project_id, status);

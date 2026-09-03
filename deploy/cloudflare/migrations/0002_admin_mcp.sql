ALTER TABLE sources ADD COLUMN quota_policy_id TEXT;
UPDATE sources
SET quota_policy_id = (
  SELECT quota_policy_id FROM projects WHERE projects.id = sources.project_id
)
WHERE quota_policy_id IS NULL;

CREATE TABLE IF NOT EXISTS administrative_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  operation TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied')),
  project_id TEXT,
  source_id TEXT,
  reason_code TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS dashboard_rollups_project_source_date_type
  ON dashboard_rollups (project_id, source_id, event_date, event_type);

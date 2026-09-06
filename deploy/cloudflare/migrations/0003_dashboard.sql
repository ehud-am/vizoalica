CREATE TABLE IF NOT EXISTS dashboard_daily_users (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  event_date TEXT NOT NULL,
  unique_user_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, source_id, event_date)
);

CREATE INDEX IF NOT EXISTS dashboard_daily_users_project_source_date
  ON dashboard_daily_users (project_id, source_id, event_date);

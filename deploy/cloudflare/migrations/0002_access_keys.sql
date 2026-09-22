-- Access keys for the analyst and website-owner roles, and who performed an audited write.
-- Additive only: new table, new index, and one new nullable column. Safe to apply to a fresh
-- database (where the two action tables already exist, from 0001) and to an existing 0.5.2 or
-- 0.6.x database (where they do not, so this migration creates them).

CREATE TABLE access_keys (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('analyst', 'owner')),
  secret_hash TEXT NOT NULL,
  project_id TEXT,
  source_id TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  CHECK (source_id IS NULL OR project_id IS NOT NULL)
);

CREATE INDEX access_keys_project ON access_keys(project_id);

ALTER TABLE administrative_audit ADD COLUMN actor TEXT;

CREATE TABLE IF NOT EXISTS dashboard_minute_actions (
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

CREATE TABLE IF NOT EXISTS dashboard_minute_action_visitors (
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

-- Exclude internal traffic.
-- Additive only: one new column with a default on `sources`, and one new table.
--
-- excluded_addresses_json is a JSON array of up to 25 IP addresses or ranges (CIDR) whose events a
-- website drops instead of storing. It is operator configuration, never visitor data, and it is not
-- written to logs or the audit table. The default keeps every existing website counting everything.
ALTER TABLE sources ADD COLUMN excluded_addresses_json TEXT NOT NULL DEFAULT '[]';

-- How many events were dropped per website and UTC day, so an owner can see that exclusion works
-- (and is not hiding real visitors). It holds a count only: no address and no identifier.
CREATE TABLE dashboard_excluded_hits (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  day_utc TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
  PRIMARY KEY (project_id, source_id, day_utc)
);

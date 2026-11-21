-- Page labels: a display name and an optional group for a page key of one website.
-- Additive only: one new table. Labels are website configuration, never visitor data.
-- They apply to everything already counted, because they are read when a report is shown,
-- and they can be replaced or removed at any time without changing a count.
CREATE TABLE page_labels (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  page_key TEXT NOT NULL,
  name TEXT NOT NULL,
  group_name TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_id, page_key)
);

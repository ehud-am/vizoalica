-- Goals, page grouping rules, and the pixel path cap.
-- Additive only: one new column with a default on `sources`, and two new tables.
--
-- grouping_rules_json is a JSON array of up to 25 rules, each mapping a path pattern to a page key
-- (for example /blog/* to /blog/:post). Rules are applied when an event is received, so they only
-- affect events counted after they are saved. It is website configuration, never visitor data.
ALTER TABLE sources ADD COLUMN grouping_rules_json TEXT NOT NULL DEFAULT '[]';

-- A conversion goal of one website: a page view of a path, a click action, or a custom event.
-- It holds a definition only. Conversions are read from the existing per-minute counts, so a goal
-- also counts what happened before it was created (within retention).
CREATE TABLE goals (
  id TEXT NOT NULL PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('page', 'action', 'event')),
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at TEXT NOT NULL
);
CREATE INDEX goals_source ON goals(project_id, source_id, status);

-- The distinct page paths the no-JavaScript pixel has counted for a website, so the number of
-- paths can be capped. A path and a first-seen time only: no visitor data.
CREATE TABLE pixel_paths (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  path TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY (source_id, path)
);

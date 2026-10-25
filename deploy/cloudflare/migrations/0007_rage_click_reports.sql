-- Rage click reports.
-- Additive only: two new tables, no change to existing ones.
--
-- A rage click is a burst of rapid clicks on one control (3 within a second), reported by the browser
-- SDK as one extra signal beside the clicks themselves. It is counted per minute, control and page,
-- like the action table, and carries no visitor identifier and no click position: a count only.
-- Only bursts received after this migration are counted; `dashboard_rage_click_availability` records
-- when that began, so a range that starts earlier is reported as partly available.
CREATE TABLE dashboard_minute_rage_clicks (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  page_path TEXT NOT NULL,
  action_name TEXT NOT NULL,
  action_kind TEXT NOT NULL CHECK (action_kind IN ('button', 'link', 'other')),
  destination TEXT NOT NULL,
  burst_count INTEGER NOT NULL DEFAULT 0 CHECK (burst_count >= 0),
  PRIMARY KEY (project_id, source_id, minute_utc, page_path, action_name, action_kind, destination)
);

CREATE TABLE dashboard_rage_click_availability (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  available_from_utc TEXT NOT NULL
);
INSERT INTO dashboard_rage_click_availability (id, available_from_utc)
  VALUES (1, strftime('%Y-%m-%dT%H:%M:00.000Z', 'now'));

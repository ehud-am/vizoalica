-- UTM campaign reports.
-- Additive only: three new tables, no change to existing ones.
--
-- A page view that carried utm_source, utm_medium or utm_campaign on its landing URL is counted here
-- per minute, like the page view and custom event tables. A value that was not in the link is the
-- empty string. Values are labels the site owner put in the link, cleaned and cut to 64 characters
-- before they reach this table. Only page views received after this migration are counted;
-- `dashboard_campaign_availability` records when that began, so a range that starts earlier is
-- reported as partly available.
CREATE TABLE dashboard_minute_campaigns (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  utm_source TEXT NOT NULL,
  utm_medium TEXT NOT NULL,
  utm_campaign TEXT NOT NULL,
  page_view_count INTEGER NOT NULL DEFAULT 0 CHECK (page_view_count >= 0),
  PRIMARY KEY (project_id, source_id, minute_utc, utm_source, utm_medium, utm_campaign)
);

-- Distinct visitors per campaign and minute, kept as keyed digests, never raw identifiers.
CREATE TABLE dashboard_minute_campaign_visitors (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  minute_utc TEXT NOT NULL,
  utm_source TEXT NOT NULL,
  utm_medium TEXT NOT NULL,
  utm_campaign TEXT NOT NULL,
  visitor_digest TEXT NOT NULL,
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('source-local', 'project-supplied')),
  PRIMARY KEY (project_id, source_id, minute_utc, utm_source, utm_medium, utm_campaign, visitor_digest, identity_kind)
);

CREATE TABLE dashboard_campaign_availability (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  available_from_utc TEXT NOT NULL
);
INSERT INTO dashboard_campaign_availability (id, available_from_utc)
  VALUES (1, strftime('%Y-%m-%dT%H:%M:00.000Z', 'now'));

-- Site specs: the latest spec ("ontology") and operator decisions of one website.
-- Additive only: one new table. A spec is website configuration, never visitor data: names and
-- structure for pages, actions, events, campaigns, funnels and paths, with no personal data.
-- Only the latest version is kept; history belongs to the operator's git repository when they use one.
CREATE TABLE site_specs (
  project_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  rendered_md TEXT NOT NULL,
  git_sha TEXT NOT NULL DEFAULT '',
  applied_at TEXT NOT NULL,
  applied_by TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (source_id)
);

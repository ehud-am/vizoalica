-- Static websites and cookieless visitor counting.
-- Additive only: one new column with a default, and one new table.
--
-- token_required: 1 keeps the earlier behaviour (every batch needs a signed token from the
-- website's token endpoint). 0 also accepts unsigned batches from the website's allowed origins,
-- so a static site needs only a script tag. Existing websites keep 1.
ALTER TABLE sources ADD COLUMN token_required INTEGER NOT NULL DEFAULT 1 CHECK (token_required IN (0, 1));

-- One random salt per UTC day. Unique visitors are counted with a digest of (salt, website,
-- visitor address, user agent), so nothing is stored in the browser. The scheduled job deletes a
-- day's salt once the day is over, after which nobody can link that day's digests to a visitor
-- or to another day.
CREATE TABLE daily_visitor_salts (
  day_utc TEXT PRIMARY KEY,
  salt TEXT NOT NULL,
  created_at TEXT NOT NULL
);

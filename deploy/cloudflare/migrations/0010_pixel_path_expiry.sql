-- Pixel path slots expire. A path not seen for the retention period (32 days) is deleted by the
-- retention job, which frees its slot under the per-website path cap. One new column, then a
-- backfill of that column only: existing rows start with their first-seen time, so they expire on
-- the same schedule. The UPDATE touches nothing but the column added above, so it loses no data.
ALTER TABLE pixel_paths ADD COLUMN last_seen_at TEXT;
UPDATE pixel_paths SET last_seen_at = first_seen_at;
-- vizoalica:non-additive

# Feature Specification: Goals, Page Grouping Rules, and Pixel Path Limit

**Created**: 2026-11-03 · **Status**: Implemented for v0.14.0 (GitHub issues #62, #63, #82, #83, #69, #84)

**Input**: v0.14.0 scope chosen from the Pendo usage-analytics WSJF backlog and the 2026-10-31 code review.

## User scenarios

1. A website owner defines what counts as a conversion (a page view of a path, a click action, a custom event)
   and sees conversions, distinct visitors, and the rate per goal. (#63)
2. An owner counts many pages as one (`/blog/*` as `/blog/:post`) with simple patterns. (#62)
3. An owner who uses the no-script pixel cannot have their tables filled with made-up paths by someone who knows
   the public key. (#82)
4. An assistant user gets a correct status for a no-token website and a correct period comparison. (#83)
5. The access keys page "add" control follows the design language: "+ Add key", one line. (#69)

## Requirements

- **R1 (goals)** A website has up to 20 goals: `kind` page | action | event, a `name` (80 characters), and a
  `target` (page key up to 512, otherwise 80). Management (create, delete) needs the admin or an owner key in scope;
  reading needs any role in scope. Soft-deleted goals are not reported and are purged with the website.
- **R2 (goals report)** For one website and a range of at most 30 days: totals (page views, visitors), and per goal
  conversions, distinct visitors (null for a page goal), rate, and a trend. Conversions are read from the existing
  per-minute counts, so no ingestion change and no new visitor data. A page goal has no visitor figure because page
  views are not kept per visitor; its rate is its share of page views.
- **R3 (grouping)** A website has up to 25 rules `{pattern, key}`. `*` is one whole segment; a final `**` is the
  rest. No regular expressions. First match wins; a `#/route` suffix is kept. Applied in the privacy guard after
  identifier grouping, for page views, actions, custom events, and the pixel. Not retroactive.
- **R4 (pixel cap)** The pixel counts at most `VIZOALICA_PIXEL_MAX_PATHS` (default 100) distinct page keys per
  website. A known path is always counted; a new path past the cap is ignored before quota is touched; the image
  answer is unchanged. The website status reports `pixelPaths {count, max, capReached}`.
- **R5 (assistant)** `get_goals`; `get_website_status` uses website `tokenRequired` and `publicSourceKey`;
  untrusted-text sentence in the server instructions; `compare_periods` default previous end.
- **R6 (compatibility)** A Worker newer than its database answers goals routes with `database_update_needed`
  and keeps ingesting; a database without `pixel_paths` has no cap; sources without the column have no rules.

## Privacy

Goals hold a definition only (no visitor data). Grouping lowers cardinality, so stored data shrinks. `pixel_paths`
holds a path and a first-seen time per website. No new identifier, cookie, or browser storage. Visitor figures reuse
the daily-rotating digests of the existing reports.

## Threat model

- Goal and rule names are site-controlled text: rendered as text in the console, marked untrusted for assistants.
- Rules are plain patterns matched in linear time; length and count limits apply; no regular expressions.
- Goal routes use the existing project and website scope checks; an analyst key is refused writes (403) and
  out-of-scope websites are not found (404). Writes are audited (`create_goal`, `delete_goal`, `update_source`).
- The pixel cap bounds rollup growth from forged paths (finding 1 of the 2026-10-31 review).

## Cost

One column and two small tables. Goals reads run one grouped query per goal (at most 20 goals) over indexed
per-minute tables, only when the report is opened. Rules add no query to ingestion: they ride on the website row
already loaded. The pixel cap adds one conditional insert and one lookup per pixel hit.

## Accessibility

The Goals page and the goals panel use the existing table, form, and button patterns with labelled controls,
keyboard operation, and text alternatives for the rate basis; axe checks run in both themes (end-to-end suite).
The grouping field is a labelled textarea with an associated help text and error.

## Out of scope

Conversions by referrer or campaign, funnels, goal management from the CLI, regex rules, retroactive regrouping.

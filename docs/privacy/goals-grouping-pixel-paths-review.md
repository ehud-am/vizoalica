# Goals, page grouping rules and pixel paths: privacy review

**Status**: Recorded 2026-11-05 for [spec 026](../../specs/026-goals-grouping-pixel-cap/spec.md) (version 0.14.0) and
the path expiry added in 0.14.1. This is the review the constitution requires before any new data field is accepted.
It covers three things 0.14.0 added: conversion goals, page grouping rules and the pixel path list.

## Decisions

| Data                                                      | Decision | Purpose                                                      | Retention                                                                                                          | Access boundary                                                                         | Re-identification risk                                                                                                         |
| --------------------------------------------------------- | -------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Goal** (`goals`: name, kind, target)                    | Approved | Define what counts as a conversion for one website           | Until the goal or its website is deleted (a deleted goal is marked, and removed with the website's purge)          | Admin and website owners in scope write; analysts read; no visitor can read or write it | None. A definition typed by the website owner, never taken from a visitor. Page targets are validated as stored page keys.     |
| **Grouping rules** (`sources.grouping_rules_json`)        | Approved | Count many pages as one (`/blog/* => /blog/:post`)           | Until changed or the website is deleted                                                                            | Same as goals; the Worker reads them when an event arrives                              | None. Configuration, up to 25 rules of plain path characters. Grouping lowers cardinality, so less is stored.                  |
| **Pixel path** (`pixel_paths`: path, first and last seen) | Approved | Cap the number of different paths the no-script pixel counts | 32 days after the path was last seen (same period as the other counts); then the row is deleted and the slot freed | Worker only; the console shows a count and whether the limit is reached, not the list   | Low. A page key chosen by the README owner or, for the public key, by anyone sending an image request; no visitor data stored. |
| **Goal conversions and visitor figures**                  | Approved | Report conversions, distinct visitors and rate               | As the existing per-minute counts (32 days)                                                                        | As the other reports                                                                    | None beyond the existing reports: visitor figures reuse the daily-rotating digests; nothing new identifies a person.           |

## Rules that hold

1. **No new identifier, cookie or browser storage.** Nothing is added to the visitor's browser or to the events the
   script sends.
2. **Goals and rules hold definitions, never visitor data.** Conversions are read from counts that already exist.
3. **A pixel path row holds a path and two times.** It holds no address, agent, digest or other visitor field.
4. **Rows expire.** Pixel path rows are deleted by the daily cleanup 32 days after `last_seen_at`. Goals and rules
   stay while the website exists and are removed when it is purged.
5. **Access follows the website.** Writes need an admin or an owner key in scope; analysts and visitors cannot change
   them. Every change is recorded in the administrative audit log.
6. **Free text is bounded.** Goal names are at most 80 characters and targets 512 (pages) or 80; control characters
   are refused. Console and assistant output treat them as untrusted text.

## Known limits

- A database that has not run change 0010 (`vizoalica deploy <name> --update`) keeps pixel paths until the website
  is purged, because the expiry column does not exist yet. Nothing else differs.
- Labels and targets are chosen by the website owner. If an owner types personal data into a goal name, it is stored
  as typed. The console says goals count events and pages only.

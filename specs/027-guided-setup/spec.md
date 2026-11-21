# Feature Specification: Guided setup (assistant-proposed names, groups and goals)

**Created**: 2026-11-11 · **Status**: Implemented for v0.15.0 · Design: approved 2026-11-11 (CLI-only apply, display-time
labels, funnels deferred).

**Input**: A website manager deploys Vizoalica, lets it collect, then asks an AI assistant on their own computer to
propose names, groups, grouping rules and goals for the discovered pages; they review, adjust, and accept.

## Decisions

| #   | Question                         | Decision                                                                              |
| --- | -------------------------------- | ------------------------------------------------------------------------------------- |
| Q1  | Where does the model run         | On the user's computer, in their own assistant. No model or AI key inside Vizoalica.  |
| Q2  | How is a proposal reviewed       | A JSON mapping file the person edits, then a dry-run diff.                            |
| Q3  | Who writes                       | The CLI (`vizoalica mapping apply`) with the stored credential. MCP stays read-only (spec 021 Q6). |
| Q4  | Where do page names live         | A new display-time table, `page_labels`; retroactive and reversible.                  |
| Q5  | Grouping rules                   | Same as spec 026; forward-only, so the preview lists the page keys each would merge.  |
| Q6  | Funnels                          | Deferred; they need their own design (no visitor sequences are stored).               |
| Q7  | Command name                     | `mapping` (`setup` is reserved by checkout-only commands).                            |

## Requirements

- **R1 (inventory)** `GET /v1/admin/projects/:p/sources/:s/inventory?start&end` (range at most 30 days): up to 300
  page keys with page views, 100 actions (name, kind, count), 100 custom events, 20 referrers, the distinct totals,
  and the website's current grouping rules, goals and labels. Counts only. Any role in scope.
- **R2 (labels)** `GET/PUT /v1/admin/projects/:p/sources/:s/labels`. A label is `{key, name, group}`: key is a page
  key (starts with `/`, no `?`, at most 512), name 1 to 80 characters, group up to 60, no control characters, a
  key once, at most 500. `PUT` replaces the set in one transaction; admin or owner in scope; audited
  (`update_labels`).
- **R3 (CLI)** `vizoalica mapping export <env> [--project] [--website] [--days 1-30] [--out]` and
  `mapping apply <env> <file> [--project] [--website] [--yes]`. Apply shows environment, website and a diff, asks
  (or needs `--yes` without a terminal), then creates goals, saves rules, saves labels. Nothing is removed; the file
  is validated as strictly as the console; a mapping for another environment is refused; limits are checked before
  any write.
- **R4 (assistant)** MCP `get_inventory` (read-only); `get_traffic_overview` adds `pageNames` for the pages shown.
  The skill gains a guided-setup recipe that writes the mapping file and never applies it.
- **R5 (compatibility)** A Worker newer than its database answers the new routes with `database_update_needed`;
  an older Worker answers 404 and the CLI and MCP name the update command.
- **R6 (console)** The page rankings show a page's name beside its key.

## Privacy

Labels are website configuration, not visitor data. The inventory exposes only what reports already show.
Names, keys and counts leave the computer only through the user's own assistant. Site-controlled text is marked
untrusted for assistants and validated on apply.

## Threat model

- Prompt injection through paths, action or event names: the tool descriptions and the skill mark them as data;
  apply cannot do more than the validated file allows, and shows a diff first.
- A model-written file cannot exceed the limits or write outside one website; `apply` refuses another environment.
- An analyst key cannot write labels, rules or goals (403).

## Cost

One small table (at most 500 rows per website). The inventory is five grouped reads over the existing per-minute
tables, only when requested. No ingestion change.

## Out of scope

Funnels, regex rules, retroactive regrouping, MCP write tools, an import screen in the console, labels for actions
or events.

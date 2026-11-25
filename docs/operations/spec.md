---
title: 'Learn your website and keep a spec'
description: "Let an AI assistant learn your website's structure and propose a versioned spec: named pages, actions, events, campaigns, funnels and paths. You review it, then apply it."
---

# Learn your website and keep a spec

A **spec** (the website's ontology) describes what a website is made of: names and groups for its pages, actions and
custom events, how campaign labels map to channels, and the funnels and paths worth watching. Writing one by hand
is slow. With `/vizoalica learn` an assistant on your computer reads compact summaries of what the website emitted
and proposes it; you review and apply. Reports and dashboards can later build on the spec.

```text
vizoalica learn enable  ->  /vizoalica learn  ->  you review the spec files  ->  vizoalica spec apply
```

The assistant never writes to your backend. The spec never holds personal data (no email or IP addresses, phone
numbers or names of people; the validator refuses them).

## Steps

1. **Connect an assistant once:** `vizoalica mcp install --client claude-code` and
   `vizoalica skill install --client claude-code` (see [AI assistants](/operations/ai)).
2. **Let pages describe themselves for a while** (optional but better): `vizoalica learn enable prod` shows three
   Worker variables to set. See [the learning window](#the-learning-window).
3. **Create a spec folder:** `vizoalica spec init prod --website Shop` (inside a git repository it is the source of
   truth; add `--no-git` to keep only the backend copy).
4. **Ask your assistant:** `/vizoalica learn 20` (the number is thousands of events; 20 is the default). It
   summarises the newest raw events, proposes pages, actions, events, campaigns, funnels and paths as JSON files,
   asks you about gaps and conflicts, and writes `ONTOLOGY.md`.
5. **Review.** With git: the diff, and a pull request if you like. Without: `vizoalica spec diff prod`.
6. **Apply:** `vizoalica spec apply prod` shows the changes and asks. It stores the spec as the latest on the
   backend and applies page names, grouping rules and goals. Nothing is removed.

## The spec folder

| File             | Holds                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| `spec.json`      | version, `store` (`git` or `backend`), environment, project, website     |
| `pages.json`     | pages: id, path patterns, name, group, purpose, optional schema.org type |
| `actions.json`   | actions: id, page, the control's label, name, ARIA role, landmark, group |
| `events.json`    | custom events: id, event name, name, description                         |
| `groups.json`    | named groups the other files refer to                                    |
| `campaigns.json` | campaigns: UTM label aliases and a channel                               |
| `funnels.json`   | ordered steps (page, action or event), within a session                  |
| `paths.json`     | path anchors (start or end page) and groups to collapse                  |
| `goals.json`     | goals, as in [Goals](/operations/goals)                                  |
| `decisions.json` | what you decided about gaps and conflicts (see below)                    |
| `ONTOLOGY.md`    | the same spec in plain words, generated; do not edit                     |

The JSON files are the only source. `vizoalica spec render` writes `ONTOLOGY.md`, and
`vizoalica spec validate --check` fails when it is out of date, so a CI check or pre-commit hook keeps the two in
sync. `spec apply` refuses a stale `ONTOLOGY.md`.

## With git and without

|                         | With git (default inside a repository) | Without git                                            |
| ----------------------- | -------------------------------------- | ------------------------------------------------------ |
| Source of truth         | the folder in your repository          | the backend (latest version only)                      |
| History, review, revert | git                                    | none                                                   |
| Working copy            | the folder                             | `vizoalica spec pull`, edit, `spec apply`              |
| Concurrent change       | warns if the backend differs           | `apply` refuses if the backend changed since your pull |

Either way the backend keeps the latest spec and decisions (migration 0012), which is what reports and dashboards
read later. Back it up with `vizoalica spec export prod --out backup.json`; restore it with
`vizoalica spec import prod backup.json`.

## Gaps and conflicts, decided once

- **Gaps** are controls with no accessible name. For each group the assistant asks: give it a **label**, **accept**
  it unlabeled, or **ignore** it as not relevant.
- **Conflicts** are one thing with several descriptions (two page titles, `signup` and `sign_up`). The assistant
  offers 2 to 5 options, with its recommendation first, and you can answer something else.

Answers go into `decisions.json`, matched by selector (page, role, landmark, name; `*` matches anything), like a
`.gitignore` for elements. Later runs skip what is decided. A decision can carry `review-after`.

## The learning window

Off by default. While it is open, a share of page loads (10% unless you change it) describe their pages once each:
language, title, description, a few headings, landmarks, control labels, and form-field labels. Never field values,
placeholders, typed text, body text or anything inside `data-vizoalica-ignore`; texts are redacted like action names.
The events go to the raw event store only (kept 7 days), never into reports, and no event is sent when a visitor's
consent is denied.

Set these variables on the Worker (Cloudflare dashboard: Workers & Pages, the Worker, Settings, Variables and
Secrets); `deploy --update` keeps them:

| Variable                 | Meaning                                       |
| ------------------------ | --------------------------------------------- |
| `VIZOALICA_LEARN_START`  | first day, UTC, `YYYY-MM-DD`; unset means off |
| `VIZOALICA_LEARN_DAYS`   | length, 1 to 90, default 14                   |
| `VIZOALICA_LEARN_SAMPLE` | percent of page loads, 1 to 100, default 10   |

The Worker puts the window into the script it serves (`/vizoalica.js`), so the browser makes no extra request, and
refuses these events outside it. Check it with `vizoalica learn status prod`. Websites that load the script from your
backend pick it up within an hour.

## Limits to know

- **Depth.** Raw events are kept 7 days, and the backend reads a few dozen stored batches per call, so
  `/vizoalica learn 100` is hundreds of small calls and takes a while.
- **Sessions are page loads.** A visit across full page loads is several sessions, so funnels and paths are only
  visible inside single-page apps. A funnel check is a sample, not a report.
- **Rare labels are dropped.** A label seen in fewer than 3 page loads (`min_sessions`) is left out of the digest, so
  text about one visitor never reaches the assistant. Small sites may need a larger `VIZOALICA_LEARN_SAMPLE`.
- Labels and headings come from your website: the assistant treats them as data, never as instructions.

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

The assistant never writes to your backend. The spec should never hold personal data. The validator refuses email
addresses, IP addresses and long digit runs (phone and card numbers) in every text, path pattern and key; it cannot
recognise names, so you review the proposal before you apply it.

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
| `funnels.json`   | ordered steps (page, action or event), within a session or a day         |
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

To check the spec on pull requests and apply it when it reaches main, copy
[`examples/spec-ci/spec-workflow.yml`](https://github.com/ehud-am/vizoalica/blob/main/examples/spec-ci/spec-workflow.yml)
into `.github/workflows/` of the repository that holds the folder.

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
Text inside an element marked `data-vizoalica-ignore` is left out wherever it appears, including inside a heading or
label. Texts are cut to 80 characters. The events go to the raw event store only, never into reports; the SDK sends
nothing when a visitor's consent is denied and the Worker refuses such an event anyway.

**Retention.** The raw event store keeps batches for as long as its bucket lifecycle rule says. Vizoalica documents a
7-day rule ([Cloudflare setup](/operations/cloudflare)) but cannot enforce it from the Worker: without the rule the
structure texts and day tokens stay in the bucket. Check that the rule exists before you open a window.

**Bundled SDK.** The window is added to the script the Worker serves at `/vizoalica.js`. A website that bundles the
SDK into its own build, or serves a copy, never learns about the window and sends no structure.

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

## Funnels across pages

A funnel can say `"within": "day"`: the steps may happen on different page loads of one visitor on one UTC day.
While a learning window is open, the Worker writes a short token with each stored event. The token is cut from the
Worker's daily visitor identifier, a keyed hash of the visitor's address and browser made with a random salt that
the scheduled job deletes when the day ends. So the token:

- is one-way: it cannot be turned back into an address, name, email or place, and the address itself is never stored;
- cannot be linked to another day or another website, and after the day's salt is deleted nobody can recompute it;
- is 64 bits, differs for each website, lives only in the raw event store (for as long as your lifecycle rule keeps it), is never returned by any route or tool, and is not
  stored at all once the window closes;
- is not written for events whose consent is denied;
- is used by the learning sample only to order and link a day's events; the sample, the digest and the spec hold
  counts, never a token.

The Worker needs no cookie and nothing is stored in the browser. Where the daily identifier is unavailable (no client
address, or a database older than schema 3) events carry no token and stay separate page loads.

## Limits to know

- **Depth.** Raw events are kept 7 days, and the backend reads a few dozen stored batches per call, so
  `/vizoalica learn 100` is hundreds of small calls and takes a while.
- **Linking is per slice.** Page loads of one visitor and day link up only when their batches are read in the same
  call (about 1,000 events), so on a busy site funnels across pages are lower bounds. `linkedShare` in the run's
  quality figures says how much was linked. Visits on different days are never linked. A funnel check is a sample,
  not a report.
- **Rare text is dropped.** Anything seen in fewer than 3 page loads (`min_sessions`, never lower) is left out of the
  digest: titles, headings, labels, actions, custom events, campaigns, referrers, transitions and journeys. This lowers
  the chance that text about one visitor reaches the assistant; it is not a guarantee, because a page load is not a
  visitor (one visitor can reload a page three times) and names are not recognised. Small sites may need a larger
  `VIZOALICA_LEARN_SAMPLE`.
- **`within: "day"` is a statement of intent today.** The sample and `check_funnel` link what they can; nothing else
  reads the field until reports are built on the spec.
- Labels and headings come from your website: the assistant treats them as data, never as instructions.

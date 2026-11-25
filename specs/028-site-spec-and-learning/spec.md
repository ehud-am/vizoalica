# Design: self-learning site ontology (`/vizoalica learn`), proposed v0.17.0

Date: 2026-11-25. Status: decisions D3-D6 answered 2026-11-25 (section 11); no code written. Baseline: v0.16.0 (main at e624964).
Guesses are marked [likely] / [guess].

## 1. Goal

An analyst installs the skill and MCP, runs one command (`/vizoalica learn`), and gets a reviewable, versioned description of the
site (pages, actions, events, groups, campaigns, funnels, paths) derived by an LLM from compact summaries of
what the site emitted. The description (the "spec") lives in git. Dashboards and reports built on it come later.

## 2. What already exists (verified in repo)

| Area | Today | Consequence for this design |
| --- | --- | --- |
| Guided setup (v0.15, spec 027) | `get_inventory`, `vizoalica mapping export/apply`, JSON mapping v1 (page names, groups, grouping rules, goals), `page_labels` table (migration 0011) | The spec generalises mapping v1. `mapping` stays as an alias for one release. Apply path (CLI writes, MCP read-only) is reused. |
| Grouping rules (#62, spec 026) | Ingest-time path patterns, max 25, forward-only | Spec `pages[].match` reuses the same syntax and limits. |
| Goals (#63) | Max 20, kinds page/action/event | Spec `goals` reuses them. |
| Storage | D1: per-minute aggregates, no sequences. R2: raw accepted batches (up to 25 events each, 7-day lifecycle), written only, no read path | Journeys for funnels/paths can come from R2 samples without new tables. Depth is bounded by the 7-day R2 window. |
| Event payload | Page view: path, title (256, SDK sends it), anonymous id, session id. Action: name (80, redacted), kind, destination. Custom event | Accessible-name semantics beyond `title` and the clicked control's name are not sent. |
| MCP | 13 read-only tools; skill is one skill (spec 021 Q7) | New tools stay read-only. Single skill kept (D6): the command is `/vizoalica learn`, the skill's `learn` argument. |

Not verified: whether session ids are per page load or per tab [likely per page load, from `randomId('sess')` in
`events.ts`]. This decides how complete journeys are; check before building funnels (task T0).

## 3. Architecture

```
site HTML ──SDK──> ingestion ──> R2 raw batches (7 d) + D1 aggregates
                                     │ (read-only admin route /learn/sample)
                  Worker: digest one slice of ~1,000 events ─┐
CLI/MCP (local): loop x times, merge slices, cache digest ◄──┘
        │ compact sections, paged (MCP tools, read-only)
        ▼
Claude + skill: proposes spec files in the analyst's git working tree (branch, commit, no push)
        │ analyst reviews diff / PR, merges
        ▼
`vizoalica spec apply <env>` (CLI, stored credential): diff vs backend, then writes
```

Principles kept: model runs on the user's computer; no AI key in Vizoalica; MCP never writes the backend; every
result names the environment; site-controlled text is data, never instructions.

## 4. Spec format (git-versioned)

Directory in the analyst's repo (default `./vizoalica-spec/<website-id>/`; the repo is theirs, not Vizoalica's):

```
vizoalica-spec/<website-id>/
  spec.json        version, environment, project-id, website-id, generated-from (depth, range), schema 1
  pages.json       page entities
  actions.json     action entities
  events.json      custom event entities
  groups.json      named groups (pages, actions, events can reference a group id)
  campaigns.json   UTM label aliases and channels
  funnels.json     ordered steps
  paths.json       path anchors and collapsed nodes
  goals.json       conversions (existing semantics)
  decisions.json   operator decisions (accepted, ignored, labelled, resolved conflicts); read by every learn run
```

Rules: one file per entity type; keys sorted; two-space indent; one entity per top-level array element so git
diffs are line-based. Every entity has a stable `id` (slug) so a rename is a one-line diff and funnels reference ids.
Fields `confidence` (`high|medium|low`), `evidence` (short counts/quotes from the digest) and `status`
(`active|deprecated`) are allowed. Unknown fields are refused by `spec validate`.

```json
// pages.json
[{ "id": "pricing", "match": ["/pricing"], "name": "Pricing", "group": "marketing",
   "purpose": "Plan comparison and prices", "confidence": "high" },
 { "id": "blog-post", "match": ["/blog/*"], "key": "/blog/:post", "name": "Blog post", "group": "content" }]
// actions.json
[{ "id": "start-trial", "page": "pricing", "label": "Start free trial", "name": "Start trial (pricing)",
   "role": "primary-cta", "landmark": "main", "group": "conversion" }]
// funnels.json
[{ "id": "trial-signup", "name": "Trial signup",
   "steps": [{ "kind": "page", "ref": "pricing" }, { "kind": "action", "ref": "start-trial" },
             { "kind": "event", "ref": "signup" }], "within": "session" }]
// paths.json
{ "anchors": [{ "id": "from-pricing", "start": "pricing" }], "collapse": [{ "group": "docs" }] }
// campaigns.json
[{ "id": "facebook", "aliases": { "utm_source": ["fb", "facebook", "facebook.com"] }, "channel": "paid-social" }]
```

Backend copy: `apply` writes the compiled spec as one row per website (`site_specs`: version, git commit sha if
available, content hash, JSON blob, size cap 256 KB [guess]) in migration 0012 (additive). It also fills the
existing `page_labels`, grouping rules and goals so current reports keep working. Action, event and campaign
names are applied at read time from the blob (display-time, retroactive, reversible). `get_spec` returns it, so
diff against the running spec works from MCP. Git stays the source of truth; the backend row is a deployed copy.

Out of the spec: raw data, visitor data, secrets, keys.

### 4.1 Human-readable twin (decided 2026-11-25)

`vizoalica-spec/<website-id>/ONTOLOGY.md` is generated from the JSON files, never edited by hand (header says so).
It lists, per section: pages by group with purpose and key patterns, actions per page, events, campaigns/channels,
funnels as numbered steps, paths, goals, and a low-confidence list. Deterministic output (sorted, no timestamps).
- `vizoalica spec render` writes it; `spec validate --check` fails when the md differs from a fresh render
  (for CI and a pre-commit hook); `spec apply` refuses a stale md; `/vizoalica learn` always renders after editing.
- JSON is the only source. Edits to the md are overwritten and the check reports them.


## 5. `/vizoalica learn [depth]` flow (one skill; e.g. `/vizoalica learn 20`)

1. Resolve environment, website and spec folder (cwd git repo; ask once, remember in `spec.json`). Say which
   environment.
2. Ask depth in thousands of events: presets 5k, 20k, 50k, 100k [guess]; default 20k; max set by the 7-day R2 window.
   Show the cost estimate (R2 reads ≈ events/25, time) before starting.
3. `learn_start` builds the digest (section 7). Report data quality first: events found, days covered, share of
   controls and pages with usable accessible names ("accessibility coverage"); low coverage lowers confidence.
4. Load current spec: working tree plus `get_spec`. If they differ, warn about drift and ask which is the base.
5. Apply recorded decisions first (section 13): skip anything already decided, ask only about new gaps and new conflicts.
   Then propose per entity type. With no current spec: full proposal. With one: only deltas (new, renamed, deprecated,
   merged), each with evidence.
6. Write files on branch `vizoalica/learn-<date>`, commit locally. Never push or apply without the analyst.
7. Final message: what changed in plain words, list of low-confidence items, and `vizoalica spec apply <env>`.

The same procedure works unattended later: re-running `/vizoalica learn 20` produces a delta PR.

## 6. Ingestion changes (minimal, bounded, private)

New event type `com.vizoalica.page_structure.v1` (decision D10), sent once per page key per page load, only when
the learning window is open (off by default). Fields, all optional, total cap 4 KB, server drops the whole event above cap:

| Field | Source | Cap |
| --- | --- | --- |
| `lang`, `title`, `description` | `<html lang>`, title, meta description | 8 / 256 / 160 |
| `headings` | h1 (1), h2/h3 (up to 8): text, level | 80 each |
| `landmarks` | roles banner, nav, main, complementary, contentinfo, search, form, region with `aria-label` | 12, label 60 |
| `controls` | up to 25 interactive elements: role, accessible name, nearest landmark. Denominator for "never clicked" | name 80 |
| `forms` | accessible name, field count, field types and labels (never values, none for password/autocomplete-sensitive) | 8 fields |
| `a11y` | counts only: unlabeled controls, images without alt | numbers |

Action events gain optional `landmark` (role + label) and `role`: about +60 bytes.

Privacy controls:
- No values, no typed text, no `value`/`placeholder` content, nothing under `data-vizoalica-ignore`, no inputs.
- All text passes the existing `redactLabel` in the SDK and again in the privacy guard.
- Structure goes to R2 only (7-day lifecycle). It is never aggregated into D1.
- Digest rule: a string seen in fewer than k distinct sessions (k = 5 [guess]) is dropped, so per-visitor text such
  as "Welcome back, Jane" never reaches the model.
- Volume control (D3): fixed low rate, always lean: one event per page key per page load, sampled at a fixed low
  percentage [guess 10%], at most 20 per minute per page load, 4 KB cap. Window closed means zero extra traffic.
- No config call from the browser: the window is two optional environment variables on the Worker,
  `VIZOALICA_LEARN_START` (UTC date) and `VIZOALICA_LEARN_DAYS` (default 14, changeable). The Worker already serves
  the script, so it bakes the window into the served file [likely, verify in `embed.ts`]; the SDK compares it with the
  local clock and sends nothing outside it. Static sites can use `data-vizoalica-learn-start` / `-days` attributes.
  Unset: capture off. The Worker also refuses `page_structure` events outside the window.
- Prompt injection: digest strings are length-capped, control characters stripped, tool descriptions and skill mark
  them as untrusted data.

Capture policy (D3, decided): off until enabled. `vizoalica learn enable <env> [--start <date>] [--days 14]` sets the
two variables (applied with `deploy --update`; no site HTML change for Worker-served scripts); `learn status` shows
the window; `learn disable` clears it. Privacy docs describe the window explicitly.

## 7. Sampling, digest and MCP tools

Worker route `GET /v1/admin/projects/:p/sources/:s/learn/sample?cursor&events=1000` (any role in scope):
lists the newest R2 batches of the website, reads up to 40 objects per call (stays under Worker subrequest limits
[likely]), and returns a bounded sketch (≤ 200 KB): distinct pages, controls, events, referrers, campaign labels,
transition pairs and truncated session sequences, each with counts and distinct-session counts. Session and visitor
ids are never returned.

The CLI/MCP loop calls it x times (depth 20k = 20 calls), merges sketches locally with deterministic code in
`ops-core`, and caches the digest under the user's cache directory. The model never sees raw events or the full digest.

MCP tools, all read-only (the only side effect is the local cache):

| Tool | Returns |
| --- | --- |
| `learn_start(website, depthK)` | Run id, coverage and quality stats, section sizes |
| `learn_get(run, section, cursor, limit)` | One page (≤ 8 KB) of: pages, controls/actions, events, forms, campaigns, transitions, journeys |
| `get_spec(website)` | The applied spec, its hash, git sha, and how much of the sample it covers (unmapped list) |
| `check_funnel(run, steps)` | Step counts and drop-off over the sample sessions, labelled "sample, not full data" |

Ordering fix needed: R2 keys are `events/<project>/<source>/<day>/<uuid>.json`, not time-ordered. Use
`list` with custom metadata (`received_at`) per day, or name new objects `<hhmmss>-<uuid>` (backward compatible) [likely].

## 8. CLI

`vizoalica spec init|validate|diff <env>|apply <env> [--yes]|export <env>` and `vizoalica learn enable|status <env>`.
`apply` mirrors `mapping apply`: environment and website shown, diff, confirmation, nothing deleted without an
explicit `deprecated` status, limits checked before any write, admin or owner role only (analyst: 403).
CLI `vizoalica learn` controls the window; the assistant command is `/vizoalica learn`. Example GitHub Actions workflow
(`examples/`) applies on merge using a repo secret, for the automated (pipeline) flow.

## 9. Release scope

In v0.17.0: spec format and validator; `spec` CLI; `site_specs` + `get_spec` (migration 0012); structure capture
(SDK, schema, guard, dynamic-config window); sample route, digest merge, 4 MCP tools; `/vizoalica learn`; docs
(privacy page changes, `docs/operations/spec.md`); mapping alias; example workflow.

Deferred: persistent funnel/path/retention reports (needs session-sequence aggregates in D1), dashboards, console
spec viewer/editor, per-spec custom reports, auto-apply from the backend, non-JSON formats.

Tasks outline (order): T0 session-id check and R2 ordering → T1 spec schema + validator → T2 structure event
(contracts, SDK, guard) → T3 sample route + merge → T4 MCP tools → T5 `spec` CLI + migration 0012 → T6 skill and
command → T7 docs, privacy page, QA report. Sizes not estimated yet.

## 10. Risks

- Accessibility assumption fails on some sites: coverage score in the digest; fall back to path and title.
- Privacy promise changes only while a window is on ("page text never collected" gains "unless a learning window is
  enabled: labels and headings, R2 only, k-filtered"). README, privacy docs and SECURITY need rewording.
- 7-day R2 window caps depth and seasonality (weekly cycles only).
- Sampling cost: about events/25 R2 reads per run; negligible [likely] but should be measured.
- Funnels from a sample can mislead if session ids are per page load (T0).
- LLM proposals can be wrong: every item carries confidence and evidence; apply always shows a diff.

## 11. Open decisions (recommendation first)

| # | Decision | Options | Recommend |
| --- | --- | --- | --- |
| D3 | Structure capture default | **Decided: off until enabled**; 14-day default, changeable; window via optional Worker env vars, no config call; fixed low volume | done |
| D1 | Spec file format | JSON; YAML | JSON: no new dependency, matches mapping v1 [likely]; accepted |
| D2 | Spec location | folder in an existing repo; dedicated repo | folder, default `./vizoalica-spec/<website-id>/`; accepted |
| D4 | Funnels/paths | **Decided: yes.** Defined in spec files now; measured on the sample only; persistent reports later | done |
| D5 | Apply | **Decided: yes**, CLI plus example CI workflow | done |
| D6 | Command packaging | **Decided: one skill**; command is `/vizoalica learn [depth]` | done |
| D7 | Depth presets and max | 5/20/50/100k; max by 7-day window | as listed, default 20k |
| D8 | k-threshold for strings | 3, 5, 10 | 5 [guess] |
| D9 | Roles for sample route | any role in scope; admin/owner only | any role in scope (same as inventory) |
| D10 | Structure payload | new event type; extra field on page_view | new event type |

## 12. Standards (answer to "should we use an ontology standard?")

Recommendation: plain JSON validated by a published JSON Schema, borrowing vocabulary where it fits. Heavier
semantic-web formats add tooling and review cost for an LLM and git workflow that gain nothing from them.

| Standard | Use | When |
| --- | --- | --- |
| JSON Schema 2020-12 | Publish `spec.schema.json` per file type (same Ajv setup as event contracts); editors validate, `spec validate` uses it | v0.17 |
| WAI-ARIA roles and landmarks | Vocabulary for `role` and `landmark` fields (button, link, tab, navigation, main...) and the structure event | v0.17 |
| schema.org types | Optional `type` on pages (`CollectionPage`, `Product`, `FAQPage`, `ContactPage`...) so names match what the LLM and other tools already know | v0.17, optional field |
| JSON-LD `@context` | Optional mapping of spec fields to schema.org terms, for tools that want linked data | later |
| Analytics event naming (GA4 recommended events, Segment spec: `sign_up`, `purchase`) | Optional `standardName` on events so reports can align across tools | later [guess] |
| OWL / RDF / SKOS | Not used: reasoners and triple stores add cost, no benefit for this workflow | no |
| Funnels, paths | No relevant standard; keep our own small schema | n/a |

Open: whether to commit to schema.org page `type` in v0.17 or wait (D11, recommend include as optional).

## 13. Gaps, conflicts and remembered decisions (added 2026-11-25)

### 13.1 Unlabeled elements (gaps)
The structure capture reports controls, forms, landmarks and images without an accessible name (`a11y` counts, and
each unlabeled element as role + landmark + page + position index, no text). The digest has a section `gaps`.
`/vizoalica learn` lists them grouped by page and landmark, sorted by clicks/visibility, and for each group asks the
operator for one of:
- `label`: give a name (the spec gets the entity, and the site should fix the markup; a to-do is noted),
- `accept`: leave unlabeled, keep the fallback name ("Unlabeled button"),
- `ignore`: not relevant, exclude from reports and from future gap lists.
Groups are offered in bulk (for example "12 unlabeled icon buttons in `nav` on all pages") to keep questions few.

### 13.2 Conflicts
A conflict is one thing with several descriptions: same control or page seen with different accessible names across
pages or sessions, same page key with different titles/h1, two entities that could be merged or split, an event name
used for two purposes. For each, the assistant proposes 2 to 5 options (first is its recommendation, with evidence
counts), plus always a free-form "other". The operator picks or writes an answer.

### 13.3 `decisions.json` (gitignore-like, versioned in the spec folder)
Same git workflow as the spec, so decisions are reviewed, attributed and reverted like any change. Rules are matched
by selector, first match wins, later runs never re-ask a matched item.

```json
[{ "id": "d-001", "type": "gap", "decision": "ignore",
   "match": { "page": "*", "role": "button", "landmark": "banner", "name": "" },
   "reason": "Decorative logo link", "decided": "2026-11-25" },
 { "id": "d-002", "type": "gap", "decision": "label", "match": { "page": "checkout", "role": "button", "index": 3 },
   "value": "Apply coupon", "reason": "Site markup to be fixed" },
 { "id": "d-003", "type": "conflict", "subject": { "kind": "action", "ref": "start-trial" },
   "options": ["Start free trial", "Try it free", "Start trial"], "chosen": "Start free trial",
   "decision": "option", "reason": "Matches pricing page" },
 { "id": "d-004", "type": "conflict", "subject": { "kind": "page", "ref": "pricing" },
   "chosen": "Plans and pricing", "decision": "custom", "reason": "Operator wording" }]
```
- `decision`: gaps `label|accept|ignore`; conflicts `option|custom`. `reason` optional, `decided` date, author comes from git.
- Match fields: same selector vocabulary as the spec (page id or `*`, role, landmark, name, index; globs as in grouping
  rules), so one rule can cover many elements. Wider rules are listed back to the operator with the count they match.
- Revisit: a decision can carry `expires` or `review-after`; `/vizoalica learn --recheck` re-opens decisions whose
  evidence changed (for example an element once ignored now gets many clicks). Otherwise decisions are final.
- Validated by the same JSON Schema; rendered into `ONTOLOGY.md` (sections "Accepted gaps" and "Decisions").
- Not applied to the backend except `label`/`custom` values that become spec entities; ignored/accepted entries stay in
  git only (nothing sensitive: no text beyond names the site already shows).

### 13.4 Tools and effects
No new write tool. `learn_get` gains sections `gaps` and `conflicts`, already filtered by `decisions.json` (the skill
passes the decisions folder contents or its hash). The assistant writes decisions to the file; the analyst commits.
D12 decided 2026-11-25: the backend always holds the latest spec and decisions (section 14).

## 14. Backend always holds the latest; with or without git (added 2026-11-25)

The backend keeps the latest applied spec and decisions per website, as the data source for later reports and
dashboards (they read entity names, groups, funnels, paths from it). Table `site_specs` (migration 0012):
`website_id`, `version` (integer, +1 per apply), `content_hash`, `spec_json` (all spec files merged),
`decisions_json`, `rendered_md`, `git_sha` (nullable), `applied_at`, `applied_by` (key name/role). Size cap 256 KB
total [guess]. Only the latest row is kept: no history in the backend (history is git's job).

| | With git (default when the folder is inside a git repo) | Without git |
| --- | --- | --- |
| Source of truth | Files in the repo; backend is the deployed copy | Backend (latest only) |
| Versioning, review, revert | Git branches, PRs, history | None; `apply` shows a diff and asks, no undo |
| `/vizoalica learn` | Edits files on a branch, commits locally | Runs `spec pull` into a scratch folder (user cache dir), edits there, shows the diff, asks, then `spec apply` |
| Drift | Backend hash differs from repo: warn, ask which base | Not possible; `apply` uses `--base-version` and refuses if the backend changed meanwhile |
| Decisions and `ONTOLOGY.md` | Files in the repo | Stored in the backend row; `spec pull` materialises them |

- Mode is set in `spec.json` (`"store": "git" | "backend"`), chosen by `spec init` (git if a repo is detected,
  `--no-git` otherwise) and switchable later: `spec init --no-git` is a pull; moving to git is `spec pull` into a repo
  folder, commit, continue.
- Same CLI both ways (`spec pull|diff|apply|render|validate`); same MCP `get_spec` (returns spec, decisions, hash,
  version, `git_sha`, applied time). `get_spec` is how Claude sees "current" in either mode.
- Apply stays CLI-only (stored credential, admin or owner role); MCP stays read-only. In backend-only mode the
  assistant edits the scratch copy; nothing reaches the backend until the operator confirms `spec apply`.
- Both modes keep the same validation, rendering and `--check` for the md twin (backend mode checks the row).
- Cost: one row per website per apply (few KB to 256 KB), no reads on the ingestion path; reports read it on demand.
- Risk: backend-only mode has no history, so a bad apply overwrites the only copy. Mitigation: `spec pull` before
  edits, confirmation with diff, and `spec export` to a file for a manual backup.

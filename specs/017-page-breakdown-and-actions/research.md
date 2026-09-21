# Research: Page Breakdown and Actions Report

Phase 0 output for [plan.md](./plan.md). Every technical unknown is resolved here; none is carried
forward as "NEEDS CLARIFICATION". Each entry states the decision, why, and what was rejected.

## R1. Why every page reports as "/", and where the fragment route lives

**Finding.** `packages/privacy/src/redaction.ts` (`redactUrl`) keeps only `url.pathname`. A screen
addressed as `#/analytics/pages` therefore has pathname `/`, and the SDK sends a single page view on
load and never again (`packages/browser-sdk/src/index.ts`, `autoPageView`). Sites that navigate
without a page load (fragment routes or history-API routers) are reported as one `/` page.

**Decision.** Fold the route fragment into the existing `url_path` string: `pathname` plus `#` plus
the route, for example `/#/pricing` or `/app#/orders/:id`. No new field on the page-view contract.

**Why.** `event-data-page-view.schema.json` sets `additionalProperties: false` on `page`. A new field
would make an older backend reject every page view from a newer SDK, which turns a display bug into
data loss. `url_path` already allows 1,024 characters and the backend already treats it as an opaque
grouping key, so no storage or report change is needed for pages.

**Rejected.** A separate `url_route` field (breaks older backends, needs a rollup change); recording
the whole fragment (tokens and sign-in data live there).

## R2. How in-page navigation is detected

**Decision.** In the SDK: wrap `history.pushState` and `history.replaceState`, listen for `popstate`
and `hashchange`, and emit a page view when the normalized page key differs from the last one
emitted. The wrappers call the original first, never throw, and defer work to a microtask so the
router is never delayed.

**Why.** Comparing to the last key prevents double counts: `hashchange` plus `popstate` both fire for
some fragment navigations, and it also prevents counting the initial load twice (FR-002).
`replaceState` is observed because a router redirect (for example to a dashboard after sign-in) is a
real arrival on a new page; routers also use it to tidy the query string, but the page key ignores
queries, so that never changes the key and never counts. (The first draft ignored `replaceState`;
implementation showed that leaves the remembered page stale, so a later `pushState` to the same page
was counted and the redirect was not.)

**Consequence.** Navigating to the page you are already on is not a new view. Visiting A, B, A gives
A two views (Story 1 scenario 3).

**Rejected.** Polling `location` (wasteful); a `MutationObserver` on
`<title>` (unreliable).

## R3. Identifier grouping: rules, and where they run

**Decision.** One pure function, `normalizePagePath`, in `packages/privacy`, used by both the SDK and
the ingestion privacy guard. It is idempotent (`:id` is not itself an identifier).

Rules, applied per path segment (and to the route fragment the same way; a fragment's query is
dropped first):

| Segment shape                                                                            | Result      |
| ---------------------------------------------------------------------------------------- | ----------- |
| Only digits (any length): `8841`, `2`                                                    | `:id`       |
| UUID: `3f2b8c1e-5d4a-4a37-9c1b-0e7d2a6f9b10`                                             | `:id`       |
| Hexadecimal, 16 or more characters: `5f2b8c1e5d4a4a37`                                   | `:id`       |
| Token: 20 or more of `A-Za-z0-9_-` containing an uppercase, a lowercase, and a digit     | `:id`       |
| ULID: 26 uppercase Crockford base32 characters including a digit                         | `:id`       |
| Contains `@` (an email-shaped segment)                                                   | `:id`       |
| Date run: a year `19xx`/`20xx` immediately followed by a month `1-12`, then optionally a day `1-31` | kept        |
| Anything else: words, slugs, `v2`, `img-1234.png`                                        | kept        |

A lone year segment is not a date run, so `/orders/2026` becomes `/orders/:id`; the accepted false
negative is `/orders/2026/12` (order 2026, item 12), which is kept as written.

Also: trailing slash removed (except root), result truncated to `privacyLimits.maxUrlPathLength`.

**Why both sides.** In the SDK, raw identifiers never leave the browser (FR-009). At ingestion, older
SDK files and any other client get the same grouping, and a hostile client cannot bypass it. The
stored raw event and the aggregates therefore never contain the identifier.

**Why these thresholds.** Tokens need three character classes and 20 characters, so lowercase slugs
(`my-first-post-2026-review`) never match. Hex needs 16 characters so short words made of a-f
letters and git short hashes are not touched. Digits-only is intentionally greedy: `/page/2` becomes
`/page/:id` (documented, spec edge case).

**Rejected.** Server-only grouping (identifiers cross the network); SDK-only (bypassable, older
files ungrouped); owner-defined patterns (out of scope by decision); a dictionary or entropy score
(harder to document and test than a five-row table).

## R4. Actions are a new event type, not a custom event

**Decision.** New CloudEvents type `com.vizoalica.action.v1` with its own data schema
(`event-data-action.schema.json`), added to the batch schema's `oneOf` and to `eventTypes`.

**Why.** `custom_event.v1` names must match `^[a-z][a-z0-9_]{1,63}$` and its properties reject any
name containing `email`, `token`, and similar words, so a human label like "Delete account" cannot
be carried. Custom events are also developer-authored and unaggregated, and mixing them with
automatic clicks would confuse both. A separate versioned type keeps the contract explicit
(constitution: versioned public event contracts) and leaves accepted history untouched (FR-026).

**Schema uniqueness.** `oneOf` needs exactly one match. Action data requires `action`, which page
views and custom events cannot contain (`additionalProperties: false`), and lacks `name`, so it can
only match its own schema.

**Rejected.** Encoding actions as custom events; adding optional fields to the page-view schema.

## R5. What an action is, how it is named, and what is never read

**Eligible controls.** `button`, `a[href]`, `input` of type `button`, `submit`, `reset`, `image`, and
elements with role `button`, `link`, `menuitem`, or `tab`. Found from the click target with
`closest()`. Text inputs, selects, textareas, and `contenteditable` regions are never eligible, so
typed content and password, payment, and one-time-code fields cannot be read.

**Kind.** `link` for anchors and role link; `button` for buttons, input buttons, and role button;
`other` for the remaining roles.

**Name, first match wins.**

1. `data-vizoalica-action` on the control (the developer's explicit name).
2. `aria-label`.
3. Visible text (`textContent`, whitespace collapsed); for `input` buttons, `value`.
4. `title`, or the `alt` of a contained image.
5. Fallback by kind: `Unlabeled button`, `Unlabeled link`, or `Unlabeled control`, so a control with
   no readable label is still counted rather than dropped.

Then `redactLabel`: collapse whitespace, replace email addresses with `[email]`, runs of six or more
digits with `[number]`, token-shaped words (R3 token rule) with `[token]`, and truncate to 80
characters. The same function runs again at ingestion.

**Link destination.** For `http(s)` anchors only: origin plus the R3-normalized pathname; never
query or fragment. `mailto:`, `tel:`, and `javascript:` links record no destination (an address or
number is personal data).

**Exclusion.** `data-vizoalica-ignore` on a control or any ancestor removes it from recording.

**Rejected.** Recording CSS selectors or element ids (leaks implementation, often meaningless);
reading `value` of arbitrary inputs; a console-side exclusion list (out of scope).

## R6. Duplicate suppression and client-side rate cap

**Decision.** The SDK drops an action whose key (page, name, kind, destination) matches one recorded
within the previous 500 ms, and stops recording after 100 actions in any rolling minute per page
load. Keyboard activation needs no extra handling: native buttons and links fire `click` on Enter
and Space.

**Why.** FR-017 needs double-clicks and held keys to count once; the cap protects quotas from an
endless-click script (existing server quotas still apply as the hard limit).

## R7. Transport: keep actions from ever stalling page views

**Finding.** `flush()` requeues a failed batch at the front forever (`requeueFront`), including on
permanent rejections. A newer SDK talking to an older backend would get HTTP 400 for the unknown
event type and retry it indefinitely, blocking later page views (Edge case "Newer SDK file with an
older backend").

**Decision.** (1) Actions are sent in their own batches, separate from page views and custom events.
(2) A batch rejected with 400 or 413 is dropped, not requeued. Other failures (network, 5xx, 429)
keep today's requeue behavior.

**Why.** Page views are then unaffected by an old backend, and a permanent rejection can no longer
loop. This also fixes a latent flaw for any future event type.

## R8. Consent

**Finding.** The SDK records `consentState` on every event; enforcement is the host's job (it loads
the SDK only after consent). The SDK does not itself refuse to send under `analytics-denied`.

**Decision.** For the new data only, the SDK records no actions and no in-page navigation views when
`consentState === 'analytics-denied'`. The initial page view keeps today's behavior. The state
continues to travel on every event.

**Why.** Meets FR-025 and is safer for the new, richer data without changing existing behavior.

## R9. Storage: two new additive tables

**Decision.** Add `dashboard_minute_actions` (counts) and `dashboard_minute_action_visitors`
(distinct visitors), both at minute granularity like the existing dashboard tables, keyed by
project, source, minute, page, action name, kind, and destination. Insert through the existing
`dashboard_seen_events` digest and nonce pattern so replays and retries count once.

**Why not the existing dimensions table.** `dashboard_minute_dimensions.dimension_kind` has a
`CHECK` constraint listing the eight allowed kinds. SQLite cannot alter a `CHECK`, so a new kind
needs a table rebuild, which is not additive. The dimensions table also has one value column, so it
cannot hold page, action, and kind together, and it has no distinct-visitor structure.

**Why minute granularity.** Ranges are minute-aligned, and every other dashboard table is minute
granular; hourly buckets would make a range ending at :37 misreport.

**Write cost.** About three rows per action (seen-event digest, count upsert, visitor insert),
fewer than the roughly ten a page view already writes. Retention is the existing 32 days;
`deleteExpiredDashboardData`, project deletion, and purge cover the new tables.

**Legacy rollups.** `dashboard_rollups` and the hourly tables are not written for actions (they feed
only page-view counts).

**Bounds.** Rows are bounded by accepted events, which quotas already bound; the report returns at
most 100 grouped rows.

## R10. Schema policy: fold into the baseline, no migration (owner decision)

**Finding.** The 0.5 line is documented as fresh-install-only with one `0001_initial.sql` baseline
(`docs/operations/releases.md`), and `apps/deploy-cli/src/fresh-schema.ts` rejects a database that
already has Vizoalica tables.

**Decision (owner, 2026-09-20).** No migration file. The two new tables and their indexes are added to
`deploy/cloudflare/migrations/0001_initial.sql`. Fresh installs create them with the rest of the
schema, and this release is a breaking, fresh-install-only release (version 0.6.0). The two table
names are added to the fresh-schema inspection list.

**Maintainer backend.** The live D1 database predates this change. Recreating it would delete the
project and website registrations that the deployed websites depend on, so the maintainer's own
database receives the same two `CREATE TABLE` statements once, by hand, before the Worker is
deployed. Nothing existing is altered or dropped, and rollback is redeploying the previous Worker
(the new tables are simply unused).

**Ordering constraint.** Schema, then Worker, then website SDK files (R7 protects against skew).

**Rejected.** A `0002` migration (owner declined); editing the live database destructively.

## R11. The actions report query and response

**Decision.** One admin endpoint, `GET /v1/admin/projects/:id/analytics/actions`, with `start`, `end`,
optional `source_id`, and optional exact-match `page` and `action` filters. It returns, from a single
batched read (like `getAnalyticsOverview`, one consistent snapshot):

- `totals`: actions and distinct visitors in scope.
- `rows`: up to 100 grouped rows (page, action, kind, destination, count, visitors, and the page's
  view count for the same range), ordered by count then names.
- `other`: rows and count beyond the 100, so totals stay exact (FR-021).
- `actions`: per-action totals across pages (up to 50), for FR-019.
- `selection.page` when a page filter is set: that page's views and total actions.

Distinct visitors and page views for the returned rows each come from one grouped scan of the range
(`COUNT(DISTINCT visitor_digest)` over the visitors table, and the existing `page_path` dimension),
restricted to the rows shown. A first version used per-row correlated lookups; measured on 30 days of
synthetic traffic (430,000 dimension rows, 260,000 action rows) it took 12.2 s, against 1.3 s for
grouped scans, because no index leads with the page or action. Ranges stay capped
at 30 days by the existing range parser.

**Why one endpoint with filters.** Drill-down stays exact (a tail row can still be selected by
following its link) instead of filtering an already-truncated list in the browser.

**Rejected.** Adding actions to the overview payload (every analytics page would pay for it);
client-side filtering (wrong for truncated data).

## R12. Console routing for bookmarkable selections

**Finding.** The console is a hash router; `parseRoute` maps the whole fragment to a route and has no
query support (`apps/admin-web/src/router.ts`).

**Decision.** Add `analytics/actions` to `ROUTES` (area analytics, nav item after Pages, project and
website scope, range shown). Let `parseRoute` split an optional `?page=&action=` from the hash and
return it as `params`; `hrefFor` accepts params; `useRoute` compares them. The selection is therefore
in the address (FR-020). Values are URI-encoded; unknown params are ignored.

**Note.** This is also the console's own worked example of the fix in Story 1: once it is measured,
`#/analytics/actions` is reported as such, and the query is dropped by R1's rules.

## R13. Console UI

**Decision.** Extract the heading, no-project, error, and range-notice frame from `AnalyticsView`
so the Actions page can reuse it without the overview fetch it does not need. The page has the
ranked table (Page, Action, Kind, Actions, Visitors, and Rate), a per-action totals card, a summary
strip when a page is selected, and removable filter chips. Table markup follows `RankedList`
(scroll region, `th scope`, real captions, no color-only meaning).

**Rate semantics.** Rate is actions divided by that page's views. Because one view can produce several
clicks it can exceed 100%; the column is labelled "Actions per page view" and shown as a percentage
with that note, rather than presented as a capped share.

**Empty states.** (a) No actions but page views exist: explain what an action is and that updated
SDK files report them, with a link to the installation guidance. (b) No data at all: the existing
first-run hint.

## R14. Bots

Existing reports count all accepted traffic and expose classification only in Traffic quality. Actions
follow the same rule (FR-022). No new classification column.

## R15. Performance budget

The click handler runs in the capture phase as a passive listener and does bounded work: one
`closest()`, a few attribute reads, one regular expression pass over at most a few hundred
characters of text (label text is truncated before redaction), and a queue push. A unit test asserts
the handler stays well under the 50 ms criterion (SC-007) on a large label, and that a thrown error
inside it never reaches the page.

## R16. Privacy deliverables

The constitution requires a purpose, retention, access boundary, and privacy review for new fields.
Deliverable: `docs/privacy/action-collection-review.md` in the format of
`audience-attributes-review.md`, covering action name, kind, and link destination, plus the
route-fragment change. Retention equals other dashboard aggregates (32 days) and raw batches follow
the existing raw-batch policy. Access is aggregates only, project-scoped, admin credential.
Small-count risk for labels is judged low because names are developer-visible control text, redacted
and truncated. Also updated: `docs/operations/privacy.md`, `docs/operations/browser-sdk.md`,
`docs/operations/pages.md`, `docs/operations/cost-model.md`, `docs/operations/cloudflare.md`,
`docs/operations/releases.md`, `CHANGELOG.md`, `README.md`, and `llms.txt`.

## R17. Test strategy

- **Privacy package:** table-driven normalizer corpus for SC-003 (identifier shapes, slugs, dates,
  idempotence, fragments, emails), and label redaction cases for SC-006.
- **Contracts:** schema tests for valid and invalid action events, plus a check that old page-view and
  custom events still validate (FR-026).
- **SDK:** jsdom tests for route building, navigation detection and de-duplication, eligible
  controls, naming, exclusion, destinations, dedup window, rate cap, consent, batch separation,
  and drop-on-400.
- **Ingestion:** guard normalization and rejection; fake-D1 integration tests for rollups, replays,
  isolation between projects, and retention.
- **APIs:** contract tests for the worker and local-ops endpoints (validation, 400/404, range).
- **Console:** unit and accessibility tests (axe), router tests, and Playwright flows against the
  mock console, including keyboard operation and narrowing.
- **Coverage:** stays above 90% for lines and branches (constitution).

## R18. Explicitly out of scope

An MCP tool for actions; owner-defined grouping patterns; regrouping of older events; funnels or
click paths; a console exclusion list; per-website collection switch (decided against); hover,
scroll, or form-field events.

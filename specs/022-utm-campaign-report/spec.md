# Feature Specification: UTM Campaign Report

**Feature Branch**: `022-utm-campaign-report`

**Created**: 2026-10-17

**Status**: Draft for implementation in v0.11.0 (GitHub issue #59)

**Input**: "See which campaigns bring visitors, without adding cookies or visitor IDs. Read `utm_source`,
`utm_medium`, `utm_campaign` on page load, keep only those values, and drop every other query parameter as
today. Report visitors and page views by source, medium and campaign, in the console and as an MCP tool.
Allow-list and length limits for UTM values; apply existing redaction."

## Decisions (2026-10-17)

The issue left some choices open. They are decided here so implementation does not stall; the release owner can
overturn any of them before release.

| #   | Question                                   | Decision                                                                                                                                                      |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | `utm_term` and `utm_content`               | Not in 0.11.0. They are free text typed by advertisers (search keywords) and carry the most privacy risk and the most row growth. Add later if asked.        |
| Q2  | Which page view carries the campaign       | Only the first page view of a page load (the landing view). In-page navigation and later `page()` calls never repeat it, so one visit is not counted twice.   |
| Q3  | Case                                       | Values are lowercased, so `Google`, `google` and `GOOGLE` are one source.                                                                                     |
| Q4  | Where values are cleaned                   | In the browser (they never leave it dirty) and again at ingestion, whatever the sender did, like page keys and action names. Both steps are idempotent.       |
| Q5  | Combination vs separate rankings           | Store the combination (source, medium, campaign) per minute. Report three rankings (by source, by medium, by campaign) and the top combinations.            |
| Q6  | Retention                                  | Like every other aggregate: minute rows older than 32 days are deleted by the scheduled job.                                                                  |
| Q7  | Visitors                                   | Counted with the existing keyed digest (daily-rotating visitor id), never stored raw. Same rule as the Pages and Events reports.                              |
| Q8  | Relation to the referrer                   | Independent. A visit can have a campaign, a referrer, both, or neither. The report does not merge them.                                                       |
| Q9  | Older SDK / older backend                  | A backend older than 0.11.0 rejects page views that carry `campaign`. Update the backend before bundling the new SDK (same rule as 0.10.0's `page` field).    |

## User Scenarios & Testing _(mandatory)_

### User Story 1 - See which campaigns bring visitors (Priority: P1)

As a website owner who shares links with `utm_source`, `utm_medium` and `utm_campaign`, I open the **Campaigns**
page and see, for the selected range, how many page views and visitors each source, medium and campaign brought,
so I know which of my efforts work.

**Why this priority**: Today only the minimised referrer is reported; a newsletter, a social post and a paid
ad all look like "Unknown" or the same origin. This is the core of the issue.

**Independent Test**: Load a page at `/?utm_source=Newsletter&utm_medium=email&utm_campaign=spring-sale` three
times (distinct visitors), once from `utm_source=twitter&utm_medium=social`. Open Campaigns for the range and
see `newsletter / email / spring-sale` with 3 page views and `twitter / social / (not set)` with 1.

**Acceptance Scenarios**:

1. **Given** a landing URL with the three UTM parameters, **When** the page loads, **Then** the page view is
   recorded with `source`, `medium` and `campaign` (lowercased) and every other query parameter is still
   dropped.
2. **Given** a URL with only `utm_source`, **When** it loads, **Then** the page view is recorded with that
   source and the other two shown as "(not set)" in the report.
3. **Given** a URL with no UTM parameters, **When** it loads, **Then** no campaign is recorded and the page view
   counts as before.
4. **Given** a visitor who lands with UTM parameters and then navigates inside a single-page site, **When** the
   report is read, **Then** the campaign counts one page view, not one per route change.
5. **Given** the range has campaign traffic, **When** the page is open, **Then** it shows total campaign page
   views, campaign visitors, the share of all page views that carried a campaign, a trend, the top sources,
   mediums and campaigns, and the top source/medium/campaign combinations.
6. **Given** a selected source, medium or campaign, **When** the owner picks one, **Then** the totals, trend
   and combinations narrow to it.
7. **Given** the range has no campaign traffic, **When** the page opens, **Then** it explains how to tag links
   and links to the documentation, rather than showing empty tables.
8. **Given** the range begins before campaign reporting did, **Then** the report says it is partly available
   and from when (as the Events report does).

---

### User Story 2 - Ask an AI assistant about campaigns (Priority: P1)

As a user with the Vizoalica MCP server, I ask "which campaign brought the most visitors last week?" and the
`get_campaigns` tool answers from the same data, with the environment named first and the 30-day cap, like the
other tools.

**Acceptance Scenarios**:

1. **Given** a connected environment, **When** `get_campaigns` is called with a range and optional `source`,
   `medium`, `campaign`, `website`, **Then** it returns the same numbers as the console for that scope.
2. **Given** an access key scoped to one website, **When** it asks about another, **Then** it gets the same
   not-found the console gets.
3. **Given** a backend that predates the feature, **Then** the tool says the backend needs an update and names
   `vizoalica deploy <name> --update`.

---

### User Story 3 - UTM values cannot become a privacy leak (Priority: P1)

As a privacy-conscious operator, I need the campaign fields to hold only labels, never visitor data, even when
someone crafts a hostile link.

**Acceptance Scenarios**:

1. **Given** `utm_campaign=jane.doe@example.com`, **Then** the stored value is `[email]`.
2. **Given** `utm_source=4111111111111111` or a long digit run, **Then** the stored value is `[number]`.
3. **Given** a token-shaped value (for example a 32-character mixed-case id), **Then** it is stored as `[token]`.
4. **Given** a value longer than 64 characters, **Then** it is cut to 64.
5. **Given** a value with control or markup characters (`<script>`, newlines), **Then** those characters are
   removed; only letters, digits, space and `_ - . + : /` remain.
6. **Given** a value that is empty after cleaning, **Then** it is treated as not set.
7. **Given** a hostile client posting a page view whose `campaign` has oversized or non-string values, **Then**
   ingestion normalises or drops them and never stores the original.
8. **Given** the same batch is replayed, **Then** counts do not double (the existing seen-events guard).
9. The report never returns a visitor identifier, an address, a raw URL or a query value other than the three
   cleaned labels.

---

### Edge Cases

- Repeated parameters (`utm_source=a&utm_source=b`): the first value wins.
- Parameter names in other cases (`UTM_Source`): matched case-insensitively.
- `utm_*` in the fragment: ignored (only the query string is read).
- Consent denied: the SDK sends the page view as it already does; campaign follows the same rule as the page
  view (no extra events are created).
- Thousands of distinct campaign values (an attack, or a template bug): the report is bounded (20 per ranking,
  50 combinations) with an "other" total, and storage grows by at most one row per distinct combination per
  minute, which the retention job removes.
- A website with no token: unaffected; campaigns ride the same page-view event.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The SDK MUST read `utm_source`, `utm_medium` and `utm_campaign` (names case-insensitive) from the
  landing URL's query and attach cleaned values to the first page view of the page load, in a new optional
  `campaign` object of the page-view event data. It MUST NOT send any other query value.
- **FR-002**: Cleaning MUST: take the first value; decode; trim and collapse whitespace; lowercase; apply the
  existing label redaction (email, long digit run, token-shaped word); keep only letters, digits, space and
  `_ - . + : /`; cut to 64 characters; treat empty as absent. The same function MUST run in the browser and at
  ingestion.
- **FR-003**: Ingestion MUST re-clean `campaign`, drop it if every field is empty, and reject nothing for a
  malformed campaign other than what the event schema already rejects (wrong types fail schema validation).
- **FR-004**: The backend MUST count campaign page views and distinct visitors per minute, per website, per
  (source, medium, campaign), idempotently, using the same seen-events guard as other rollups.
- **FR-005**: The backend MUST expose `GET /v1/admin/projects/:projectId/analytics/campaigns` with the same
  range rules, role and scope rules as the Actions and Events reports, and optional exact filters `source`,
  `medium`, `campaign`, `source_id`.
- **FR-006**: Output MUST be bounded: 20 entries per ranking, 50 combinations, with an `other` count so
  `sum(rows) + other = total`.
- **FR-007**: The console MUST have a Campaigns page in the Analytics area using the shared time-range and
  website scope controls, with the states in the user stories and WCAG 2.2 AA.
- **FR-008**: The MCP server MUST add the read-only tool `get_campaigns` and the skill and docs MUST describe
  it.
- **FR-009**: A database migration MUST add the storage additively (new tables only), with an availability
  marker. Nothing existing is changed.
- **FR-010**: Retention and soft-deleted-website purge MUST include the new tables.
- **FR-011**: Documentation MUST include a Campaigns page (how to tag links, what is and is not collected,
  limits, upgrade order) and updates to the privacy page, browser SDK page, AI page and skill.

### Key Entities

- **Campaign label**: a cleaned string of at most 64 characters; empty means "not set".
- **Campaign minute row**: per website, minute, source, medium, campaign: page view count.
- **Campaign visitor row**: per website, minute, source, medium, campaign, visitor digest, identity kind.
- **Campaign availability marker**: when campaign reporting began on this backend.

## Privacy and Cost Review _(constitution I, Product Constraints)_

| Field           | Purpose                              | Retention                  | Access boundary                                | Review                                                                                                                    |
| --------------- | ------------------------------------ | -------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| source          | Attribute visits to a channel        | 32 days (minute rows)      | Admin and access keys by role and scope        | Set by the site owner in links, not visitor data. Redaction handles misuse; allow-listed characters; 64 chars.            |
| medium          | Attribute visits to a channel type   | same                       | same                                           | same                                                                                                                      |
| campaign        | Attribute visits to a named effort   | same                       | same                                           | same                                                                                                                      |
| visitor digest  | Distinct visitors per campaign       | same                       | Never returned; used for counts only           | Keyed digest of the daily-rotating id; same as the other reports.                                                         |

Threat model notes: a hostile link can put anything in `utm_*`; cleaning removes markup and identifiers, caps length
and character set, and reports are rendered as text (never as HTML). A hostile sender can create many distinct
combinations; the cost is bounded by existing per-website quotas and 32-day retention, and the report output is
bounded. No new request is added: the data rides the existing page-view event, and ingestion cost grows by at most
three small D1 statements per campaign page view (counts, visitors, availability read is only on report).

Cost model: one row per distinct combination per minute per website, plus one visitor row per visitor. A busy
campaign day of 10,000 tagged landings across 5 combinations is well under the free D1 write allowance and adds
nothing when no link is tagged.

Accessibility impact: new page, tables with headers and captions, keyboard-operable filters, text equivalents for
the trend, no information by color alone; covered by axe and keyboard tests (Principle: Accessible Product
Experience).

## Success Criteria _(mandatory)_

- **SC-001**: The landing example in User Story 1 produces the expected report in an automated end-to-end test
  that goes through the real `worker.fetch` and the real schema.
- **SC-002**: 100% of the hostile samples in User Story 3 are stored cleaned or dropped (unit and contract tests).
- **SC-003**: A page with 50 in-page route changes after a tagged landing records exactly one campaign view.
- **SC-004**: Report output size is bounded regardless of the number of distinct campaign values (a test inserts
  1,000 and checks 20 / 50 / `other`).
- **SC-005**: With no tagged links, the number of D1 statements per page view is unchanged (test).
- **SC-006**: The console page passes axe in light and dark at 320 px and 200% zoom, and is fully
  keyboard-operable.
- **SC-007**: Repository coverage stays above 90% lines and branches.

## Out of Scope

- `utm_term`, `utm_content`, `gclid`, `fbclid` and other click identifiers (never stored).
- Goals and conversion by campaign (issue #63 builds on this).
- Campaign attribution across visits or sessions (no visitor IDs are kept).
- Any change to the existing referrer report.

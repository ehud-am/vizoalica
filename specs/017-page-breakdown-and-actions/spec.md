# Feature Specification: Page Breakdown and Actions Report

**Feature Branch**: `017-page-breakdown-and-actions`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "now that the basics are done, let's start to further enhance the console. First thing, the analytics reports on all urls as "/" and does not show a breakdown. Second, and this is an enhancment, we want to report on actions. An action is something the user clicked, like a button or a link. Let's add another analytics page for actions, it will show a deep report of the URL+actions across the app."

**Owner decisions (2026-09-20, after the first draft)**:

- Action collection is always on. There is no per-website switch.
- Grouping pages that differ only by an identifier (for example `/orders/:id`) is included in this
  feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See Every Page, Not Just "/" (Priority: P1)

As a website owner, I open the Pages report and see each distinct page or screen of my site listed
separately with its own view count. This holds for sites that show different screens without
loading a new address (for example, sites whose screens are addressed after a `#`, such as
`#/analytics/pages`, and sites that change the address in place as the visitor moves around).
Today every view of such a site is reported under a single `/` entry, so the report says nothing
about what visitors actually looked at.

**Why this priority**: The Pages report, the Overview "top pages" list, and every later report
that groups by page are wrong for a whole class of sites (including Vizoalica's own console).
Reporting one page for everything is a correctness defect, and the Actions report in this feature
depends on knowing which page an action happened on.

**Independent Test**: Visit a sample site that has five screens reachable only through in-page
navigation (three addressed after `#`, two by in-place address changes), visiting each screen
several times. Open the Pages report and confirm five separate entries, each with the right view
count, and no aggregate `/` entry standing in for them.

**Acceptance Scenarios**:

1. **Given** a site whose screens are addressed after `#` (for example `#/pricing`), **When** a
   visitor opens three different screens, **Then** the Pages report lists three separate entries,
   each showing the screen's route (for example `/#/pricing`) and one view.
2. **Given** a site that changes its address in place while the visitor navigates (no full page
   load), **When** the visitor moves between screens, **Then** each move counts as one view of the
   new page and the Pages report lists each page separately.
3. **Given** a visitor who opens the same screen twice in a session, **When** the report is
   shown, **Then** that page shows two views.
4. **Given** a site whose address fragment is not a route (for example an in-page anchor such as
   `#section-2`, or a fragment carrying sign-in or token data), **When** a visitor loads or
   navigates, **Then** the fragment is not recorded and the page is reported by its plain path, as
   it is today.
5. **Given** events recorded before this feature shipped, **When** the Pages report is shown,
   **Then** those events still appear exactly as recorded and are not rewritten or removed.
6. **Given** a visitor who has not granted consent (where consent is required), **When** they
   navigate, **Then** no additional page views are recorded beyond what consent already allows.

---

### User Story 2 - One Entry for Pages That Differ Only by an Identifier (Priority: P1)

As a website owner, I see `/orders/:id` once, with the combined views of every order page, instead
of thousands of separate `/orders/8841`, `/orders/8842`, and so on. Pages that are the same kind
of page but show a different record are grouped, so the Pages report shows the structure of my
site and its long tail no longer buries the pages that matter.

**Why this priority**: Once every screen is reported separately (Story 1), sites with record pages
would flood the report with one-off entries and push out everything useful. Grouping is what makes
the corrected breakdown readable, and it also keeps individual record identifiers, which can be
personal data, out of the stored analytics.

**Independent Test**: Visit `/orders/8841`, `/orders/8842`, `/orders/8843`, and
`/users/3f2b8c1e-5d4a-4a37-9c1b-0e7d2a6f9b10/settings` once each, plus `/blog/my-first-post`. Open
the Pages report and confirm `/orders/:id` with three views, `/users/:id/settings` with one view,
and `/blog/my-first-post` unchanged, with none of the original identifier values visible anywhere.

**Acceptance Scenarios**:

1. **Given** visits to `/orders/8841` and `/orders/8842`, **When** the Pages report is shown,
   **Then** it lists one entry `/orders/:id` with two views.
2. **Given** a path segment that is an identifier of a recognized shape (a number, a UUID, a long
   hexadecimal value, or a long random-looking mix of letters and digits), **When** the page is
   recorded, **Then** that segment is replaced by `:id` and the original value is never stored.
3. **Given** a path made of ordinary words or readable slugs (for example `/pricing` or
   `/blog/my-first-post`), **When** the page is recorded, **Then** the path is left as it is.
4. **Given** a date-shaped path such as `/blog/2026/09/launch`, **When** the page is recorded,
   **Then** the year, month, and day segments are kept and are not replaced.
5. **Given** a route fragment such as `#/orders/8841`, **When** the page is recorded, **Then** the
   same grouping applies (`/#/orders/:id`).
6. **Given** actions and link destinations recorded on or pointing to such paths, **When** the
   Actions report is shown, **Then** the same grouping applies to them, so the page of an action
   matches the page in the Pages report.
7. **Given** events recorded before this feature shipped, **When** reports are shown, **Then**
   they appear as recorded and are not regrouped.

---

### User Story 3 - Actions Report: What People Click (Priority: P2)

As a website owner, I open a new Actions page in the Analytics area and see the actions visitors
took across my site: each row is an action (a button or link that was clicked) together with the
page it happened on, how many times it was taken, and by how many distinct visitors. I can see at
a glance which buttons and links are used most and which are ignored, without adding code for each
one and without turning anything on.

**Why this priority**: This is the new capability the owner asked for. It builds on Stories 1 and
2 (actions are only meaningful next to the correct, grouped page) and is the largest piece of new
value, but the product remains useful and correct if only Stories 1 and 2 ship.

**Independent Test**: On a sample site, click a known set of buttons and links on two different
pages a known number of times. Open the Actions page and confirm each action appears against the
right page with the right count and visitor count, sorted by most used, and that the Actions page
contains no control that changes any setting.

**Acceptance Scenarios**:

1. **Given** visitors have clicked buttons and links, **When** the owner opens the Actions page,
   **Then** it lists actions ranked by count, each row showing the page, the action's name, its
   kind (button or link), the number of times taken, and the number of distinct visitors.
2. **Given** a link to another website, **When** a visitor clicks it, **Then** the action is
   reported as a link and shows only the destination's site and path, never its query values.
3. **Given** the Actions page is open, **When** the owner changes the time range or the
   project/website scope in the console's shared controls, **Then** the report updates to match,
   exactly as the other analytics pages do.
4. **Given** a website with no recorded actions in the chosen range, **When** the owner opens the
   Actions page, **Then** it shows a clear empty state that explains what an action is and that
   actions appear once visitors use a site running the updated SDK, rather than an empty table.
5. **Given** the same action label appears on several pages, **When** the report is shown,
   **Then** each page's occurrence is a separate row (URL plus action), and a total per action
   across pages is also available.
6. **Given** traffic identified as bots, **When** the report is shown, **Then** bot activity is
   treated the same way the existing reports treat it.
7. **Given** a website whose owner has installed or updated the SDK file, **When** a visitor clicks
   a button, **Then** the action is recorded with no setting changed and no extra step beyond the
   update itself.

---

### User Story 4 - Deep Dive: Actions Per Page (Priority: P3)

As a website owner, I can pick a page and see everything visitors did on it, or pick an action and
see every page it was used on. For each page I see how many times the page was viewed next to the
actions taken on it, so I can tell whether an important button is actually being used.

**Why this priority**: The owner asked for a "deep report of the URL+actions across the app".
The ranked list in Story 3 answers "what is clicked"; this story answers "what happens on this
page" and "how well does this button perform". It refines Story 3 and is the natural last slice.

**Independent Test**: Open the Actions page, select one page, and confirm the view shows that
page's view count and only its actions with counts and each action's share relative to the page's
views; then select one action and confirm every page where it occurred is listed.

**Acceptance Scenarios**:

1. **Given** the Actions page, **When** the owner selects a page, **Then** the report narrows to
   that page, shows its total views and total actions, and lists its actions with the share of the
   page's views that led to each one.
2. **Given** the Actions page, **When** the owner selects an action, **Then** the report lists
   every page the action occurred on with counts for each.
3. **Given** a narrowed view, **When** the owner clears the selection, **Then** the full report
   returns and the selection is reflected in the address so the view can be bookmarked or shared
   with another console user.
4. **Given** a page with many different actions, **When** the report is shown, **Then** the most
   used are listed first and the long tail is summarized as "Other" with its total, so the report
   stays readable and complete in count.

---

### User Story 5 - Name or Exclude Individual Controls (Priority: P3)

As a site developer, I can give an important control a clear action name, and I can mark a
sensitive control so that clicks on it are never recorded. This is the only per-control setting;
action collection itself is always on.

**Why this priority**: Automatic labels are sometimes unclear ("Icon button"), and some controls
should never be reported. This is the developer's safety valve now that collection is automatic.
The privacy rules in the requirements apply to Stories 3 and 4 from the first release regardless
of this story.

**Independent Test**: On a sample site, click a control marked as excluded and a control given an
explicit name, then confirm the excluded one never appears in the Actions report and the named one
appears under the chosen name.

**Acceptance Scenarios**:

1. **Given** a control the site developer has marked as excluded, **When** a visitor clicks it,
   **Then** nothing is recorded for it.
2. **Given** a control the site developer has given an explicit action name, **When** a visitor
   clicks it, **Then** the report shows that name instead of the automatically derived label.
3. **Given** a control inside an area the developer has marked as excluded, **When** a visitor
   clicks it, **Then** nothing is recorded for it or for anything inside that area.
4. **Given** the documentation, **When** a developer looks for how to name or exclude a control,
   **Then** it gives the exact marking with one example of each.

---

### Edge Cases

- **Fragment carries secrets or personal data** (for example `#access_token=...`, or an email in a
  fragment route): only route-shaped fragments are recorded, any query portion of a fragment route
  is dropped, and values that look like tokens or emails are redacted the same way property values
  are today.
- **Identifier-like segments that are not identifiers** (for example `/page/2`, `/v2/docs`): a
  short number in a path is treated as an identifier and grouped (`/page/:id`), while segments
  containing letters and readable words (such as `v2`) are kept. The rule is documented so
  owners know what to expect, and anything the rule cannot recognize is kept as written.
- **Readable slugs that identify a record** (for example `/products/blue-widget`): not recognized
  as identifiers and reported as written; each such page appears separately, and the long tail is
  summarized as "Other" under the existing bounded reporting limits.
- **Date-shaped segments** (`/2026/09/launch`): kept, not grouped.
- **Very long or unusual labels**: action names are shortened to a fixed maximum, whitespace is
  collapsed, and labels that are empty fall back to a generic description of the control (for
  example, "Icon button") rather than being dropped.
- **Labels containing personal data** (a button reading "Delete jane@example.com"): label text
  passes through the same redaction as other free-text values, and the site developer can exclude
  or rename the control.
- **Form fields and typed content**: clicks on fields that accept typing, and anything in
  password, payment, or one-time-code fields, never record text, values, or labels beyond the fact
  that a field was activated; form submit buttons are recorded only by their own label.
- **Rapid repeated clicks** (double-clicks, holding Enter on a focused control): repeated
  activations within a very short window count once, so the counts reflect deliberate actions.
- **Keyboard and assistive activation**: pressing Enter or Space on a focused button or link
  counts as the action, the same as a mouse click.
- **Clicks on non-interactive areas** (text, images, empty space): not recorded; only buttons,
  links, and controls that behave as buttons or links are actions.
- **Elements inside embedded frames from another site**: not recorded.
- **Same page reached by different fragments or trailing slashes** (for example `/pricing` and
  `/pricing/`): treated as the same page.
- **Visitor navigates using back/forward**: each arrival counts as a view of the destination page.
- **Volume spikes or a script that clicks endlessly**: existing per-source limits apply, and the
  site's normal operation is never blocked or slowed.
- **Consent denied**: the host site is expected to load the SDK only after consent, as it is for
  page views today. In addition, when the site tells the SDK that consent is explicitly denied, no
  actions and no in-page navigation views are recorded.
- **Existing websites**: each website serves its own copy of the SDK file, so nothing changes for a
  site until its owner rebuilds and recopies that file as part of a Vizoalica upgrade. Websites on
  the older file keep reporting pages exactly as before and report no actions.
- **Newer SDK file with an older backend**: the site's normal operation and its page views must not
  be lost or stalled because the backend does not yet accept actions; the release notes require the
  backend to be upgraded before the SDK file.

## Requirements *(mandatory)*

### Functional Requirements

**Page breakdown**

- **FR-001**: The system MUST record and report a separate page for each distinct screen a visitor
  views, including screens addressed after `#` in the address and screens reached by changing the
  address in place without a full page load.
- **FR-002**: The system MUST count a page view each time a visitor arrives at a page, including
  in-page navigation and back/forward movement, without double-counting the initial load.
- **FR-003**: The system MUST record an address fragment only when it is route-shaped (begins
  with `/`), MUST drop any query portion inside it, and MUST ignore other fragments (in-page
  anchors, tokens, and sign-in data).
- **FR-004**: The system MUST treat paths that differ only by a trailing slash as the same page.
- **FR-005**: The system MUST leave events recorded before this feature unchanged and continue to
  include them in reports, without regrouping them.
- **FR-006**: The Overview and Pages reports MUST show the full page route (path plus route
  fragment when present) so an owner can tell screens apart.
- **FR-007**: Page recording MUST continue to respect consent state and existing per-source
  limits, and MUST NOT block or break the host website.

**Identifier grouping**

- **FR-008**: The system MUST replace each path segment that is an identifier with the placeholder
  `:id`, so that pages differing only by identifier are reported as one page. Recognized
  identifiers are: numbers, UUIDs, long hexadecimal values, and long random-looking mixes of
  letters and digits.
- **FR-009**: The original identifier value MUST NOT be stored or reported; grouping MUST take
  effect before the page or action is recorded.
- **FR-010**: The system MUST keep ordinary words and readable slugs as written and MUST keep
  date-shaped runs (year, month, day) as written.
- **FR-011**: Grouping MUST apply identically to page paths, route fragments, the page recorded
  with each action, and link destination paths, so that the same page has the same name in every
  report.
- **FR-012**: The grouping rule (what counts as an identifier and what does not) MUST be
  documented, with examples, in the public documentation.

**Actions report**

- **FR-013**: The system MUST record an action when a visitor activates a button, link, or control
  that behaves as one, by pointer or keyboard. Action collection is always on for every website
  running the updated SDK file and has no per-website setting.
- **FR-014**: Each recorded action MUST capture: the page it happened on, the action's name, its
  kind (button, link, or other control), and, for links, the destination's site and path only.
- **FR-015**: The system MUST NOT record typed text, field values, form content, query values,
  cookies, or page content as part of an action, and MUST NOT record labels from password,
  payment, or one-time-code fields.
- **FR-016**: The action name MUST come from an explicit name supplied by the site developer when
  present; otherwise from the control's visible or accessible label, collapsed and shortened to a
  fixed maximum length and passed through the same redaction rules as other free-text values.
- **FR-017**: Repeated activations of the same control by the same visitor within a short window
  MUST count once.
- **FR-018**: The system MUST provide an Actions page in the Analytics area, listed in the primary
  navigation beside the existing analytics pages, that is view-only (no control that changes a
  setting) and follows the console's shared scope and time-range controls.
- **FR-019**: The Actions report MUST list rows of page plus action with count, distinct visitors,
  and kind, ranked by count, and MUST provide each action's total across pages.
- **FR-020**: The Actions report MUST let the owner narrow to one page (showing that page's views,
  total actions, and each action's share of page views) and to one action (showing the pages it
  occurred on), and the narrowing MUST be reflected in the address so it can be bookmarked and
  shared.
- **FR-021**: The Actions report MUST bound its output: show the most used rows, summarize the
  remainder as "Other" with an accurate total, and never require an unbounded scan to render.
- **FR-022**: The Actions report MUST handle bot traffic, data availability states (complete,
  processing, unavailable), and empty results the same way the existing analytics pages do, and
  MUST show an empty state that explains what an action is when none are recorded.
- **FR-023**: The Actions report MUST be accessible with no information conveyed by color alone,
  a text or table alternative for any chart, and full keyboard operation.

**Control and privacy**

- **FR-024**: Site developers MUST be able to exclude a control, or an area of a page, from action
  recording and to give a control an explicit action name, using a documented, simple marking on
  the control.
- **FR-025**: Action recording MUST respect the visitor's consent state as page views do (the
  consent state travels with every event), and MUST additionally not record actions or in-page
  navigation views when consent is explicitly denied.
- **FR-026**: Action data MUST be recorded as a new, versioned kind of event, and events already
  accepted MUST remain valid and unchanged.
- **FR-027**: Action data MUST be subject to the same retention, project isolation, access
  control, quotas, and abuse limits as existing analytics data, and reports MUST return
  aggregates only, never individual visitor identifiers or raw events.
- **FR-028**: Because collection is always on, the documentation (including the privacy
  documentation, the installation guides, and the changelog) MUST state plainly that clicks on
  buttons and links are now recorded, exactly what is collected and never collected, how consent
  affects it, and how to rename or exclude a control.

### Key Entities *(include if feature involves data)*

- **Page**: A distinct screen of a website, identified by its origin, path (with identifiers
  replaced by `:id`), and route fragment when present. Has a view count over a range.
- **Page View**: One arrival of a visitor at a page. Belongs to a session and an anonymous visitor.
- **Action**: One deliberate activation of a button, link, or control by a visitor, on a page.
  Attributes: page, name, kind (button, link, other), destination site and path (links only),
  time. Belongs to a session and an anonymous visitor.
- **Action Summary (report row)**: The aggregate for one page-and-action pair over a range:
  count, distinct visitors, kind, and its share of the page's views.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a sample site with five screens reachable only through in-page navigation,
  100% of the screens visited appear as separate entries in the Pages report with correct view
  counts, and zero views are pooled under a generic `/` entry.
- **SC-002**: For a test set of 1,000 distinct record pages under one path (for example
  `/orders/<number>`), the Pages report shows exactly one entry for them with a view count of
  1,000, and none of the 1,000 original identifier values is present in stored or reported data.
- **SC-003**: Across a documented test corpus of readable, word-based paths and date-shaped paths,
  zero paths are wrongly replaced by `:id`; across a corpus of numeric, UUID, hexadecimal, and
  random-token segments, 100% are replaced.
- **SC-004**: On a site running the updated SDK file, 100% of test clicks on buttons and links
  (pointer and keyboard) appear in the Actions report against the correct page with correct
  counts, with no configuration step.
- **SC-005**: A website owner can find the ten most-used actions on a specific page in under
  one minute starting from the console's home screen.
- **SC-006**: Across a test corpus of pages containing typed input, tokens in addresses, emails
  in labels, and password/payment fields, zero recorded pages or actions contain typed content,
  query values, tokens, emails, or field values.
- **SC-007**: Recording pages and actions adds no user-perceivable delay to the host website: any
  click or navigation is handled with under 50 ms of added time, and the host site continues to
  work fully when Vizoalica is unreachable.
- **SC-008**: New and changed console pages have zero automated accessibility violations at WCAG
  2.2 AA and are fully operable by keyboard alone.
- **SC-009**: New action and page data appears in reports with the same freshness as existing
  page-view data.
- **SC-010**: Repository-wide automated test coverage remains above 90% for lines and branches
  with this feature included.

## Assumptions

- **Scope of the "/" fix**: The defect is that pages addressed after `#` and in-place address
  changes are collapsed into `/`. The fix covers both.
- **Console dogfooding**: Vizoalica's own console uses `#`-addressed screens, so it is the
  primary real-world example and a natural acceptance target.
- **Always-on actions (owner decision)**: There is no owner-level switch and no per-website
  setting for action collection. The only limits are the visitor's consent state and the
  developer's per-control exclusion. Collection begins for a website only when its owner deploys
  the updated SDK file, which is a deliberate upgrade step, but it is still a privacy-relevant
  change in what the SDK collects, so the privacy review, documentation, and changelog (FR-028)
  are part of this feature's deliverables rather than follow-up work.
- **Action definition**: An action is a click or keyboard activation on a button, a link, or a
  control that behaves as one. Hovers, scrolls, form input, and clicks on non-interactive areas
  are not actions. Form submissions are recorded only as the activation of their submit button.
- **Identifier grouping (owner decision)**: Grouping is automatic and based on the shape of a
  path segment. It cannot recognize readable slugs that identify a record
  (`/products/blue-widget`); letting owners define their own grouping rules is out of scope for
  this feature and can be a later addition. Grouping is applied before recording, so raw
  identifiers are never stored.
- **Older data is not regrouped**: Events recorded before this feature keep their original
  paths. Owners will see old individual record pages and new grouped entries side by side until
  the older data expires by normal retention.
- **Naming and exclusion**: A documented marking on a control (name and exclude) is enough for
  developer control in the first release; a console-side list of exclusions is out of scope.
- **Privacy review required**: Action name and link destination are new data fields. Per the
  constitution, they need a documented purpose, retention expectation, access boundary, and
  privacy review, which are delivered with this feature's documentation.
- **Retention and access**: Action data follows the same retention window and project-level
  access rules as page views. Role-based access control remains a separate, later specification.
- **Console structure**: The Actions page is added to the Analytics area only and is view-only,
  consistent with the view/manage separation in the console. Nothing is added to the Manage area.
- **Compatibility and rollout**: The SDK file is hosted by each website, so owners adopt the
  improvements by rebuilding and recopying it during an upgrade (the existing documented step).
  Older SDK files keep working and keep reporting pages as they do today; identifier grouping is
  also applied when events are received, so older files benefit from it without an update. The
  backend must be upgraded before the SDK file. The backend change adds new storage but changes no
  existing storage.
- **Sessions and visitors**: "Distinct visitors" uses the same anonymous, consent-aware visitor
  identity that existing reports use; no new visitor identifier is introduced.

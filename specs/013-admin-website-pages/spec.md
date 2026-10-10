# Feature Specification: Website Administration Pages and Installation Flow

**Feature Branch**: `013-admin-website-pages`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "Extend the console improvement to administration usability. The websites admin page is problematic: the organization between the list of websites (cards) and the details of a website is not good. Create the edit form as its own page with a back button; think carefully about this usability issue. Second, the install page: choosing between static and dynamic looks awkward; think deeply about how to make it better."

**Companion artifact**: [design.md](./design.md) records what is wrong today, what people are trying to do, the options considered, and why this shape was chosen.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Websites, Open One (Priority: P1)

As an operator, I see my project's websites as a simple list of cards with no forms on the page,
and I open any one of them to reach a page that belongs to that website alone.

**Why this priority**: The list and the detail are currently one screen that shares a hidden
selection, shows two forms at once, and starts with a blank pane. Separating "the list" from "one
website" is the base for every other change here.

**Independent Test**: With three websites, a tester opens the list, sees each website's name,
first origin, and status, opens one, uses the browser back button to return, and confirms the list
has no editing fields on it.

**Acceptance Scenarios**:

1. **Given** a project with websites, **When** the operator opens Websites, **Then** each website
   appears as a card showing its name, its first allowed origin (with a count of any others), and
   its status, and the page shows one primary "Add website" action and no form fields.
2. **Given** the website list, **When** the operator activates a card by mouse, touch, or keyboard,
   **Then** the website's own page opens and the card is a single, clearly named link.
3. **Given** a website's page, **When** the operator uses the browser back button or the visible
   back link, **Then** they return to the list they came from.
4. **Given** a website's address, **When** it is opened directly or after a reload, **Then** the
   same website's page opens without needing anything selected elsewhere.
5. **Given** an address for a website that is not in the current project (or no longer exists),
   **When** it is opened, **Then** the page says so plainly and links back to the list, and nothing
   about another website is shown.
6. **Given** a project with no websites, **When** the operator opens Websites, **Then** an empty
   state explains what a website is here and offers "Add website".
7. **Given** any website page, **When** it is displayed, **Then** the shell's Website selector is
   not shown (the website is identified by the page), and the project appears in the page's
   breadcrumb.

---

### User Story 2 - Edit a Website on Its Own Page (Priority: P1)

As an operator, I change a website's name or allowed origins on a page dedicated to that form,
with a clear way back and protection against losing my changes.

**Why this priority**: This is the direct request. An always-open edit form beside a second add
form makes it unclear what saving will do.

**Independent Test**: A tester opens a website, chooses Edit, changes the name, tries to leave
with the change unsaved and is asked to confirm, cancels the leave, saves, and lands back on the
website's page with the new name and a confirmation.

**Acceptance Scenarios**:

1. **Given** a website's page, **When** the operator chooses Edit, **Then** a page opens that
   contains only that website's edit form, its name in the heading, and a visible back link to the
   website's page.
2. **Given** the edit page, **When** nothing has changed, **Then** Save is unavailable and the back
   link and Cancel leave immediately.
3. **Given** unsaved changes, **When** the operator uses Cancel or the back link, **Then** they are
   asked whether to discard the changes, with "Keep editing" as the default action.
4. **Given** valid changes, **When** the operator saves, **Then** the website is updated, they are
   returned to the website's page, and a confirmation appears there.
5. **Given** a save that fails, **When** the error is reported, **Then** the operator stays on the
   edit page with their entries preserved and a message explaining what to do.
6. **Given** invalid entries (empty name, an origin that is not an exact http or https origin),
   **When** the operator saves, **Then** the problem is shown next to the field and nothing is sent.
7. **Given** the edit page is opened by keyboard only, **When** the operator uses it, **Then**
   focus starts on the first field, the back link, fields, Save, and Cancel are all reachable, and
   errors are announced.

---

### User Story 3 - Add a Website, Then Install It (Priority: P1)

As an operator, I add a website on its own page (choosing the project first, as before), and when
it is created I land directly on that website's installation, because installing is the next thing
I need to do.

**Why this priority**: Creating a website has no value until it is installed. Sending people to a
list where they must find it again wastes the first-run moment.

**Independent Test**: A tester with two projects adds a website to the second project and ends on
that website's Install page in that project, with a confirmation naming the website and project.

**Acceptance Scenarios**:

1. **Given** the website list, **When** the operator chooses "Add website", **Then** a page opens
   containing only the add form, whose first required field is an empty project choice, with a back
   link to the list.
2. **Given** valid entries and a chosen project, **When** the operator saves, **Then** the website
   is created in exactly that project and the operator lands on its Install page with a
   confirmation naming the website and project.
3. **Given** no project exists, **When** the operator opens the add page, **Then** creation is
   unavailable and a clear action leads to creating a project.
4. **Given** the chosen project becomes unavailable before saving, **When** the operator saves,
   **Then** creation stops, the reason is explained, and entries are preserved.
5. **Given** the add form has entries, **When** the operator uses the back link, **Then** they are
   asked before losing them (same rule as Edit).

---

### User Story 4 - Install With a Clear Path and a Finish Line (Priority: P1)

As an operator installing a website, I first say how the website is deployed, then follow a short
numbered list for that route, and at the end I can check that data is actually arriving.

**Why this priority**: The static/dynamic chooser reads like a saved setting, uses implementation
names, gives no recommendation, warns only after you act, and leaves a wall of code with no way to
confirm success. This is the second request.

**Independent Test**: A first-time tester is asked to install a website that deploys from GitHub
to Cloudflare Pages, and another that is pasted by hand. Each chooses the right path unaided, finds
every value to copy, and confirms data is arriving.

**Acceptance Scenarios**:

1. **Given** a website's Install page, **When** it opens, **Then** the first thing asked is how the
   website is deployed, shown as two path choices with a plain-language description each: "GitHub →
   Cloudflare Pages" (marked Recommended) and "Paste a snippet". Each also names its technical
   equivalent (dynamic configuration, static snippet) in small text.
2. **Given** no earlier choice for this website, **When** the page opens, **Then** the recommended
   path is selected. **Given** an earlier choice, **Then** it is remembered for that website.
3. **Given** either path, **When** it is selected, **Then** a persistent line states that only one
   path should be used per website so analytics starts once, and no warning appears only after a
   switch.
4. **Given** the GitHub → Cloudflare Pages path, **When** it is shown, **Then** it presents
   numbered steps, each with one action and at most one code block: add the loader to the pages;
   add the deploy workflow; add the settings and secrets; push to deploy; check it works.
5. **Given** the settings step, **When** it is shown, **Then** the same information is offered two
   ways in one step (GitHub's website, or the `gh` command line) as a two-way toggle rather than
   two separate numbered steps, and public variables are distinguished from account-specific
   variables and secrets in a small table naming each and where its value comes from.
6. **Given** the Paste a snippet path, **When** it is shown, **Then** it presents numbered steps:
   add the snippet to the pages; host the SDK file and a token endpoint (stating that the endpoint
   signs with the shared token secret and that the secret never goes in a page, with the project,
   source, and public key identifiers to copy and a link to the full guide); deploy; check it works.
7. **Given** the Paste a snippet path, **When** the operator wants to keep settings out of pages
   or use another host, **Then** a disclosure offers the generic loader and its configuration
   document without cluttering the main path.
8. **Given** any path, **When** the operator chooses "Check now", **Then** the page reports what
   it found for the last 24 hours (page views received for this website, and on the GitHub path
   whether the configuration file is reachable) and says what to do next in each outcome.
9. **Given** any code block, **When** the operator copies it, **Then** the button confirms
   "Copied" in place and the confirmation is announced to assistive technology.
10. **Given** the identifiers (project ID, source ID, public source key), **When** they are not
    needed by the current step, **Then** they are available in a collapsed reference section at
    the end rather than leading the page.
11. **Given** a local service that returns only one installation mode, **When** the page opens,
    **Then** the missing path is shown as unavailable with an explanation and the other is used.
12. **Given** the installation guidance cannot be loaded, **When** the page opens, **Then** a clear
    error with a retry appears, not a blank page.

---

### User Story 5 - A Website Page That Is the Hub (Priority: P2)

As an operator, the page for one website gathers what I need to know and do for it: where it is
allowed to collect from, its identifiers, whether it is healthy, and how to edit it, install it,
see its analytics, turn it off, or remove it.

**Why this priority**: With a page per website, this is where the existing status, reachability,
availability, and danger-zone pieces belong, and it removes the old "Installation" navigation item
that asked which website you meant.

**Independent Test**: A tester on a website's page can reach Edit, Install, and Analytics in one
action each, sees live status, disables the website through a named confirmation, and can find no
way to delete it that skips confirmation.

**Acceptance Scenarios**:

1. **Given** a website's page, **When** it opens, **Then** it shows the name and status, the
   allowed origins, the identifiers with a copy control each, and the actions Edit, Install, and
   View analytics.
2. **Given** View analytics, **When** the operator uses it, **Then** Analytics opens with that
   website selected as the scope.
3. **Given** the page, **When** it loads, **Then** a status card shows collection, aggregation,
   configuration, and data-access state and the configuration file's reachability, with the
   recommended next step, and shows a busy state while it loads and an error state if it fails.
4. **Given** an enabled website, **When** the operator wants to disable it, **Then** the action is
   in the danger zone and asks for a named confirmation. **Given** a disabled website, **Then**
   Enable is offered as a routine action.
5. **Given** the danger zone, **When** the operator deletes the website, **Then** the same named
   confirmation and permanence wording as before is required, and afterwards they land on the list
   with a confirmation.
6. **Given** primary navigation, **When** it is displayed, **Then** Manage lists Projects,
   Websites, and Health, and Websites is shown as the current item on every website page.
7. **Given** an Analytics view of a website with no page views, **When** its hint offers the
   installation, **Then** the link opens that website's Install page (or the list when no website
   is selected).

---

### Edge Cases

- A website is renamed while its page is open elsewhere: the page shows the current name after
  reload and the edit form loads the current values.
- The last website is deleted: the operator lands on the list's empty state.
- The scope's project changes while on the list: the list reloads for the new project.
- A very long name or origin: cards and headings wrap without breaking layout, and full values are
  available on the website page.
- Many allowed origins: cards show the first and a count; the website page lists all.
- A disabled website: its card and page are clearly labelled, Install and Edit still work, and
  "Check now" explains that a disabled website does not collect.
- "Check now" while the local service is unreachable: the result says the check could not be made,
  not that no data arrived.
- Narrow screens and 200% zoom: cards stack, the path choices stack, code blocks scroll within
  themselves, and there is no horizontal page scrolling.
- The browser back button after saving: it returns to the previous page without resubmitting.
- Clipboard access is unavailable: the copy control says so and the code stays selectable.

## Requirements *(mandatory)*

### Functional Requirements

**Website pages**

- **FR-001**: The Websites destination MUST show the current project's websites as cards
  (name, first allowed origin with a count of any others, status), with one primary "Add website"
  action, and MUST NOT display any form fields.
- **FR-002**: Each website MUST have its own page with its own address, reachable by activating its
  card, by direct address, and after a reload. Back navigation MUST return to the previous page.
- **FR-003**: A website page MUST NOT show the shell's Website selector. The page MUST show the
  project in a breadcrumb, and an unknown or foreign website address MUST show a clear
  not-found state with a link to the list.
- **FR-004**: The website page MUST show the name, status, all allowed origins, and the identifiers
  (project ID, source ID, public source key) each with a copy control, and the actions Edit,
  Install, and View analytics.
- **FR-005**: The website page MUST show operational status and configuration reachability with the
  recommended next step, including busy and error states.
- **FR-006**: Enabling MUST be a routine action. Disabling and deleting MUST remain in a distinct
  danger zone with named confirmations and the existing permanence wording, and deleting MUST end
  on the list with a confirmation.
- **FR-007**: View analytics MUST open Analytics with that website as the scope.

**Add and edit pages**

- **FR-008**: Editing a website MUST happen on its own page containing only the edit form, with a
  visible back link to the website's page, Save, and Cancel.
- **FR-009**: Save MUST be unavailable until something has changed. Cancel and the back link MUST
  leave immediately when nothing changed, and MUST ask for confirmation when there are unsaved
  changes, with keeping the edits as the default.
- **FR-010**: A successful save MUST return to the website's page with a confirmation. A failed
  save MUST keep the operator on the page with entries preserved.
- **FR-011**: Field problems (empty name, an origin that is not an exact http or https origin, no
  origin) MUST be reported next to the field, and no request MUST be made for invalid input.
- **FR-012**: Adding a website MUST happen on its own page containing only the add form, whose first
  required field is an empty project choice (unchanged), with a back link to the list and the same
  unsaved-changes rule as editing.
- **FR-013**: A successful add MUST create the website in exactly the chosen project and land on its
  Install page with a confirmation naming the website and project. With no project, creation MUST
  be unavailable with a path to create one.

**Installation**

- **FR-014**: Installation MUST be a page of the website (its own address), not a top-level
  destination, and MUST NOT rely on the shell scope to know which website it is for.
- **FR-015**: The page MUST open by asking how the website is deployed, as two path choices with
  plain-language descriptions, a Recommended marker on GitHub → Cloudflare Pages, and the technical
  name (dynamic configuration, static snippet) in secondary text. The choices MUST be operable with
  keyboard and exposed to assistive technology as a set of mutually exclusive choices.
- **FR-016**: The recommended path MUST be selected by default, and a choice MUST be remembered
  per website in the browser when storage is available.
- **FR-017**: A persistent statement MUST say to use one path per website; a warning MUST NOT
  appear only after switching.
- **FR-018**: The GitHub → Cloudflare Pages path MUST be a numbered list of steps with one action
  and at most one code block each: loader, workflow, settings and secrets, deploy, check.
- **FR-019**: The settings step MUST offer GitHub's website and the `gh` command line as a
  two-way toggle within one step, and MUST present public variables, account-specific variables,
  and secrets distinctly, naming each and where its value comes from, and stating that secrets are
  never pasted into the console.
- **FR-020**: The Paste a snippet path MUST be a numbered list: snippet, SDK file and token
  endpoint (stating the shared-secret requirement, showing the identifiers to copy, and linking the
  full guide), deploy, check.
- **FR-021**: The generic loader and configuration document for other hosts MUST be available in a
  disclosure within the Paste a snippet path.
- **FR-022**: A "Check now" action MUST read the website's page views for the last 24 hours and, on
  the GitHub path, the configuration file's reachability, and MUST report the result and next step
  for success, no data yet, and a failed check. It MUST NOT change anything.
- **FR-023**: Each code block MUST have its own copy control that confirms in place and is
  announced to assistive technology, and MUST say when copying is unavailable.
- **FR-024**: Identifiers MUST appear in a collapsed reference section unless the current step
  needs them.
- **FR-025**: If only one installation option is available, the other MUST be shown as unavailable
  with a reason. If guidance cannot be loaded, a clear error with retry MUST be shown.

**Navigation and consistency**

- **FR-026**: Manage navigation MUST list Projects, Websites, and Health. Website, edit, add, and
  install pages MUST mark Websites as the current item.
- **FR-027**: The Analytics no-data hint MUST link to the Install page of the selected website, or
  to the list when none is selected.
- **FR-028**: Every state-changing control introduced or moved MUST carry a capability from the
  capability matrix and remain in the Manage area, and Analytics MUST remain free of them.
- **FR-029**: All new and changed pages MUST meet WCAG 2.2 Level AA, be operable by keyboard alone,
  reflow to phone width and 200% zoom, and have automated accessibility, keyboard, and responsive
  checks.
- **FR-030**: README, operator guide, the activation guide, and the changelog MUST describe the new
  website pages and installation flow, and no document may point at the removed Installation
  destination.

### Key Entities *(include if feature involves data)*

- **Website page**: The addressable page for one website within a project; the hub for its details,
  status, and actions.
- **Installation path**: One of two routes for getting analytics onto a website: GitHub → Cloudflare
  Pages (dynamic configuration), or Paste a snippet (static snippet). Exactly one is chosen per
  website; the choice is a per-viewer convenience, not stored data.
- **Installation step**: A numbered unit of a path with one action and at most one code block.
- **Install check**: A read-only result combining recent page views for the website and, where
  relevant, configuration reachability.
- **Unsaved change**: A difference between a form's entries and the saved website.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The websites list contains zero form fields, and a website's page contains zero form
  fields other than the confirmation input inside a destructive dialog.
- **SC-002**: From the list, a tester reaches Edit, Install, or Analytics for a chosen website in
  at most two actions each.
- **SC-003**: In moderated sessions with at least five first-time testers, at least 90% choose the
  installation path that matches their scenario without help, and at least 90% correctly answer
  "which secrets do I set and which are public?" from the page alone.
- **SC-004**: In the same sessions, at least 90% complete "confirm that data is arriving" using the
  page, without leaving it to consult other documentation.
- **SC-005**: A tester who edits a name and leaves without saving is asked to confirm 100% of the
  time, and one who has changed nothing is never asked.
- **SC-006**: 100% of website pages, including direct opens and reloads, show the correct website,
  and 0% show another website's data for an unknown or foreign address.
- **SC-007**: Every installation path presents at most 5 numbered steps, and no step contains more
  than one code block.
- **SC-008**: All new and changed pages have zero serious or critical automated accessibility
  violations in light and dark themes, and keyboard-only testers complete edit, add, and install.
- **SC-009**: No horizontal page scrolling at 320px width and 200% zoom on any new page.
- **SC-010**: The Analytics screens still contain zero state-changing controls.

## Assumptions

- No backend or local-API change is needed. The installation guidance API already returns both
  installation options, and the install check uses existing read-only endpoints (analytics for the
  website over the last 24 hours, and configuration reachability).
- Pages are addressed with the console's existing hash-based routes; website pages use the website's
  ID in the address.
- The remembered installation path is a per-viewer convenience kept in browser storage that may be
  unavailable, in which case the recommended path is used.
- The unsaved-changes prompt covers the page's own Cancel and back link, not the browser's back
  button or closing the tab.
- The website list does not show per-website health; it would need one status request per card.
  Health remains on its own page and on each website's page.
- Removing Installation from primary navigation is intentional. The Install page is reachable from
  each website, from the add-website flow, and from the Analytics hint.
- The recommendation of GitHub → Cloudflare Pages reflects the project's existing guidance; other
  hosts use Paste a snippet.
- Existing behavior stays: project-first website creation, the permanence wording and typed-name
  rules, the capability matrix, the shell scope for Analytics and Health, theming, and the footer.

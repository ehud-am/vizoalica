# Feature Specification: Simpler Website Management and Install

**Feature Branch**: `020-simpler-website-install`

**Created**: 2026-09-25

**Status**: Draft

**Input**: User description: "Let's start to work on the next version. I want to further simplify the website management experience and the install side. Please review the experience for CRUD of the websites within a project and the install process and share a list of potential improvements and simplifications. One example to get started is that if we had good default values, the number of variables needed to embed the website should be lower."

## Review: where the experience is heavier than it needs to be

This section is the review the request asked for. It records what a person hits today (read from the current console and install guidance, 2026-09-25); the stories and requirements below turn the worthwhile items into scope. Items not taken up are listed under "Not in scope".

### Install: too many values for what is really one decision

| # | Finding today | Simplification |
|---|---------------|----------------|
| I1 | The "paste a snippet" path shows a tag with six settings: SDK location, ingest address, public source key, project ID, token URL and consent. Only the source key varies per website; the ingest address is the same for every website on a backend, the token URL is a fixed conventional path, and consent is nearly always "unknown". | Ship good defaults so the tag carries only what is truly unique to the website (its source key). Everything else is implied unless the person overrides it. |
| I2 | The GitHub → Cloudflare path asks for **12** things: 8 public variables, 2 account values and 2 secrets. Six of the eight public variables are identical for every website on the backend, and two of them (the website ID and the site origins) duplicate information the console already holds. | Collapse the public variables to one or two per website (identity and backend address); everything else defaults. Show a count up front: "2 public values, 3 you supply". |
| I3 | The project ID and the source key are both required in the tag, although a source key already belongs to exactly one website in one project. | Make the source key alone sufficient to identify the website; the project ID becomes optional. |
| I4 | The snippet's SDK location is tied to the *first* allowed origin. Someone serving the site from a second hostname gets a script address that points at the wrong host. | Default the SDK location to a site-relative path, which works on every allowed hostname. |
| I5 | The "generic loader" (dynamic) mode and the "paste a snippet" mode are two ways to do the same thing, with a hidden details drawer to reach the second. Two SDK files and a JSON document are explained in prose. | Present one recommended embed; keep the loader as a clearly labelled advanced option, not a co-equal path. |
| I6 | The person must download the SDK file, save it in the right folder, and download it again after every Vizoalica update. | Offer an embed that loads the SDK without saving a file on the site (with the file option kept for people who host everything themselves). |
| I7 | The token endpoint (a small piece of server code that signs short-lived tokens) is the hardest part of the install, yet it is a paragraph and a link to an external guide. | Provide a ready-to-copy endpoint for the common hosts, and a single "does my endpoint work?" check that says which part is wrong. |
| I8 | The deploy workflow has a placeholder (`YOUR_SITE_DIRECTORY`) that the person must find and replace by hand. | Default the site folder to the repository root when omitted, or ask for it once in the console and fill it in. |
| I9 | The two account values (Cloudflare account ID and Pages project name) are explained in four paragraphs of "where to find it". | Where the console or CLI can already see the Cloudflare account, prefill them; otherwise a single command that prints both. |
| I10 | The choice between the two install paths is asked first ("How is this website deployed?") even for someone who has not decided. The choice is remembered per website, per browser, and reset on another machine. | Recommend one path by default, ask only when the answer changes what is shown, and keep the choice with the website rather than the browser. |
| I11 | "Check that it works" is the last step; failures are explained afterwards in prose. | Run the check as soon as the person says they deployed, and turn each failure into the one next action. |

### Website management (create, read, update, delete)

| # | Finding today | Simplification |
|---|---------------|----------------|
| W1 | **Create** asks for three things: project, name, allowed origins. Origins are typed as an exact origin (scheme and host, no path, no trailing slash) and rejected with an error when the person pastes the address from the browser bar. | Accept a pasted address or bare domain and tidy it to an exact origin (`example.com/pricing` → `https://example.com`). Show the result before saving. |
| W2 | The person must list the bare domain *and* `www` themselves, and the form only reminds them in small print. | Offer "also allow www.example.com" as one tick, on by default when the domain has one form. |
| W3 | The project is the first field even when the person is already working inside a project. | Show the project in scope as a read-only line; no project field (see S5). |
| W4 | Name is required, though the domain is a good name. | Default the name from the first origin (`example.com`); the person can still change it. |
| W5 | Allowed origins are required at creation, so a person who just wants a working install cannot get a snippet without knowing every hostname. | Allow a website to be created with one origin and add more later; say plainly what happens for traffic from an origin not in the list. |
| W6 | After creating, the person lands on the install page; after editing the origins they land on the website page, and nothing says the installed snippet or variables may now be out of date. | After an edit, say what (if anything) must be updated on the installed site. The embed no longer depends on the origins, but the site's token endpoint keeps its own origin list, so a name change needs nothing and an origin change needs that list updated. |
| W7 | **Read** is split over three pages (list card, website page with details and status, install page). The identifiers (project ID, website ID, source key) appear in three places. | One website page that shows status, the embed to copy, and the check, with edit and install as sections rather than separate journeys. |
| W8 | **Update** is one form for name and origins, and enable/disable is a separate confirmation on another page. | Keep name and origins together; put enable/disable next to the status where it is understood. |
| W9 | **Delete** is a two-step danger zone behind a confirmation dialog on the website page, and the person must find it under status. | Keep the confirmation (deletion is permanent) but state what stops working on the live site, since its embedded tag will begin to fail quietly. |
| W10 | Adding several websites means repeating the whole flow each time. | Several pasted addresses become the allowed origins of one website (apex and `www`, staging); a separate website is one more short step, with an "Add another website" link on the install page. Creating several websites from one paste is not done. |

### Console shell and navigation (added 2026-09-25)

| # | Finding today | Simplification |
|---|---------------|----------------|
| S1 | The environment control shows `name (role)` inside a native dropdown; the arrow overlaps the text, and role and problems are crammed into the same string. With one environment it is a different-looking plain label. | Replace it with a compact, purpose-built switcher: the name is the label, the role is a small separate badge, an unusable environment is a disabled row with its reason underneath, and the arrow never touches text at any width. One environment renders the same control; it opens only for an administrator, whose menu holds Access keys. |
| S2 | The footer has a brand block, a tagline, two link columns (10 links) and a legal line with the version. | One line: `Vizoalica · vizoalica.dev · GitHub`. Nothing else; the version moves to where it is useful (Health, under Backend). |
| S3 | The environment is at the top right, but the project is chosen in a separate bar under the header, and only on some pages. The person has to hunt for two controls to know what they are looking at. | One scope group at the top: **Environment, then Project**, side by side. Every page except Projects runs inside that pair. The lower bar keeps only the per-page filters (website, time range). |
| S4 | A project dropdown that also offers "create new" would fight with the Projects page, which today has its own create form, list, refresh, and delete. Two places would create projects, and it is unclear which is the home of projects. | The switcher only **switches**. It lists the projects, marks the current one, and ends with one entry, "All projects…", that opens the Projects page. Creating, renaming and deleting projects happens only on that page. With no project yet, the switcher shows "Create your first project" pointing at it. |
| S5 | Adding a website asks the person to choose a project, even though they are already working inside one. | The project is shown as a read-only line ("in project *Marketing*") in the form, not a field. See W3. |
| S6 | Health and Backend are separate pages with the same purpose (is it working?), one scoped to a project and one to the environment. It is unclear why there are two, and the versions table has nothing to do with any website. | One **Health** page with two labelled sections: "Backend" (environment-wide: versions, database, storage) and "Websites" (per project). Backend leaves the navigation; its address keeps working and opens Health. |
| S7 | "Access" sits in the navigation for administrators without saying who it is for. It issues keys for analysts and website owners, and a similar "Share setup" already exists on each website page, so there are two doors to one job. | Keep the ability (revoking a key is a real security need) but stop presenting it as a peer of Websites and Health. Reach it from the website's Share section and the environment menu as "Access keys", open with one sentence saying who the keys are for, and hide it entirely from people who cannot use it. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Embed a website with one identifying value (Priority: P1)

A site owner registers a website and needs the smallest possible embed. Today they copy a six-setting tag; with sensible defaults, the tag carries only what is unique to their website and everything else is implied.

**Why this priority**: It is the example the request started from and the largest single source of copy-paste error and reading effort in the install.

**Independent Test**: Register a website on a backend, copy the embed shown, place it on a page served from an allowed origin, and confirm events arrive, without editing or supplying any other value.

**Acceptance Scenarios**:

1. **Given** a registered website, **When** the person opens its install guidance, **Then** the recommended embed contains at most two values they must copy (the website's public key and, only if it cannot be inferred, the backend address).
2. **Given** the recommended embed with defaults, **When** it runs on any allowed hostname of the website, **Then** events are recorded for the correct website and project.
3. **Given** the person needs a non-default (for example, a different token path or consent behaviour), **When** they choose "customize", **Then** each default is shown with its value and can be overridden, and the embed shows only the overrides.
4. **Given** an embed that works today, **When** this version is released, **Then** it keeps working unchanged.

---

### User Story 2 - Add a website in one short step (Priority: P1)

A site owner adds a website by pasting its address. The console works out the name, the exact origin, and the `www` variant, and asks for nothing it can infer.

**Why this priority**: Creating is the first thing everyone does; today it is where typos in origins block the person before they reach install.

**Independent Test**: With a project already chosen, add a website by pasting a full page address, and end with a saved website whose origin and name are correct and visible before saving.

**Acceptance Scenarios**:

1. **Given** the person is working inside a project, **When** they open "Add website", **Then** the project is shown as a read-only line (not a choice) and the only required input is an address. If no project exists, the page sends them to create one first.
2. **Given** a pasted address containing a path, query or trailing slash, **When** they continue, **Then** it is shown as the exact origin it will be saved as, and nothing is rejected that can be tidied safely.
3. **Given** a domain with a `www` counterpart, **When** the person adds it, **Then** they can allow both with one choice, on by default.
4. **Given** the name is left empty, **When** they save, **Then** the website is named after its domain and the name can be changed later.
5. **Given** an address that cannot be turned into a valid origin (for example, an unsupported scheme), **When** they continue, **Then** the message says what to type instead.

---

### User Story 3 - Fewer values on the GitHub → Cloudflare path (Priority: P2)

A site owner deploying through GitHub and Cloudflare Pages adds a few repository settings instead of a dozen, and the console tells them up front how many they are.

**Why this priority**: It is the recommended path and the longest list of values; it benefits from the same defaults as Story 1.

**Independent Test**: Follow the recommended path on a fresh repository, count the values the person must add, and confirm the deployed site collects events.

**Acceptance Scenarios**:

1. **Given** the recommended path, **When** the guidance is shown, **Then** it states how many public values and how many secrets the person adds, and lists only those.
2. **Given** values that are the same for every website on the backend, **When** guidance is shown, **Then** they are defaulted rather than listed as required.
3. **Given** the starter workflow, **When** the person copies it, **Then** it works for a site at the repository root without editing, and a site in a subfolder needs exactly one change that the guidance names.
4. **Given** the person's Cloudflare account can be seen by the console or CLI, **When** guidance is shown, **Then** the account values are prefilled or one command prints them.

---

### User Story 4 - Know the site is installed, and what to fix if not (Priority: P2)

After deploying, the person gets one clear answer: working, or the single next thing to do.

**Why this priority**: Fewer values means fewer failure causes, but the token endpoint and file placement can still go wrong; the check is where confidence comes from.

**Independent Test**: Break each install part in turn (missing file, missing token endpoint, wrong secret, unlisted origin) and confirm the check names exactly that part.

**Acceptance Scenarios**:

1. **Given** a deployed site, **When** the person runs the check, **Then** the result is either "working" or one named next action, not a list of possibilities.
2. **Given** a working install, **When** the first event arrives, **Then** the website page shows it as installed without the person returning to the install page.
3. **Given** the person's site cannot host the token endpoint, **When** they read the guidance, **Then** it says so and points to the path that avoids it.

---

### User Story 5 - Manage a website from one page (Priority: P3)

Viewing, editing, enabling and disabling, installing, and deleting a website are reachable from a single website page instead of separate journeys, and changes say what they affect on the live site.

**Why this priority**: It improves ongoing management, but installation and creation come first.

**Independent Test**: From the websites list, complete edit, disable, re-enable, and delete on one website without leaving its page more than once.

**Acceptance Scenarios**:

1. **Given** a website, **When** the person changes its origins, **Then** the page says whether anything must change on the installed site (normally nothing).
2. **Given** a website, **When** the person deletes it, **Then** the confirmation says the tag on the live site will stop recording and that the deletion is permanent.
3. **Given** several domains to add, **When** the person finishes one, **Then** they can add the next in the same project without starting over.

---

### User Story 6 - Choose environment and project once, at the top (Priority: P1)

A person picks the environment and then the project in one place at the top of the console, and every page except Projects works inside that choice. The environment control reads cleanly at every width.

**Why this priority**: Every other screen depends on knowing what it is showing; today the two choices are far apart, the environment control is visually broken, and the project choice is missing on some pages.

**Independent Test**: Switch environment, then project, and visit each page; each shows data for exactly that pair and the current pair is visible on every page but Projects.

**Acceptance Scenarios**:

1. **Given** several environments, **When** the person opens the switcher, **Then** each shows its name with the role as a separate badge, unusable ones are disabled with the reason shown beneath, and no arrow or badge overlaps text at widths from 320 px up.
2. **Given** one environment, **When** the header renders, **Then** it looks like the same control; it has a menu only when there is something in it (an administrator's Access keys entry), and is plain text otherwise.
3. **Given** an environment is chosen, **When** the person opens the project switcher next to it, **Then** it lists only that environment's projects, marks the current one, and changing it updates the current page in place.
4. **Given** any page other than Projects, **When** it loads, **Then** the environment and project are visible and no page shows its own project picker.
5. **Given** the environment changes, **When** the new one loads, **Then** the previously selected project is kept only if it exists there; otherwise the first project is selected and the person is told.

---

### User Story 7 - Projects have one home (Priority: P2)

Creating, renaming, opening and deleting projects happens on the Projects page only; the project switcher just switches and points there.

**Why this priority**: It removes a design conflict (two places to create projects) and clarifies the switcher's job.

**Independent Test**: Create a project from the Projects page, see it in the switcher, switch to it, then delete it and see the console fall back to another project. (The service has no rename, so this version does not add one.)

**Acceptance Scenarios**:

1. **Given** the project switcher is open, **When** the person looks for a way to make a project, **Then** the only route is one entry that opens the Projects page.
2. **Given** the Projects page, **When** it loads, **Then** it shows the current project marked and each project's website count, with "Open" making that project current.
3. **Given** the current project is deleted, **When** the deletion completes, **Then** the console selects another project, or shows "Create your first project" if none remains.
4. **Given** no projects exist, **When** any page loads, **Then** the switcher and the page both direct the person to create one, and nothing else offers to.

---

### User Story 8 - One Health page, and access that explains itself (Priority: P3)

Backend information lives inside Health, and access keys are presented as a sharing feature with a plain purpose instead of an unexplained navigation item.

**Why this priority**: Reduces navigation and confusion but does not block install or creation.

**Independent Test**: Open Health and find the backend versions and storage state without opening another page; find where to issue and revoke keys from a website's Share section.

**Acceptance Scenarios**:

1. **Given** the Health page, **When** it loads, **Then** "Backend" (versions, database, storage) is the first section, marked as covering the whole environment, followed by "Websites" for the current project.
2. **Given** the old Backend address, **When** it is opened, **Then** it shows the Health page.
3. **Given** an administrator, **When** they open a website's Share section, **Then** they see what a key is for, can issue one, and can reach the list of keys to revoke.
4. **Given** a person who cannot manage keys, **When** they use the console, **Then** no access-key entry is shown anywhere.

---

### User Story 9 - Access keys an administrator can actually use (Priority: P2, added 2026-09-26)

An administrator issues a key for an analyst or website owner, and knows what to do with it. Role and access are
dropdowns that explain each choice, a website is picked by name, and after issuing the page says how the recipient
adds a console environment (private file, OneCLI, or script) and that nothing needs deploying.

**Independent Test**: On a real backend, issue an analyst key for one project, add an environment with it exactly as
the page says, see a read-only console, revoke the key, and see the environment rejected.

**Acceptance Scenarios**:

1. **Given** the issue form, **When** it loads, **Then** role and access are dropdowns (no radio buttons) showing what the chosen option means, the access defaults to the project chosen at the top, and a website is chosen from a list of that project's websites by name and address.
2. **Given** missing or invalid input, **When** the person issues, **Then** each problem is named beside its field and nothing is sent.
3. **Given** a key was issued, **When** it is shown, **Then** the page says nothing needs deploying, and gives commands with this backend's address and the key's role for a private file, for OneCLI (store the key, then add the environment) and for a script, none of which contains the key.
4. **Given** the keys list, **When** it loads, **Then** each key shows its role, what it reaches (by name), when it was issued, and revoked keys are last and marked; revoking says what happens and reports the result beside the list.

### Edge Cases

- The environment has no projects yet, or the projects list cannot be loaded, while the environment switcher is working.
- The person opens a bookmarked address for a website that belongs to another project than the current one.
- An environment name or role that is very long, or a project name of 120 characters, in the switcher.
- The switcher on a narrow phone width, and when the page is zoomed to 200%.
- A person has embeds installed by an earlier version; they must keep working and can migrate later, with the guidance showing the shorter form.
- A backend address changes (for example after a redeploy): what the defaults resolve to must follow it, or the person is told exactly once what to update.
- An origin list with both an `http` local development address and a production address: defaults must not weaken the rule that non-local `http` is refused.
- A pasted address with a non-standard port, an internationalized domain, or an IP address.
- Two websites with the same domain in different projects.
- A website whose only allowed origin is later removed or changed to another domain.
- A person opens install guidance for a disabled website.
- A person who wants the current explicit six-value tag (for example, for strict content rules that forbid loading from another host).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The console MUST present a recommended embed whose required copy-paste values are limited to those that cannot be inferred (target: no more than two).
- **FR-002**: Every setting that is the same for all websites on a backend, or that follows a widely used convention, MUST have a default that produces a working install when omitted.
- **FR-003**: A person MUST be able to see each default and override it; the embed MUST then include only the overrides.
- **FR-004**: The embed MUST identify the website and project from the website's public key alone; supplying the project separately MUST remain accepted but not required.
- **FR-005**: The default script location MUST work on every allowed hostname of the website, not only the first one listed.
- **FR-006**: Existing embeds, variables and configuration documents from earlier versions MUST continue to work without change.
- **FR-007**: The GitHub → Cloudflare path MUST state up front how many public values and secrets the person adds, and list only the values that have no default.
- **FR-008**: The starter workflow MUST work unedited for a site at the repository root and MUST name the single edit needed otherwise.
- **FR-009**: Where account values can be discovered, the guidance MUST prefill them or give one command that prints them; otherwise it MUST say where to find them in one step each.
- **FR-010**: The person MUST be able to add a website by supplying only an address. The project is always the one in scope and is shown read-only; the form MUST NOT offer a project choice.
- **FR-011**: The console MUST turn a pasted address into an exact origin where this is unambiguous, show the result before saving, and MUST NOT silently change the meaning of what was entered.
- **FR-012**: The console MUST offer allowing both the bare and `www` forms of a domain in one choice.
- **FR-013**: A website's name MUST default to its domain when left empty.
- **FR-014**: The console MUST tell the person, after any edit, whether the installed site needs updating: nothing for a name change, and the token endpoint's own origin list for an origin change. It MUST NOT imply either when it is not so.
- **FR-015**: Before deleting a website, the console MUST state that deletion is permanent and what stops on the live site.
- **FR-016**: The install check MUST report either success or a single named next action, and MUST distinguish at least: SDK file not found, token endpoint not found, token endpoint rejecting, origin not allowed, and no event received.
- **FR-017**: A website MUST be shown as installed once its first event is received, without the person returning to the install page.
- **FR-018**: The install path recommended by default MUST be the same one across browsers and machines for the same website; an explicit choice is remembered on that browser.
- **FR-019**: Security rules MUST be unchanged: secrets never appear in browser settings or in the embed, non-local `http` addresses are still refused, and the token endpoint stays under the site owner's control.
- **FR-020**: The identifiers of a website (project, website, public key) MUST each appear once on the website page, not repeated across several pages.

- **FR-021**: The environment control MUST show the environment name and its role as separate elements, MUST show why an unusable environment cannot be chosen, and MUST NOT let any part overlap another at widths from 320 px up or at 200% zoom.
- **FR-022**: The footer MUST be a single line containing only the product name, the product website and the source repository, the latter two as links opened in a new tab.
- **FR-023**: The console MUST show the environment and the project side by side at the top of every page except the Projects page, environment first, and every such page MUST run inside that pair.
- **FR-024**: No page other than the top switcher MAY offer a project picker; per-page controls are limited to website and time range.
- **FR-025**: The project switcher MUST only switch projects, mark the current one, and offer one entry that opens the Projects page. It MUST NOT create, rename or delete projects.
- **FR-026**: Creating, opening and deleting projects (renaming is not offered because the service has none) MUST be available on the Projects page only, and deleting the current project MUST leave the console on another project or on the create-your-first-project state.
- **FR-027**: Changing environment MUST keep the current project only if it exists in the new environment, and otherwise MUST select another and say so.
- **FR-028**: The Health page MUST contain the backend information (versions, database, storage), clearly labelled as covering the whole environment, followed by the current project's websites. The separate Backend navigation item MUST be removed and its address MUST show Health.
- **FR-029**: The version of the console MUST remain findable (on the Health page) after it leaves the footer.
- **FR-031**: The Access keys page MUST offer role and access as dropdowns that explain each choice, choose a website from its project's list, name each input problem beside its field, and after issuing MUST give the recipient's steps (private file, OneCLI, script) with the backend address and role filled in and the key never written into a command.
- **FR-030**: Access keys MUST be reachable from the website Share section and the environment menu, MUST explain in one sentence who keys are for, and MUST be absent from the primary navigation and from anyone who cannot manage them.

### Key Entities

- **Scope**: The pair of environment and project the console is currently working in; chosen at the top and applied to every page except Projects.

- **Website**: A site being measured, belonging to one project; has a name, one or more allowed origins, a status (active or disabled), and a public key that identifies it.
- **Embed**: What the person places on their site to start collection; composed of a website's public key plus defaults, with optional overrides.
- **Defaults**: The set of conventional values (backend address, token path, consent behaviour, script location) that make an embed work without being stated.
- **Install path**: The way a site is deployed (GitHub → Cloudflare Pages, or pasted snippet); chosen per website and remembered with the website.
- **Install check**: A result stating whether events are arriving and, if not, the one next action.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The recommended embed requires the person to copy at most 2 values, down from 6 today.
- **SC-002**: The recommended GitHub → Cloudflare Pages path requires at most 5 values to be added in total (one bundled site value, two Cloudflare values, two secrets), down from 12 today.
- **SC-003**: A new site owner can add a website and see its first event within 10 minutes, without consulting anything outside the console for the standard case.
- **SC-004**: Adding a website takes at most one required input when a project is already chosen.
- **SC-005**: At least 90% of pasted addresses in a test set of common forms (with path, query, trailing slash, `www`, uppercase, no scheme) are accepted and shown as the correct exact origin.
- **SC-006**: In a failure test covering each install part, the check names the failing part in 100% of cases, in a single next action.
- **SC-007**: All embeds and configurations produced by the previous version continue to collect events with no changes (zero breakage in the compatibility test).
- **SC-008**: After any website edit the person is told correctly whether the installed site needs a change, in every tested case (name only, origins changed).

- **SC-009**: The environment control is free of overlapping or clipped text at 320, 768 and 1280 px widths and at 200% zoom, verified in an automated visual check.
- **SC-010**: The footer is one line at 1280 px and wraps without overlap at 320 px, and contains exactly three items.
- **SC-011**: The person can tell which environment and project any page (except Projects) is showing without scrolling or opening a menu.
- **SC-012**: The primary navigation has at most 9 items (down from 11 for administrators), and finding the backend version needs no extra navigation step from Health.
- **SC-013**: Projects can be created from exactly one place in the console.

## Assumptions

- Projects leave the sidebar navigation and are reached from the project switcher's "All projects…" entry; the first-run state points there, so discoverability is kept.
- "Access keys" is kept as a capability (issue, list, revoke) and only its placement and explanation change; removing it entirely is not assumed because revoking a key is a security need.
- The version leaves the footer at the requester's request and moves to the Health page.

- This version simplifies the console, the guidance and the defaults; it does not change what data is collected or who can see it.
- "Good defaults" means values derivable from the backend the console is connected to and from conventions the product already uses (fixed token path, unknown consent until stated); they are not guesses about the person's site.
- Both existing install paths remain available; this version reduces what each asks for and makes one the clear default, but does not remove either.
- The site owner still hosts their own token endpoint. Removing that need is a larger change and is not assumed here, though the guidance may make it easier to provide.
- Existing websites, source keys and installed embeds are preserved, and no data migration is required for people who do nothing.
- The review items I5 (a single embed with the loader as an advanced option) and I6 (loading the SDK without saving a file) are in scope as guidance and defaults only if they can be done without weakening the security rules in FR-019; otherwise they are deferred.

## Not in scope

- Replacing the site-owned token endpoint with a hosted one.
- Changing the projects model or access control.
- New analytics views, reports or event types.
- Auto-detecting a person's framework or host by inspecting their repository.
- Bulk import of websites from a file (adding several by pasting is in scope; file import is not).

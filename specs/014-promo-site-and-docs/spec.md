# Feature Specification: Console Polish, Promo Assets, and the vizoalica.dev Docs Site

**Feature Branch**: `014-promo-site-and-docs`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "1. Remove the green 'Local workspace' indicator from the top right. 2. In the Overview, the time range selector is strange: make its popup use regular radio buttons, with the label after the button on the same line. 3. Create a set of 5-6 demo snapshots and save the images into docs/assets. 4. Create a short video, a few seconds long, with a typewriter effect for key messages introducing Vizoalica, using the official logo. 5. Turn the docs folder into a promo website and documentation hosted on Cloudflare at vizoalica.dev. 6. The domain is already mine, so build a pipeline from the GitHub repo's docs to the hosting in Cloudflare."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Cleaner Console Header and Range Picker (Priority: P1)

As an operator, I see a header without the "Local workspace" indicator, and when I open the time range
picker each option is an ordinary radio button with its label after it on the same line.

**Why this priority**: These are small, visible defects in the product people use every day. The picker is
currently unreadable because each radio button sits on its own line, apart from its label.

**Independent Test**: Open Overview, confirm no "Local workspace" control exists anywhere, open the range
picker, and confirm every option's radio button and label share one line at desktop and phone width.

**Acceptance Scenarios**:

1. **Given** any console screen, **When** it is displayed, **Then** no "Local workspace" indicator or
   its explanation popover is present, and the header shows the logo and the theme control only.
2. **Given** the time range picker is open, **When** it is displayed, **Then** each preset (and Custom)
   is a radio button followed by its label on the same line, the group has a visible name, and the
   selected option is clear without relying on color alone.
3. **Given** the picker, **When** it is operated by keyboard, **Then** arrow keys move between
   options, the labels are clickable, and focus is visible.
4. **Given** phone width and 200% zoom, **When** the picker is open, **Then** it stays within the
   viewport and each option remains on one line.

---

### User Story 2 - A Set of Product Snapshots (Priority: P1)

As a maintainer, I have a small set of polished, realistic snapshots of the console, generated from
demo data by a repeatable command, saved in the repository for use in the README, the website, and the
video.

**Why this priority**: Every other promo item (the video and the website) depends on good product
images, and they must be reproducible rather than hand-captured.

**Independent Test**: Run the snapshot command on a clean checkout and obtain the same six images,
none of which contain real customer or personal data.

**Acceptance Scenarios**:

1. **Given** the repository, **When** the snapshot command runs, **Then** exactly six images are
   written to `docs/assets/promo-src/`: Overview, Geography, Technology, Websites, Install, and the
   dark-theme Overview.
2. **Given** the images, **When** they are inspected, **Then** they show realistic fictional data
   (fictional organization and websites, reserved example domains), no real names, emails, or
   credentials, and none of the removed "Local workspace" indicator.
3. **Given** the command runs twice, **When** the outputs are compared, **Then** their content is the
   same apart from time-dependent axis labels.
4. **Given** the command, **When** it runs, **Then** it makes no request to any real backend and
   needs no credentials.

---

### User Story 3 - A Short Introduction Video (Priority: P2)

As a visitor to the website or README, I can watch a video of a few seconds that introduces Vizoalica
with key messages typed out on screen and the official logo.

**Why this priority**: A short motion piece explains the product faster than text and is the hero of
the website, but it is only useful once the snapshots exist.

**Independent Test**: Play the video: it is under 20 seconds, shows the official logo, types at least
three key messages, ends on the logo and the site address, and its text is also available on the page as
text.

**Acceptance Scenarios**:

1. **Given** the video, **When** it is played, **Then** it lasts between 6 and 20 seconds, uses the
   official logo files unmodified, and ends on the logo with "vizoalica.dev".
2. **Given** the video, **When** it plays, **Then** its key messages appear with a typewriter effect
   and are consistent with the README's positioning (privacy-first, self-hosted, on your own
   Cloudflare account, open source, one command).
3. **Given** the video is embedded, **When** a visitor prefers reduced motion or cannot play video,
   **Then** it does not autoplay, a poster image is shown, and the same messages are available as
   text on the page.
4. **Given** the command that renders it, **When** it runs, **Then** it produces an MP4 and a WebM and
   a poster image deterministically from the repository, without network access.

---

### User Story 4 - A Promo Website and Documentation (Priority: P1)

As a prospective user or an operator, I open vizoalica.dev and find a clear introduction to
Vizoalica, a tour of the console, a quick start, and the full documentation, with navigation and search.

**Why this priority**: The documentation is currently a folder of Markdown files on GitHub. A site is
the public face of an open-source project and makes the docs findable and readable.

**Independent Test**: Build the site from the repository, open it locally, and reach every existing
document, the tour, and the quick start through navigation; search finds a term from a guide; the
built site passes automated accessibility checks and makes no third-party requests.

**Acceptance Scenarios**:

1. **Given** the home page, **When** it is displayed, **Then** it presents what Vizoalica is, the
   video, the three-part setup, the command to install, and links to the tour and the docs.
2. **Given** the site navigation, **When** it is used, **Then** every Markdown file that exists under
   `docs/` (guides, privacy, releases, brand, architecture) is reachable, grouped sensibly, and its
   existing links between documents work.
3. **Given** a document that links to a file outside `docs/` (for example the changelog, a spec, or
   example code), **When** the site is built, **Then** the link points to that file on GitHub rather
   than being broken.
4. **Given** the tour page, **When** it is displayed, **Then** it shows the six snapshots with
   captions and text alternatives.
5. **Given** the built site, **When** it is scanned, **Then** it has no serious or critical
   accessibility violations in light and dark, works at phone width, and loads no script, style,
   font, image, or media from another origin.
6. **Given** search, **When** a visitor searches for a term, **Then** matching pages are offered
   without sending the query to any service.
7. **Given** the site, **When** crawlers and agents request it, **Then** it offers a sitemap,
   `robots.txt`, page titles and descriptions, and an `llms.txt` whose links point to site pages.
8. **Given** the Markdown files, **When** they are read on GitHub, **Then** they still read correctly
   (the site adds to them; it does not change their relative-link conventions).

---

### User Story 5 - A Pipeline From the Repository to vizoalica.dev (Priority: P1)

As the maintainer, a change to `docs/` merged to the main branch is built, checked, and published to
Cloudflare at vizoalica.dev without manual steps, using credentials that are scoped only to that job.

**Why this priority**: Without the pipeline the site would go stale, and a careless pipeline would put
a deployment credential at risk.

**Independent Test**: Read the workflow and the setup guide, follow the one-time setup, merge a docs
change, and observe the site update. Separately, open a pull request and confirm it builds and checks
the site without deploying or exposing secrets.

**Acceptance Scenarios**:

1. **Given** a pull request that changes `docs/`, **When** the workflow runs, **Then** it builds the
   site and runs the checks, does not deploy, and receives no deployment credential.
2. **Given** a push to the main branch that changes `docs/` (or the site's own files), **When** the
   workflow runs, **Then** it builds, checks, and, if and only if the site's Cloudflare project is
   configured, deploys the built output to that project's production branch.
3. **Given** the deployment is not configured, **When** the workflow runs on the main branch, **Then**
   it builds and checks and reports that deployment was skipped, rather than failing.
4. **Given** the workflow, **When** it is reviewed, **Then** it grants only read access to repository
   contents, pins third-party actions by commit, uses the credential only in the deploy step, scopes it
   to a Cloudflare Pages token, and does not run on forks with secrets.
5. **Given** the maintainer follows the setup guide, **When** they finish, **Then** the Cloudflare
   Pages project exists, the domain vizoalica.dev (and www) is attached, the one secret and two
   variables are set, and a manual run publishes the site.
6. **Given** the deployed site, **When** it is requested, **Then** it is served with security headers
   (content security policy limited to its own origin, no-sniff, referrer policy, frame denial) and
   long-lived caching for fingerprinted assets only.
7. **Given** the repository, **When** the pipeline files are added, **Then** nothing is deployed and
   no Cloudflare resource is created by this change; that is a later, deliberate maintainer action.

---

### Edge Cases

- A documentation file is renamed or added: the site build fails on a broken internal link, and a test
  fails if a file under `docs/` is missing from the navigation.
- The video or poster is missing: the home page still renders with a text hero.
- The Cloudflare project does not exist yet or the token lacks permission: the deploy step fails
  with a clear message, and the site build and checks are unaffected.
- A visitor has JavaScript disabled: the content, navigation links, and the tour remain readable.
- A very long document (the architecture discussion): it renders with an outline and does not break
  the layout.
- Search on a phone: the search control is reachable and dismissible by keyboard.
- The demo data changes: the snapshot command still produces images with the same layout and no
  personal data.

## Requirements *(mandatory)*

### Functional Requirements

**Console**

- **FR-001**: The console MUST NOT display a "Local workspace" indicator or its explanation
  popover. Its explanation of the local boundary MUST move to the operator documentation.
- **FR-002**: The time range picker's options MUST be radio buttons with their labels after them on
  the same line, in a group with a visible name, operable by keyboard, at every width.
- **FR-003**: The picker's layout MUST be independent of the scope bar's field-label styling, and a
  test MUST fail if the two styles are coupled again.

**Snapshots and video**

- **FR-004**: A repeatable command MUST generate six console images into `docs/assets/promo-src/`
  from fictional demo data, needing no backend and no credentials.
- **FR-005**: The demo data MUST use a fictional organization, fictional websites on reserved
  example domains, and MUST NOT contain real names, emails, IP addresses, or credentials.
- **FR-006**: A repeatable command MUST render a video of 6 to 20 seconds, with typewriter-effect key
  messages and the official logo, into an MP4, a WebM, and a poster image.
- **FR-007**: The video MUST use the official logo assets without modification, MUST NOT depend on
  the network or on a font that is not on the rendering machine, and its messages MUST be present as
  text wherever it is embedded.
- **FR-008**: Where embedded, the video MUST NOT autoplay for visitors who prefer reduced motion,
  MUST be muted and controllable, and MUST have a poster.

**Docs site**

- **FR-009**: The `docs/` folder MUST build into a static site with a home page, a quick start, a
  tour page, and every existing document in grouped navigation, keeping the existing file locations.
- **FR-010**: A link from a document to a file outside `docs/` MUST resolve to that file on GitHub in
  the built site, while the source Markdown keeps its current relative form.
- **FR-011**: The site MUST provide client-side search, a sitemap, `robots.txt`, page titles and
  descriptions, social preview metadata, a favicon from the official brand assets, and an
  `llms.txt` whose links are site URLs.
- **FR-012**: The site MUST load nothing from another origin, MUST include no analytics or
  tracking, and MUST work with JavaScript disabled for reading.
- **FR-013**: The site MUST conform to WCAG 2.2 Level AA in light and dark, be keyboard operable,
  respect reduced motion, and reflow to phone width, with automated checks that run in the pipeline.
- **FR-014**: A test MUST fail when a Markdown file under `docs/` is not reachable from the
  navigation, when a brand asset copy differs from its source, or when the site build has broken
  links.
- **FR-015**: The README and the documentation index MUST link to the site, and the README's
  screenshot MUST use the new snapshots.

**Pipeline**

- **FR-016**: A GitHub Actions workflow MUST build and check the site on pull requests, and on pushes
  to the main branch MUST additionally deploy it, only when the deployment is configured.
- **FR-017**: The workflow MUST use read-only repository permissions, pin third-party actions by
  commit, expose the Cloudflare credential only to the deploy step, never run the deploy step for a
  forked pull request, and serialize deployments.
- **FR-018**: Deployment MUST use a Cloudflare API token limited to Cloudflare Pages edit access on
  the one account, provided as repository secrets, and MUST NOT require any secret in the site.
- **FR-019**: A maintainer guide MUST document the one-time setup (Pages project, domain and DNS,
  secrets and variable, first publish), verification, rollback, and removal, and the site's cost model.
- **FR-020**: The site MUST ship a `_headers` configuration providing a content security policy
  limited to its own origin, `nosniff`, a strict referrer policy, frame denial, and immutable caching
  for fingerprinted assets only.
- **FR-021**: This change MUST NOT create, modify, or deploy to any Cloudflare resource.

### Key Entities *(include if feature involves data)*

- **Demo console**: A fictional, deterministic set of console data used only to generate images.
- **Snapshot**: One of six generated console images with a caption and text alternative.
- **Promo video**: A rendered clip (MP4, WebM, poster) with its message script.
- **Docs site**: The built static output of `docs/`.
- **Docs pipeline**: The workflow that builds, checks, and conditionally deploys the docs site.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 0 occurrences of "Local workspace" in the console's rendered pages and 0 in its styles.
- **SC-002**: In every range option, the radio button's vertical centre is within 4px of its label's
  and the label starts to its right, at 1360px, 768px, and 320px widths.
- **SC-003**: The snapshot command produces exactly 6 images, each at least 1200px wide, with no
  request leaving the machine.
- **SC-004**: The video is between 6 and 20 seconds, at least 1280x720, under 5 MB for the MP4, and
  its last frame shows the logo and "vizoalica.dev".
- **SC-005**: 100% of Markdown files under `docs/` are in the navigation and build without a broken
  link.
- **SC-006**: 0 serious or critical axe findings on every built page (home, quick start, tour, and one
  page from each documentation group) in light and dark, and 0 requests to another origin.
- **SC-007**: The workflow's pull request run has 0 secrets available to its steps, and its main-branch
  run deploys only when configured.
- **SC-008**: A maintainer can go from an empty Cloudflare account to the site live at vizoalica.dev
  by following the guide, using no more than 6 documented steps.

## Assumptions

- The folder in the request, written "promot-src", is taken to be `promo-src`; it is a one-word
  rename if that guess is wrong.
- Hosting is Cloudflare Pages with a custom domain, consistent with the project's Cloudflare-first
  principle. The site is static, so its cost is effectively zero on the free tier.
- The site is generated with VitePress (MIT), a documentation generator that provides navigation,
  search, dark mode, and accessible defaults, to avoid building and maintaining those by hand. Its
  dependencies are development-only and are not shipped.
- The snapshots and video use the existing dev console with a mocked API; no real backend is used.
- No Cloudflare resource is created and nothing is deployed by this change. The maintainer performs
  the one-time setup and holds the credentials.
- `vizoalica.dev` and `www.vizoalica.dev` are the intended addresses; the site is served from the
  root path.
- Existing documentation content is not rewritten, apart from fixing wording that referred to the
  removed indicator.
- Removing the "Local workspace" indicator also removes its accessible explanation from the console.
  The explanation is preserved in the operator guide. Earlier specs (010, 012) that required it are
  superseded on this point by the owner's request.

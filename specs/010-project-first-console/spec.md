# Feature Specification: Project-First Console and Website Setup

**Feature Branch**: `codex/project-first-console`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Make projects a first-class console concept with left-side navigation; require project selection as the first step when adding a website and prevent website creation when no project exists; separate per-deployment website integration values from a generic code snippet; keep the console footer at the bottom of the visible browser with centered links to vizoalica.dev and the GitHub repository plus year and version; and clarify the meaning of Local workspace."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Work Through Projects (Priority: P1)

As an operator, I can see Projects as a primary destination in the left navigation, browse the
available projects, create or select a project, and use the selected project as the context for
   its websites and analytics.

**Why this priority**: Projects are the ownership and isolation boundary for websites and
analytics. Making that boundary visible prevents operators from treating projects as an incidental
filter and reduces the risk of acting in the wrong context.

**Independent Test**: With two projects available, a tester can enter the Projects destination,
select either project, and reach that project's websites and analytics while the current project
remains clear throughout the console.

**Acceptance Scenarios**:

1. **Given** the operator has access to one or more projects, **When** the console opens, **Then**
   Projects appears as a primary item in the left navigation alongside the other main destinations.
2. **Given** multiple projects exist, **When** the operator selects one from the Projects
   destination, **Then** the console clearly identifies it as the current context and project-bound
   views show only that project's information.
3. **Given** a project is created or an existing project becomes unavailable, **When** the project
   list refreshes, **Then** navigation and current-project state reconcile without exposing or
   attributing another project's information.
4. **Given** the operator uses only a keyboard or assistive technology, **When** they navigate and
   select a project, **Then** the destination, selection, and resulting context are perceivable and
   operable without relying on color alone.

---

### User Story 2 - Add a Website to an Explicit Project (Priority: P1)

As an operator, I must choose the owning project before entering any other new-website details, so
every website is created inside an intentional and visible project boundary.

**Why this priority**: A website without a project would have no valid analytics ownership or
isolation boundary. Explicit selection also prevents accidental creation under a stale project.

**Independent Test**: A tester can start website creation with several projects, verify that the
first required choice is the project, finish creation under the chosen project, and confirm that
creation cannot begin when the project list is empty.

**Acceptance Scenarios**:

1. **Given** at least one project exists, **When** the operator starts adding a website, **Then**
   the first required field is a project dropdown and no website-detail field precedes it.
2. **Given** multiple projects exist, **When** the add-website flow opens, **Then** it does not
   silently rely on a project selected elsewhere; the operator must confirm an available project
   within this flow before submission.
3. **Given** the operator chooses a project and supplies valid website details, **When** they submit
   the form, **Then** the website is created only in that project and the confirmation names both
   the website and project.
4. **Given** no projects exist, **When** the operator visits Websites or attempts to add a website,
   **Then** website creation is unavailable and a clear action takes them to project creation.
5. **Given** the selected project is deleted or access is lost before submission, **When** the
   operator submits, **Then** creation stops safely, explains that the project is unavailable, and
   preserves non-sensitive website input where possible.

---

### User Story 3 - Choose Static or Dynamic Installation (Priority: P2)

As a website owner, I can choose either the current static snippet with website-specific values
embedded directly or a generic dynamic snippet whose values are supplied separately by my hosting
environment. For a Cloudflare-hosted site, I receive copyable command instructions for configuring
the dynamic values; the same configuration contract can be implemented by other hosting providers.

**Why this priority**: Preserving the current static path avoids disrupting simple integrations,
while an optional dynamic path makes configuration easier to reuse, audit, change, and automate
across environments without misclassifying public browser configuration as secret data.

**Independent Test**: A tester can connect one website using the unchanged static flow and another
using the dynamic flow and its displayed Cloudflare commands, then verify that both send only
consented events to their intended project and source. The tester can also map the dynamic contract
to a non-Cloudflare hosting environment without changing the generic snippet.

**Acceptance Scenarios**:

1. **Given** a registered website, **When** its installation guidance is viewed, **Then** it offers
   exactly two clearly distinguished choices: Static snippet and Dynamic configuration.
2. **Given** the operator chooses Static snippet, **When** the guidance is displayed, **Then** it
   provides the same complete, website-specific snippet flow available before this feature,
   including the six public values embedded in the markup.
3. **Given** two websites with different integration values, **When** the operator chooses Dynamic
   configuration, **Then** the displayed generic snippet is identical and each website's six
   public values are shown separately.
4. **Given** a Cloudflare-hosted site and Dynamic configuration, **When** the guidance is displayed,
   **Then** it provides a copyable public-variable configuration block plus ordered commands,
   identifies the target site and environment, includes a review step before deployment, and
   includes a verification step after deployment.
5. **Given** a site hosted elsewhere, **When** the owner uses Dynamic configuration, **Then** the
   same names, meanings, validation rules, and runtime behavior can be supplied through that
   provider's public configuration mechanism without changing the generic snippet.
6. **Given** a valid external configuration, **When** the generic integration loads after analytics
   consent is granted, **Then** it obtains and uses the correct script location, collection
   endpoint, public source key, project identifier, token location, and consent state.
7. **Given** dynamic configuration is absent, malformed, unavailable, or belongs to another website,
   **When** the integration loads, **Then** analytics fails closed without delaying or breaking the
   host website and without sending an event to a fallback destination.
8. **Given** an operator changes a website's non-secret dynamic configuration, **When** the
   updated configuration becomes active, **Then** the generic snippet remains unchanged and the
   effective values are reviewable before collection resumes.
9. **Given** an operator views or copies either installation option, **When** the values are
   displayed, **Then** each value is identified as public browser configuration and no signing,
   administrator, or deployment credential is included.
10. **Given** a private value is needed by the trusted token issuer or deployment process, **When**
   it is configured, **Then** it is stored and delivered through a server-side secret boundary and
   never emitted into either snippet, external browser configuration, commands, logs, or examples.

---

### User Story 4 - Use a Stable, Informative Console Shell (Priority: P3)

As an operator, I can always identify the console's local security context and find standard
product links, year, and version in a centered footer at the bottom of the visible browser without
the footer obscuring console content.

**Why this priority**: Persistent product identity, support links, version information, and a clear
security-context explanation improve trust and troubleshooting, while consistent placement makes
them easy to find.

**Independent Test**: On short, long, narrow, zoomed, and keyboard-navigated pages, a tester can
verify the footer's placement and content, open both official links, and obtain an accurate
explanation of the local workspace context.

**Acceptance Scenarios**:

1. **Given** a console page with less content than the viewport, **When** it is displayed, **Then**
   the footer occupies a fixed location at the bottom of the visible browser and its contents are
   centered within the console's content area.
2. **Given** a page with long content, a small screen, or text zoom, **When** the operator reaches
   content near the bottom, **Then** the footer does not cover controls or information and all
   content remains reachable.
3. **Given** the console footer is visible, **When** it is inspected, **Then** it includes the
   current year, running product version, a link to `https://vizoalica.dev`, and a link to the
   official Vizoalica GitHub repository.
4. **Given** an operator encounters the local-workspace status, **When** they request its meaning,
   **Then** the console explains that the interface and trusted credential-holding service run only
   on the operator's computer while the selected analytics backend and its data may be remote.
5. **Given** an operator uses a keyboard or assistive technology, **When** they inspect or activate
   the status explanation and footer links, **Then** each has a meaningful accessible name,
   visible focus, and predictable reading order.

### Edge Cases

- The project list is empty, still loading, unavailable, or changes while the add-website flow is
  open.
- A remembered current project no longer exists or the operator no longer has access to it.
- Two projects or websites have the same display name but different identities.
- A project contains no websites or analytics yet.
- A stale website form references one project while the surrounding view changes to another.
- External integration configuration is cached after a project, source, endpoint, or consent rule
  changes.
- An operator selects the static option after previously deploying dynamic configuration, or
  selects the dynamic option while a static snippet remains on the site.
- Generated Cloudflare commands target the wrong Pages project, Worker, branch, or environment, or
  are rerun after the site's configuration has changed.
- A website's configuration can be read publicly, as browser-required configuration normally can,
  but an operator has mistakenly entered a private credential into it.
- Analytics configuration or its token location is unreachable, slow, malformed, cross-wired to
  another website, or blocked by the host site's security policy.
- The runtime version is unavailable and must not be represented as a valid release number.
- Footer text wraps on a narrow screen or at 200% zoom, or the page contains a focused control near
  the bottom edge.
- The console is local but connected to a production, staging, or local analytics backend.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The left-side primary navigation MUST include a Projects destination with the same
  visual and interaction prominence as other main destinations.
- **FR-002**: The Projects destination MUST let authorized operators view, create, and select
  projects, and MUST expose direct paths to the selected project's websites and analytics.
- **FR-003**: The console MUST present the current project wherever an operator views or changes
  project-bound information and MUST prevent information from different projects from being mixed.
- **FR-004**: Starting a new-website flow MUST present project selection as the first required
  question, using a dropdown of currently available projects.
- **FR-005**: Website creation MUST require explicit project confirmation within the creation flow
  and MUST NOT infer final consent solely from a selection made elsewhere in the console.
- **FR-006**: The system MUST reject website creation when the submitted project is missing,
  unavailable, unauthorized, or changed since the flow began, without creating a partial website
  record.
- **FR-007**: When no project exists, the console MUST disable or withhold the new-website form,
  explain that a project is required, and provide a direct route to project creation.
- **FR-008**: Successful website creation MUST confirm both the created website and its owning
  project, and the new website MUST appear only within that project.
- **FR-009**: Installation guidance MUST offer exactly two choices for each registered website:
  Static snippet and Dynamic configuration.
- **FR-010**: The Static snippet option MUST preserve the existing installation flow and provide a
  complete website-specific snippet with all required public values embedded directly.
- **FR-011**: The Dynamic configuration option MUST separate a stable generic snippet from a
  distinct per-website integration configuration record.
- **FR-012**: The generic dynamic snippet MUST remain byte-for-byte reusable across registered
  websites and supported deployment environments; changing website-specific values MUST NOT
  require editing that snippet.
- **FR-013**: Both options MUST represent the values currently supplied as
  `src`, `data-endpoint`, `data-source`, `data-project`, `data-token-url`, and `data-consent`, with
  clear descriptions, validation state, and the website/project to which they apply.
- **FR-014**: The design MUST treat all values required by browser code as public configuration,
  even when a hosting provider offers a facility named “secrets”; documentation MUST NOT claim
  that browser-visible values can be kept confidential.
- **FR-015**: Administrator credentials, token-signing material, deployment credentials, and other
  private values MUST remain in trusted server-side storage and MUST NOT appear in browser
  configuration, snippets, pages, logs, or examples.
- **FR-016**: Missing, invalid, stale, or mismatched dynamic configuration MUST cause analytics
  collection to fail closed without sending to a fallback project or impairing the host website.
- **FR-017**: The installation experience MUST show operators the effective public configuration,
  its scope, and its validation result separately from any private server-side setup status.
- **FR-018**: For Cloudflare-hosted sites, Dynamic configuration MUST include a copyable public-
  variable configuration block plus ordered commands for an explicitly named target and
  environment, preview the resulting change before deployment, deploy only after operator
  approval, and verify the effective configuration afterward.
- **FR-019**: Generated Cloudflare instructions MUST distinguish non-secret public variables from
  the existing private token-signing secret and MUST never place a secret value in command
  arguments, committed files, browser configuration, or displayed output.
- **FR-020**: The Dynamic configuration contract MUST be hosting-provider-neutral and document how
  other hosting environments can supply the same names, values, validation, and runtime behavior.
- **FR-021**: Switching between Static snippet and Dynamic configuration MUST include guidance to
  remove or disable the superseded path so the collector initializes exactly once.
- **FR-022**: The footer MUST stay in a consistent location at the bottom of the visible browser,
  use a centered standard content container, and reserve enough page space that it never obscures
  content or controls.
- **FR-023**: The footer MUST display the current calendar year, the running Vizoalica version, a
  link to `https://vizoalica.dev`, and a link to `https://github.com/ehud-am/vizoalica`.
- **FR-024**: If the running version cannot be determined, the footer MUST show a clear unavailable
  state rather than a misleading version.
- **FR-025**: The local-workspace indicator MUST have an accessible explanation stating that the
  console and trusted credential-holding service are restricted to the operator's computer, while
  the analytics backend and stored data may be remote.
- **FR-026**: All new navigation, forms, status explanations, configuration displays, and footer
  interactions MUST conform to WCAG 2.2 Level AA, including keyboard operation, semantic naming,
  visible focus, contrast, responsive reflow, and non-color status cues.
- **FR-027**: Project-bound operations MUST preserve authorization, isolation, auditability, and
  safe retry behavior when project state changes or a request fails.
- **FR-028**: User-facing guidance and examples MUST consistently distinguish the two installation
  options, public integration configuration, and private credentials, and MUST use the same
  project-first website creation order as the console.

### Key Entities

- **Project**: The first-class ownership and isolation boundary for websites and analytics; has a
  stable identity, display name, availability state, and operator authorization relationship.
- **Current Project Context**: The operator's explicit working selection, used to scope project-
  bound destinations without replacing confirmation required by a mutating flow.
- **Website**: A registered collection source that belongs to exactly one project and has a stable
  identity, name, allowed origins, operational state, and integration configuration.
- **Installation Option**: One of two mutually exclusive website integration paths: a complete
  static snippet or a generic dynamic snippet backed by external public configuration.
- **Integration Configuration**: The public, website-specific values required by either browser
  integration option, including script location, collection endpoint, public source key, project
  identifier, token location, consent state, scope, and validation status.
- **Hosting Instructions**: Provider-specific, reviewable commands and verification steps that
  realize the provider-neutral dynamic configuration contract for one explicit site environment.
- **Private Deployment Configuration**: Trusted server-side values such as signing and deployment
  credentials that are intentionally excluded from all browser-visible artifacts.
- **Workspace Context**: The local-only console and trusted local service, plus a separately
  identified analytics backend that may be local or remote.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In usability testing, at least 90% of first-time operators identify Projects as the
  ownership boundary and reach a selected project's websites or analytics within 60 seconds.
- **SC-002**: In all tested website-creation attempts, 100% begin with an explicit project choice,
  and zero websites are created without a valid owning project.
- **SC-003**: At least 90% of first-time operators with no existing projects understand why website
  creation is unavailable and reach project creation within 30 seconds.
- **SC-004**: Both installation options complete successfully in end-to-end validation, and the
  static option remains compatible with every supported website integration that worked before
  this feature.
- **SC-005**: One unchanged generic dynamic snippet works across at least two projects, one
  Cloudflare-hosted site, and one non-Cloudflare hosting simulation using separate configurations,
  with zero events attributed to the wrong project or source.
- **SC-006**: At least 90% of first-time Cloudflare operators successfully configure and verify the
  dynamic option using only the displayed commands, without entering an undocumented value.
- **SC-007**: Security inspection finds zero administrator, signing, deployment, or other private
  credentials in browser-visible snippets, configuration, pages, logs, and examples.
- **SC-008**: Across missing, malformed, unavailable, stale, and mismatched dynamic configuration tests,
  100% of analytics attempts fail without sending to a fallback destination or blocking the host
  website's primary experience.
- **SC-009**: On supported viewport sizes and at 200% text zoom, the footer remains centered and
  available at the bottom of the visible browser, with zero obscured or unreachable controls.
- **SC-010**: The footer's website link, repository link, current year, and running version are
  correct in 100% of supported release-build checks.
- **SC-011**: In comprehension testing, at least 90% of operators correctly explain that “Local
  workspace” describes where the console and trusted credential service run, not necessarily where
  analytics data is stored.
- **SC-012**: Automated accessibility checks report zero serious violations in affected views, and
  representative keyboard and assistive-technology checks complete every new interaction without
  a blocker.

## Assumptions

- Projects remain the existing authorization, isolation, and analytics ownership boundary; this
  feature elevates their console role rather than introducing a second hierarchy.
- An operator may retain a convenient current-project context, but any website creation still
  requires confirmation inside that creation flow.
- All six named integration values are ultimately observable by browser code and are therefore
  public configuration, not secrets. Cloudflare plaintext environment variables are the expected
  dynamic delivery input for Cloudflare-hosted sites; using a facility labeled “Secrets” would not
  make browser-delivered values confidential.
- The static option remains the default compatibility path. The operator explicitly opts into the
  dynamic option when externalized configuration better fits the site's deployment workflow.
- Cloudflare receives first-class generated command guidance. Other providers receive the stable
  configuration contract and general mapping guidance rather than provider-specific commands in
  this feature.
- Consent remains controlled by the host website. External configuration describes or transports
  the current consent state but does not grant consent on the visitor's behalf.
- The official product site is `https://vizoalica.dev`, and the repository identified by the
  configured project remote, `https://github.com/ehud-am/vizoalica`, is the official GitHub link.
- “Fixed location” means the footer is anchored to the visible browser bottom while reserving
  layout space so it does not overlay interactive or informational content.
- Existing authentication, audit, soft-deletion, responsive design, and version-injection behavior
  remain in scope as dependencies and are not replaced by this feature.
- Project rename and project deletion are outside this feature; an existing project may still
  become unavailable because of access changes or external administrative action.

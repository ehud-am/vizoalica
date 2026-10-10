# Feature Specification: Separate Deployment Journeys

**Feature Branch**: `main`

**Created**: 2026-09-12

**Status**: Draft

**Input**: User description: "Restructure deployment and operations documentation into four separate, self-contained user stories: set up the Cloudflare backend once per customer; set up each operator machine without OneCLI; set up each operator machine with OneCLI; and set up each website for data collection. Update the README to explain how often each journey runs, reset data migration guidance for fresh deployments only, and identify safe opportunities to make setup easier and more automated."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set Up the Customer Backend (Priority: P1)

As a customer administrator, I can follow one self-contained journey to create and verify the
shared analytics backend for a new customer installation. The journey clearly identifies its
inputs, security responsibilities, expected outputs, checkpoints, and completion evidence. It is
run once for the customer before any operator workstation or website is connected.

**Why this priority**: Every operator and website depends on a healthy customer-owned backend, so
this is the first prerequisite and the foundation for all other journeys.

**Independent Test**: A tester starting with an eligible cloud account and no Vizoalica resources
can use only this story to create the backend, initialize the release's fresh schema, configure its
secrets and safety limits, and obtain a verified backend address plus the values needed by later
stories.

**Acceptance Scenarios**:

1. **Given** a customer with no existing Vizoalica deployment, **When** the administrator follows
   the backend journey, **Then** the required compute, configuration storage, event storage,
   secrets, retention controls, and scheduled maintenance are created and verified.
2. **Given** the administrator reaches a mutating or credential-sensitive action, **When** the
   guide or automation presents that action, **Then** the target, effect, required privilege, and
   approval boundary are clear before any change occurs.
3. **Given** the backend setup succeeds, **When** the administrator reaches the handoff section,
   **Then** it lists the backend address and each secret or non-secret identifier needed by an
   operator or website story, while never displaying secret values.
4. **Given** an existing Vizoalica database is selected, **When** setup checks the target, **Then**
   it stops with a clear statement that in-place upgrades and data migrations are unsupported in
   this release and leaves the existing deployment unchanged.
5. **Given** setup fails partway through, **When** the administrator consults the story's recovery
   section, **Then** they can distinguish completed, safe-to-retry, and manually reviewed actions
   without consulting another setup journey.

---

### User Story 2A - Set Up an Operator Workstation (Priority: P2)

As an operator or data analyst who manages the administrator credential directly, I can follow one
self-contained journey to prepare my local machine, connect safely to the existing customer
backend, start the private console, verify access, and stop or remove local access. This story is
run once for each operator or analyst who chooses the non-OneCLI path.

**Why this priority**: Operators need a safe way to manage websites and view analytics after the
backend exists, and the direct local credential path must remain usable without requiring an
optional credential service.

**Independent Test**: A tester with a supported machine, the backend address, and the customer
administrator credential can use only this story to reach a working local console, list an empty
or populated project set, load analytics, and cleanly end the session.

**Acceptance Scenarios**:

1. **Given** a verified fresh backend and the required handoff values, **When** an operator follows
   the non-OneCLI workstation journey, **Then** the local client is configured with restrictive
   access, remains bound to the local machine, and connects to the intended backend.
2. **Given** a valid but newly initialized backend, **When** the operator verifies the console,
   **Then** an empty project list is identified as a successful connection rather than an error.
3. **Given** the local console is running, **When** browser and backend traffic are inspected,
   **Then** the administrator credential is held only by the local trusted client and is not
   exposed to browser code, browser responses, logs, commands, or support output.
4. **Given** the operator finishes work or loses authorization, **When** they follow the lifecycle
   section, **Then** they can stop the local services and remove or rotate their access without
   changing another operator's setup.
5. **Given** a prerequisite or verification fails, **When** the operator uses this story's
   troubleshooting path, **Then** the failure is diagnosed within the workstation scope without
   redirecting them into backend or website setup steps.

---

### User Story 2B - Set Up an Operator Workstation with OneCLI (Priority: P2)

As an operator or data analyst whose organization uses OneCLI, I can follow one self-contained
journey to prepare my local machine, authorize a narrowly scoped credential connection, start the
private console through that connection, verify access, and revoke it. This is an alternative to
Story 2A and is run once for each operator or analyst who selects OneCLI.

**Why this priority**: It provides the same operator outcome as Story 2A while keeping the real
administrator credential out of the Vizoalica client configuration and respecting a customer's
credential-management policy.

**Independent Test**: A tester with a supported machine, a working OneCLI environment, the backend
address, and authority to attach the customer administrator credential can use only this story to
reach a working local console and later revoke the machine's access without using Story 2A.

**Acceptance Scenarios**:

1. **Given** a verified fresh backend and an authenticated OneCLI environment, **When** the
   operator follows the OneCLI workstation journey, **Then** the administrator credential is
   attached only to the intended backend host and dedicated operator identity.
2. **Given** the OneCLI path is configured, **When** local configuration and normal output are
   inspected, **Then** they contain only non-secret coordinates or a documented placeholder, not
   the real administrator credential or proxy authentication material.
3. **Given** the local gateway is unreachable or the grant is absent, **When** the operator starts
   or uses the console, **Then** remote access fails closed and the story does not recommend an
   automatic fallback that exposes or locally persists the credential.
4. **Given** OneCLI can reach the backend, **When** the operator completes verification, **Then**
   the console can list projects and websites and load analytics while remaining local-only.
5. **Given** the machine is retired, lost, or no longer authorized, **When** access is revoked,
   **Then** that operator loses access without rotating credentials for unaffected operators unless
   the shared credential itself is suspected of exposure.

---

### User Story 3 - Connect One Website (Priority: P3)

As a website owner, I can follow one self-contained journey to register one website, install the
browser collector and trusted token issuer, deploy the integration using the site's actual hosting
mode, and prove that a consented event reaches the backend without harming the website. This story
is repeated once for each website.

**Why this priority**: A verified backend and at least one configured operator are needed before a
website can be registered and its collected data can be confirmed.

**Independent Test**: A tester with the documented backend handoff, operator access, and control of
one website can use only this story to create that website's analytics registration, deploy all
required site components, verify token scope and content, observe an accepted event, and confirm
the host site remains usable when analytics is unavailable.

**Acceptance Scenarios**:

1. **Given** a verified backend and an authorized operator, **When** one website is registered,
   **Then** the story produces a distinct website identity, public integration values, exact
   allowed origins, safe initial quotas, and a website-specific completion record.
2. **Given** a static or server-rendered website, **When** the owner follows the matching section,
   **Then** the collector and a trusted server-side token issuer are deployed without placing an
   administrator credential or signing secret in public assets.
3. **Given** a website with existing build, routing, security, or consent controls, **When** the
   integration is added, **Then** existing settings are merged rather than overwritten and
   collection begins only after the site's analytics-consent condition is satisfied.
4. **Given** the site content checks pass, **When** a real consented visit occurs, **Then** the
   token is scoped to the correct customer project, website, and origin, the event is accepted,
   and the new activity becomes visible to the operator.
5. **Given** the analytics backend is blocked, slow, misconfigured, or unavailable, **When** a
   visitor uses the site, **Then** the website's primary experience remains usable.
6. **Given** another website must be connected, **When** Story 3 is repeated, **Then** it creates a
   separate registration and verification record without rerunning backend or workstation setup.

### Edge Cases

- A customer accidentally selects an account, database, bucket, backend, project, website, or
  deployment target belonging to a different environment.
- A fresh-install workflow discovers prior Vizoalica schema state, migration history, or resources
  with ambiguous ownership.
- Backend setup stops after some resources are created but before verification completes.
- Two operators choose different workstation paths for the same customer backend.
- A workstation already contains configuration for another customer or an older release.
- OneCLI is installed but its gateway, trusted certificate, attached credential, or operator grant
  is unavailable.
- A website uses a preview origin, multiple production origins, a restrictive content policy, an
  existing token endpoint, or an existing functions/routing configuration.
- A website upload succeeds for static assets but omits the server-side token issuer.
- Automated verification can inspect content and token claims but cannot prove the signing secret
  matches until the backend accepts a real event.
- A customer asks to upgrade or preserve data from an existing Vizoalica installation during this
  release's fresh-deployment-only phase.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The deployment and operations documentation MUST present exactly four primary setup
  journeys: customer backend, operator workstation without OneCLI, operator workstation with
  OneCLI, and one website integration.
- **FR-002**: Each primary journey MUST state who performs it, when and how often it is performed,
  prerequisites, required inputs, security boundaries, ordered actions, verification checkpoints,
  expected outputs, recovery guidance, and completion evidence.
- **FR-003**: Each journey MUST include all instructions required to complete its own outcome;
  links to other documents MAY provide background or optional detail but MUST NOT be required to
  discover a missing setup step.
- **FR-004**: The root README MUST provide a start-here sequence and a run-frequency summary that
  distinguishes one backend per customer, one of the two workstation stories per operator or data
  analyst, and one website story per website.
- **FR-005**: The two workstation journeys MUST be presented as mutually exclusive alternatives
  that reach the same operator outcome, with selection guidance based on who manages the
  administrator credential.
- **FR-006**: Backend deployment authentication, workstation credential handling, and website
  deployment authentication MUST remain distinct security lanes; documentation and automation
  MUST NOT imply that one credential can safely replace another.
- **FR-007**: This release MUST support only fresh deployments and MUST explicitly exclude
  in-place upgrades, preservation of existing Vizoalica data, backfills, down-migrations, and
  compatibility behavior for prior installations.
- **FR-008**: The data initialization area MUST be reset to one coherent fresh-install baseline
  for the current release, without requiring operators to understand or apply historical feature
  migrations individually.
- **FR-009**: Fresh-deployment checks MUST detect existing or ambiguous Vizoalica schema state and
  stop before destructive initialization, explaining that the operator must select new empty
  resources or wait for a future migration-capable release.
- **FR-010**: Documentation outside the four journeys, including troubleshooting, release,
  operational cost, and public-release guidance, MUST not contradict the fresh-deployment-only
  boundary or instruct readers to apply the historical migration sequence.
- **FR-011**: The website journey MUST distinguish public identifiers from secrets, require a
  trusted token-issuing component, account for the website's real deployment mode, preserve
  existing site configuration, and include a real accepted-event check.
- **FR-012**: Every journey MUST use explicit checkpoints and stop-on-failure guidance so readers
  do not continue with missing prerequisites or partially verified state.
- **FR-013**: Repeated execution MUST be safe at the documented scope: Story 1 MUST not silently
  create a second customer backend, Stories 2A and 2B MUST not overwrite another local
  configuration without confirmation, and Story 3 MUST not overwrite or reuse another website's
  registration without confirmation.
- **FR-014**: Safe automation SHOULD collect non-secret inputs once, validate prerequisites and
  target identity, show a reviewable plan, require confirmation before mutations, execute
  repeatable actions, and generate a redacted handoff or completion summary.
- **FR-015**: Automation MUST NOT accept secrets in command arguments, print secret or proxy
  material, silently broaden permissions, silently fall back between credential paths, or perform
  destructive cleanup of an existing deployment.
- **FR-016**: Verification SHOULD be automated where an objective check is possible, while clearly
  identifying human checks that remain necessary, including consent behavior, real browser event
  acceptance, host-site resilience, and final approval of deployment targets.
- **FR-017**: Future migration support MUST be documented as intentionally deferred, with the fresh
  baseline structured and named so a later release can introduce forward migrations without
  claiming that this release can upgrade existing installations.
- **FR-018**: Cross-links, terminology, story labels, prerequisites, outputs, and command examples
  MUST remain consistent across the README and all affected deployment and operations documents.

### Key Entities

- **Customer Installation**: One customer-owned analytics environment, including its backend
  address, storage, secrets, retention and quota policy, release identity, and verification state.
- **Fresh Schema Baseline**: The complete data structure required for a new installation in this
  release; it has no supported predecessor state or upgrade promise.
- **Operator Workstation**: One operator's local console environment, associated with exactly one
  selected credential path and one intended customer backend at a time.
- **Operator Access Grant**: The revocable authority that allows a local trusted client to use the
  customer backend's administration and analytics capabilities without exposing that authority to
  the browser.
- **Website Integration**: One registered website and its allowed origins, project and source
  identifiers, public source key, server-side token scope, consent integration, quota policy, and
  deployment mode.
- **Setup Handoff**: A redacted record of verified outputs from one story that become named inputs
  to a later story, without containing secret values.
- **Completion Record**: Evidence that a story's checkpoints passed for a specific customer,
  operator workstation, or website, including the selected release and target identities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In documentation testing, at least 90% of first-time participants correctly identify
  which story to run and how often within 60 seconds of reading the README start section.
- **SC-002**: Every required setup action and verification checkpoint is present within its own
  primary journey; a cross-document audit finds zero required steps available only through an
  external link.
- **SC-003**: A clean-room tester can complete each applicable journey using only that journey and
  its stated inputs, with no undocumented values or ordering decisions.
- **SC-004**: The repository contains zero active operator instructions for upgrading an existing
  Vizoalica schema, applying historical migrations one by one, backfilling old data, or rolling a
  schema backward in this release.
- **SC-005**: All automated and manual fresh-install tests reject a non-empty or ambiguous existing
  Vizoalica schema before initialization changes data.
- **SC-006**: All setup output, examples, logs, handoffs, and completion records disclose zero
  secret values, browser-accessible administrator credentials, or proxy authentication material.
- **SC-007**: A first-time operator can prepare and verify one workstation in 20 minutes or less
  after receiving prerequisites, excluding installation or recovery of an external OneCLI service.
- **SC-008**: A website owner can connect and verify each additional supported website in 30
  minutes or less after receiving the backend and operator handoff values.
- **SC-009**: Every website acceptance test confirms both an accepted consented event and a usable
  host website when analytics delivery is unavailable.
- **SC-010**: A documentation consistency review finds zero contradictions in story names,
  execution frequency, credential ownership, fresh-deployment scope, prerequisites, and handoff
  values across the README and affected operations documents.

## Assumptions

- "Customer" means one independently operated Vizoalica backend environment. Separate production,
  staging, or legal/security boundaries are separate customer installations for setup purposes.
- Story 1 is completed before Story 2A or 2B, and one operator completes either 2A or 2B before
  Story 3; independence means each document is self-contained given its explicitly stated inputs,
  not that downstream services can operate without the backend.
- An organization may mix Story 2A and Story 2B across different operators, but each workstation
  uses exactly one credential path at a time.
- The supported website example remains Cloudflare Pages, while the website journey may explain
  the equivalent trust and verification requirements for another host without claiming untested
  deployment support.
- Existing deployments and their data do not need preservation for this release. Operators with
  any prior installation must use new empty resources; deleting old resources is a separate,
  deliberate owner action and is not part of automated setup.
- Historical migration files and narratives may be consolidated or archived from active setup
  paths as part of establishing the fresh baseline, but future releases are expected to add
  forward migration capability from that baseline.
- Automation supplements readable manual guidance. It may reduce repeated entry and objective
  checking, but human approval remains required at credential, target-selection, and mutation
  boundaries.

## Scope Boundaries

### In Scope

- Restructuring the README and deployment/operations documentation around the four primary user
  stories and their execution frequency.
- Making every primary story complete within its own document or clearly bounded section.
- Consolidating current schema initialization into a fresh-deployment baseline and aligning all
  active operational guidance with that support boundary.
- Improving safe setup automation, preflight checks, verification, redacted handoffs, and
  completion evidence where the current workflows support them.
- Updating related troubleshooting, release, cost, and operational references that would otherwise
  contradict the new journeys or fresh-only policy.

### Out of Scope

- Upgrading, migrating, backfilling, importing, preserving, or rolling back data from an existing
  Vizoalica deployment.
- Automatically deleting or repurposing prior cloud resources or local operator configuration.
- Adding a new hosting provider, hosted analytics console, or new analytics capability.
- Making OneCLI mandatory or routing website asset uploads through an unverified credential path.
- Automating consent decisions, secret disclosure, permission approval, or the final human
  go/no-go decision.

## Dependencies

- The current customer backend, local console, website registration, browser collector, token
  issuer, and deployment verification capabilities remain available for documentation and test
  alignment.
- Operators have authority over the customer cloud account, their own workstation, or the website
  they are configuring, as appropriate to each story.
- The project constitution's privacy, least-privilege, local-console, host-site resilience,
  auditable deployment, cost, and human-approval constraints apply to every revised journey.

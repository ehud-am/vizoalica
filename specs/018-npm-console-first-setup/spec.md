# Feature Specification: Install from npm and a Console-First Setup

**Feature Branch**: `018-npm-console-first-setup`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "let's start to work on the next iteration. this will be another patch release. 1. Let's fix the footer of the console. we want the foot to include a link to vizoalica.dev as well as to the github project.please see the gitlocal.dev footer as example. 2. i want to continue to improve the deployment process. What do you think about install from npm? We probably need to remove the "vizoalica install" command that does everything, it is a bit too much. My thinking the deployment process looks like this: 1. npm install -g vizoalica. 2. run "vizoalica console" if this is first run it will ask you few questions and adjust the flow based on that. We want to get to a running console first, then get to running backend in cloudflare, then get the websites configured, then see results. I should be able to do all from the console. The flow should be very clear about what i can do when, e.g. can't create projects/websites, if i still do not have a backend. Make sure that we still diffrentiate between an operator that can manage the backend, vs. owner of a wesite that needs to configure the website, vs. an analyst that can just see the data"

## Who this is for

Three kinds of people use Vizoalica, and this feature keeps them apart.

- **Operator**: looks after the backend in a Cloudflare account. Deploys and updates it, creates
  projects, registers websites, and holds the administrator credential.
- **Website owner**: owns one website and has to make it send data. Does not touch the backend.
- **Analyst**: only reads the results. Cannot change anything.

One person can be all three (a solo maintainer), but the console treats them as different roles with
different credentials, so a team can split them.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Footer That Points Home and to the Project (Priority: P1)

As anyone using the console, I see a footer on every screen that tells me what this is and where to
go next: the Vizoalica website, its documentation, and the GitHub project. It is laid out like the
GitLocal footer: the brand and a one-line tagline, then short columns of links, then a bottom line
with the copyright and version. Today the console has only one small line of text at the bottom, which
is easy to miss.

**Why this priority**: It is small, independent, visible to every user, and the owner asked for it
first. It also gives first-time users a way to the documentation from inside the console.

**Independent Test**: Open every console screen (including the first-run screens and the error and
offline screens) and confirm the footer is present, shows the brand, tagline, the three groups of
links, and the version, and that each link goes to the right place.

**Acceptance Scenarios**:

1. **Given** any console screen, **When** I scroll to the bottom, **Then** I see the Vizoalica name
   and logo with a one-line tagline, a group of links about the product, a group of links about the
   project, and a bottom line with the copyright year and version.
2. **Given** the footer, **When** I read its links, **Then** they include the Vizoalica website
   (vizoalica.dev), the documentation, the GitHub project, its Discussions, its Issues, the
   release notes, and the license.
3. **Given** a phone-width window, **When** I view the footer, **Then** the groups stack and nothing
   scrolls sideways.
4. **Given** either color theme, **When** I view the footer, **Then** all text and links meet the
   contrast requirements and remain readable.
5. **Given** I use only the keyboard, **When** I tab through the footer, **Then** every link is
   reachable, has a visible focus, and has a clear accessible name.
6. **Given** the console is open, **When** it is used, **Then** the footer causes no network request
   (its links are only followed when clicked), and external links open safely.

---

### User Story 2 - Install from npm and Start with One Command (Priority: P1)

As an operator, I install Vizoalica with one command and start the console with one more, without
cloning a repository, installing a build tool, or knowing how the project is laid out. I run
`npm install -g vizoalica`, then `vizoalica console`, and a console opens in my browser.

**Why this priority**: Every later story depends on being able to reach a running console easily. The
current path needs a source checkout, a package manager, and several commands before anything is
visible.

**Independent Test**: On a clean macOS or Linux machine with only Node.js 22 or newer, run the two
commands and confirm the console opens and works, with no repository, no extra tools, and no backend
yet.

**Acceptance Scenarios**:

1. **Given** a machine with Node.js 22 or newer, **When** I run `npm install -g vizoalica`, **Then**
   a `vizoalica` command is available and prints its version and a short help.
2. **Given** the command is installed, **When** I run `vizoalica console`, **Then** the console
   starts on this computer only, prints its address, and opens in my browser (or tells me the
   address if it cannot).
3. **Given** I have no backend yet, **When** the console starts, **Then** it still starts and is
   usable (Story 4 explains what it offers).
4. **Given** an older Node.js version or an unsupported operating system, **When** I run the command,
   **Then** I get a plain message that names the requirement and what to do, not a stack trace.
5. **Given** the console's address is already in use, **When** I run `vizoalica console`, **Then** I
   am told the console is probably already running, with its address.
6. **Given** a newer version is published, **When** I update with npm, **Then** the console runs the
   new version and my saved settings and credentials are kept.
7. **Given** the console is running, **When** I stop it with one interrupt, **Then** everything it
   started stops.
8. **Given** the installed package, **When** it is inspected, **Then** it contains no secret, no
   account identifier, and none of the maintainer's local configuration.

---

### User Story 3 - The First Run Asks a Few Questions and Adapts (Priority: P1)

As a person running the console for the first time, the console asks me a few plain questions, and the
rest of what I see follows from my answers. It asks who I am here (operator, website owner, or
analyst) and what I already have (a backend already running, or none yet), and it skips anything that
does not apply. I can change my answers later.

**Why this priority**: The same tool serves three kinds of people who need different first steps.
Asking once, in the console, lets one command serve all of them without a wall of options.

**Independent Test**: Start the console on a machine with no saved settings and answer for each role
and situation; confirm each combination lands on the right next step, and that answering again later
changes it.

**Acceptance Scenarios**:

1. **Given** no saved settings, **When** the console starts, **Then** it shows a short first-run
   screen (no more than three questions on any path) before anything else.
2. **Given** I say I am an operator with no backend, **When** I continue, **Then** I am taken to
   deploying a backend (Story 5).
3. **Given** I say I am an operator with an existing backend, **When** I continue, **Then** I am asked
   only for what is needed to connect to it, and connect (Story 5).
4. **Given** I say I am a website owner, **When** I continue, **Then** I am asked for the setup details
   my operator gave me (Story 6).
5. **Given** I say I am an analyst, **When** I continue, **Then** I am asked for the read-only access my
   operator gave me (Story 7).
6. **Given** I am not sure which role I am, **When** I read the first-run screen, **Then** each choice
   states in one sentence what it lets me do and what it does not.
7. **Given** I have finished the first run, **When** I open the console later, **Then** it does not ask
   again, and I can review and change my role and connection from a settings screen.
8. **Given** the first-run screen, **When** I use only the keyboard or a screen reader, **Then** every
   question can be answered and its consequences are announced.

---

### User Story 4 - The Console Always Shows What Is Possible Now and What Comes Next (Priority: P1)

As any user, I can see at a glance how far setup has got and what the next step is, and I am never
offered something that cannot work yet. The journey has four stages: the console is running; a backend
is connected; a website is configured; data is arriving. Anything that needs a later stage is visibly
unavailable, says why in plain words, and says what to do to enable it. Creating a project or adding a
website, for example, is unavailable until a backend is connected.

**Why this priority**: The owner's central request is a flow that is "very clear about what I can do
when". Dead ends and silent failures are the most common way setup goes wrong.

**Independent Test**: With no backend, open every screen and confirm no control creates or changes
anything, each unavailable control explains itself and links to the step that fixes it, and the
journey shows stage one done and stage two next. Repeat at each later stage.

**Acceptance Scenarios**:

1. **Given** the console is running and no backend is connected, **When** I look at the screen, **Then**
   a setup journey shows the four stages with the current stage marked and the next action named.
2. **Given** no backend is connected, **When** I open the places where projects and websites are
   created, **Then** those actions are shown as unavailable with the reason ("connect or deploy a
   backend first") and a link to that step, and no request is made.
3. **Given** a backend is connected but no project or website exists, **When** I look at the journey,
   **Then** stage two is complete and stage three is the next step, with the next action being to create
   a project and add a website.
4. **Given** a website is registered but has sent no data, **When** I look at the journey, **Then** it
   says data has not arrived yet and links to the website's installation steps and its check.
5. **Given** data has arrived, **When** I look at the journey, **Then** all four stages are complete
   and the journey gets out of the way, leaving the analytics.
6. **Given** each unavailable control, **When** I focus it with the keyboard or a screen reader, **Then**
   its unavailable state and reason are announced (not only shown by color).
7. **Given** the backend becomes unreachable later, **When** I use the console, **Then** it says so,
   marks the affected stages, and says how to recover, instead of showing empty or stale results.
8. **Given** the analytics screens with no backend or no data, **When** I open them, **Then** they
   explain what is missing and what to do, rather than showing empty tables.

---

### User Story 5 - The Operator Deploys and Maintains the Backend from the Console (Priority: P2)

As an operator, I deploy the Vizoalica backend into my Cloudflare account from the console, without a
separate command that "does everything". The console shows what it is about to create, asks me to
approve, does it step by step with visible progress, shows the new secrets once, checks that the
result works, and connects itself to it. The same place lets me connect to a backend that already
exists, check its health and version, update it, rotate its secrets, and remove deleted data.

**Why this priority**: This is the main reason `vizoalica install` exists, and moving it into a
guided, reviewable flow is what lets that command go. It depends on Stories 2 to 4.

**Independent Test**: With a Cloudflare account and no backend, deploy one entirely from the console;
confirm the plan was shown first, nothing was created before approval, the secrets were shown once, the
backend passes its health check, and the console is connected. Repeat as an update, and as a connection
to an existing backend.

**Acceptance Scenarios**:

1. **Given** I am an operator with no backend, **When** I choose to deploy, **Then** the console first
   checks that I am signed in to Cloudflare, and if not, guides me through signing in and comes back.
2. **Given** I am signed in, **When** I continue, **Then** the console shows a plan listing every
   resource it will create in my account (names and kinds), what each is for, and the cost model, and
   nothing is created until I approve.
3. **Given** I approve, **When** the deployment runs, **Then** I see each step start and finish, in
   order, and a failed step stops the flow with what failed, what was already created, and how to
   continue or clean up.
4. **Given** a deployment finished, **When** the console reports the result, **Then** it has checked
   that the backend answers and accepts the administrator credential, and it connects itself, so I
   need do nothing more to start using it.
5. **Given** the deployment generated secrets, **When** they are shown, **Then** each is shown once,
   can be copied, is never written to a log or an unprotected file, and I am told what happens if I
   lose one.
6. **Given** I already have a backend, **When** I choose to connect, **Then** I supply its address and
   credential (or use the setup I already have on this computer), and the console verifies it before
   saving.
7. **Given** a connected backend, **When** I open its screen, **Then** I see its address, whether it is
   healthy, its version, and whether it is compatible with this console, with a clear path when it is
   not (for example "update the backend").
8. **Given** an existing installation that predates a schema change, **When** the console detects it,
   **Then** it says what the release supports (for example a fresh install) instead of attempting an
   in-place change it cannot do safely.
9. **Given** I am an operator, **When** I use the backend screen, **Then** I can rotate a secret,
   purge deleted websites and projects, and (optionally) add or remove sample data, each with a
   confirmation that names what will happen.
10. **Given** any operator action that changes the account, **When** it is done, **Then** an
    auditable record of what was done (no secret values) is available.

---

### User Story 6 - A Website Owner Configures Their Website and Sees It Work (Priority: P2)

As a website owner, I receive setup details from my operator and use the console to configure my
website: which installation method to use, the exact snippet or configuration, and a check that tells
me when my website is sending data. I never see or need the administrator credential, and I cannot
create projects, websites, or secrets.

**Why this priority**: Website owners are a different person from the operator in a team, and today
they would need the operator's full credential to see the installation steps.

**Independent Test**: As an owner with only the setup details an operator gave, follow the console
through installing on a sample website until the check reports data, and confirm no backend-managing
control was ever offered.

**Acceptance Scenarios**:

1. **Given** the operator has registered my website, **When** they share its setup details with me,
   **Then** the details contain what a website needs (public identifiers, the ingestion address, the
   allowed origin, consent guidance) and a read-only key limited to that one website, and never the
   administrator credential.
2. **Given** I choose the owner role and enter the setup details, **When** the console verifies them,
   **Then** I see my website's installation steps and its current status.
3. **Given** the owner role, **When** I use the console, **Then** there is no control to deploy or
   update a backend, create projects or websites, rotate secrets, or delete anything.
4. **Given** I have installed the SDK on my website, **When** I run the check, **Then** the console tells
   me whether data has arrived, and if not, what to look at first.
5. **Given** the website's setup details change (for example the allowed origin), **When** the operator
   shares them again, **Then** I can replace them without losing my other settings.

---

### User Story 7 - An Analyst Sees the Data and Nothing Else (Priority: P2)

As an analyst, I open the console with read-only access my operator gave me and see the analytics for
the projects I am allowed to see. The console shows the Analytics area only. Nothing I can reach can
change, create, disable, or delete anything, and the backend itself refuses any attempt.

**Why this priority**: The owner wants to be sure that a person who only needs the numbers cannot
change anything, and that this is enforced, not merely hidden.

**Independent Test**: As an analyst, use every analytics screen, then attempt every state-changing
operation directly against the backend with the analyst credential and confirm each is refused.

**Acceptance Scenarios**:

1. **Given** the operator creates read-only access from the console, **When** it is shown, **Then** it
   is shown once, can be copied, can be revoked, and can be replaced, and it works only for reading
   analytics.
2. **Given** I choose the analyst role and enter that access, **When** the console verifies it, **Then**
   I see the Analytics area for my projects and no Manage area.
3. **Given** the analyst credential, **When** it is used to try any operation that creates, edits,
   disables, deletes, or manages secrets, **Then** the backend refuses it and records nothing.
4. **Given** the operator revokes my access, **When** I next load data, **Then** the console tells me my
   access was revoked and what to do, instead of showing stale data.
5. **Given** read-only access, **When** it is inspected, **Then** it cannot be used to obtain the
   administrator credential or the signing secret.

---

### User Story 8 - The Old "install" Command Is Retired and Existing Setups Keep Working (Priority: P3)

As an existing user of the checkout-based commands, my setup keeps working, and the documentation
points to the one new path. The single command that does everything (`vizoalica install`) is removed
and replaced by the console flow. Lower-level operator commands remain available for scripts and
for people who prefer them, but the documented path is the console.

**Why this priority**: The owner explicitly wants the all-in-one command gone, but the maintainer's
own running installation and any existing operators must not be broken by the change.

**Independent Test**: With an existing connected setup (either credential mode), install the package and
run the console; confirm it recognizes the existing setup and goes straight to the analytics. Run
`vizoalica install` and confirm it points to the console instead of doing the work.

**Acceptance Scenarios**:

1. **Given** an existing saved setup from the checkout-based commands, **When** I run the console from
   the npm install, **Then** it detects and uses that setup without asking the first-run questions.
2. **Given** a setup that uses OneCLI to hold the administrator credential, **When** I run the console,
   **Then** that mode keeps working and the credential is still never written to a file.
3. **Given** I run `vizoalica install`, **When** it runs, **Then** it does not deploy anything; it says the
   command was retired and that `vizoalica console` now guides setup.
4. **Given** the documentation, README, and agent instructions, **When** they describe installation,
   **Then** they describe the npm path and the console, and none still tells a new user to run the
   retired command or to clone the repository for a normal install.
5. **Given** the source checkout, **When** a contributor uses it, **Then** their development workflow
   still works, and the docs say the checkout is for contributors.

---

### Edge Cases

- **Not signed in to Cloudflare, or the sign-in expires mid-deployment**: the flow stops at a clear step,
  explains, and can resume without repeating finished steps or creating duplicates.
- **A resource with the chosen name already exists**: the console says so before creating anything and
  lets me choose a different name or connect to what exists.
- **A deployment fails part-way**: what was created is listed, the flow can continue from where it
  stopped, and cleanup guidance is given; nothing is silently deleted.
- **The Cloudflare account lacks a required service (for example object storage is not enabled)**: the
  plan step says so and links to what to enable, before creating anything.
- **The backend is older or newer than the installed package**: compatibility is shown; where the
  release supports only a fresh install, the console says that plainly.
- **Two consoles are started**: the second says the first is running and where.
- **The browser cannot be opened automatically** (headless machine, no display): the address is
  printed so it can be opened by hand.
- **The machine is offline**: the console starts and explains what it cannot do without a network; local
  screens still work.
- **The saved settings file is damaged or has the wrong permissions**: the console says so and offers to
  repair or start over, without exposing its contents.
- **A secret is lost**: the console explains that it cannot be recovered and offers rotation, with what
  each rotation affects.
- **An analyst or owner credential is entered in the wrong role**: the console recognizes what it is and
  says which role it belongs to.
- **Someone else uses the same computer**: credentials are stored so that other users of the computer
  cannot read them, and the console listens on this computer only.
- **A role is changed later**: the console re-checks the credential it holds and never shows controls the
  new role cannot use.
- **The package is updated while a console is running**: the running console keeps working and says a
  restart picks up the new version.
- **Windows or another unsupported system**: a plain message that says it is unsupported and why.

## Requirements *(mandatory)*

### Functional Requirements

**Footer**

- **FR-001**: Every console screen, including first-run, connection-problem, and access-denied screens,
  MUST show a footer with the Vizoalica name and logo and a one-line tagline, at least two labeled groups
  of links, and a bottom line with the copyright year and the version.
- **FR-002**: The footer links MUST include the Vizoalica website (vizoalica.dev), the documentation, the
  GitHub project, its Discussions, its Issues, the release notes, and the license.
- **FR-003**: The footer MUST reflow to a single column at phone width without horizontal scrolling, meet
  WCAG 2.2 AA contrast in both themes, have visible keyboard focus and accessible link names, and cause
  no network request of its own. External links MUST open in a way that does not give the destination
  access to the console page.

**Installation and start**

- **FR-004**: The product MUST be installable with `npm install -g vizoalica` on macOS and Linux with
  Node.js 22 or newer, giving a `vizoalica` command, without a source checkout, a separate package
  manager, or a build step.
- **FR-005**: `vizoalica console` MUST start the console and its private local service as one unit on
  this computer only, print the address, open the browser when possible, keep running until interrupted,
  and stop everything it started on one interrupt.
- **FR-006**: The console MUST start and be usable when no backend is connected.
- **FR-007**: Unsupported Node.js versions, unsupported operating systems, and a busy address MUST produce a
  plain message naming the problem and the fix, never a stack trace.
- **FR-008**: The installed package MUST contain everything needed to run the console and to deploy the
  backend (including the backend's code and database schema at the same version), and MUST NOT contain
  secrets, account identifiers, or local configuration.
- **FR-009**: Updating the package MUST keep saved settings and credentials. The console MUST show its
  own version and the connected backend's version and whether they are compatible.
- **FR-010**: Nothing in installing or running the console may send information about the user or their
  data anywhere except to the user's own backend and to Cloudflare when the operator deploys.

**First run and roles**

- **FR-011**: On first run (no saved settings) the console MUST show a first-run flow that asks at most
  three questions on any path: the role (operator, website owner, or analyst) and what the person
  already has (a backend or none for operators), and only what that path needs to connect.
- **FR-012**: Each role choice MUST state in plain words what it allows and what it does not.
- **FR-013**: The person MUST be able to review and change their role and connection later from a
  settings screen, and the console MUST NOT re-ask the first-run questions once they are answered.
- **FR-014**: The console MUST detect an existing setup from the checkout-based commands (both credential
  modes) and use it without the first-run questions.
- **FR-015**: The console MUST show only the controls and screens the current role and credential can use.
  A role's limits MUST also be enforced by the backend, not only by the console.

**Roles and credentials**

- **FR-016**: The **operator** role MUST have the administrator credential and Cloudflare access, and MUST
  be the only role that can deploy, update, connect, or configure the backend, rotate secrets, purge
  deleted data, create projects and websites, edit, disable, or delete them, and issue access for the
  other roles.
- **FR-017**: The **analyst** role MUST use a read-only key that the backend accepts only for reading
  analytics and website information and that it refuses for every other operation. A key MAY be limited to
  one project or one website. It MUST be issuable, shown once, revocable, and replaceable by the operator
  from the console, and MUST NOT allow obtaining any other credential.
- **FR-018**: The **website owner** role MUST work without the administrator credential, from setup details
  the operator shares (public identifiers, ingestion address, allowed origin, consent guidance, and a
  read-only key limited to that one website). The console MUST let an owner view installation steps and
  status for their website, obtain the SDK file, and run the check that data has arrived, and MUST offer
  no control that creates, edits, or deletes backend resources. The backend MUST refuse the owner's key
  for any other website and for any change.
- **FR-019**: The operator MUST be able to produce the website owner's setup details and the analyst's
  access from the console. Neither MUST ever contain the administrator credential. The website's token
  signing secret is not part of the setup details either: the operator places it on the website's own
  token service through the existing documented step (see the known limit in Assumptions).
- **FR-020**: A revoked or invalid credential MUST be reported as such, with what to do, and MUST NOT leave
  stale data on screen.

**Journey and availability**

- **FR-021**: The console MUST show a setup journey of four stages (console running, backend connected,
  website configured, data arriving), with the current stage, what is done, and the single next action.
  It MUST get out of the way once all four are complete.
- **FR-022**: Every action that cannot work at the current stage or for the current role MUST be shown as
  unavailable, MUST state why in plain words, MUST say or link to what enables it, MUST announce this to
  assistive technology without relying on color alone, and MUST NOT send a request.
- **FR-023**: Creating a project or a website MUST be unavailable until a backend is connected, and adding
  a website MUST be unavailable until a project exists.
- **FR-024**: Analytics screens MUST explain what is missing (no backend, no website, no data yet) and how
  to fix it rather than show empty tables.
- **FR-025**: If a connected backend becomes unreachable, the console MUST say so, mark the affected stages,
  and offer recovery guidance instead of showing empty or stale results.

**Deploying and maintaining the backend from the console**

- **FR-026**: The console MUST let the operator deploy the backend into their Cloudflare account, connect to
  an existing backend, update a backend, rotate secrets, purge deleted data, and add or remove sample data.
- **FR-027**: Before creating anything the console MUST verify the operator is signed in to Cloudflare
  (guiding sign-in if not), show a plan of every resource it will create with names, purposes, and the
  cost model, and create nothing until the operator approves.
- **FR-028**: The deployment MUST run as visible, ordered steps; a failed step MUST stop the flow with what
  failed, what already exists, and how to continue or clean up. A run MUST be resumable without creating
  duplicates and MUST NOT delete anything silently.
- **FR-029**: On success the console MUST verify the backend answers and accepts the administrator
  credential, and MUST connect itself to it.
- **FR-030**: Generated secrets MUST be shown once, be copyable, be stored only in the protected place
  the current credential mode uses, and never appear in logs, screens after the first view, or files
  other people on the computer can read.
- **FR-031**: The console MUST show the connected backend's address, health, version, and compatibility, and
  where a release supports only a fresh install it MUST say so instead of attempting an in-place change.
- **FR-032**: Every operator action that changes the account MUST leave an auditable record without secret
  values. The flow MUST request only the Cloudflare access it needs and MUST NOT bypass the operator's
  approval.

**Retiring the all-in-one command and migration**

- **FR-033**: `vizoalica install` MUST no longer deploy or configure anything; it MUST say it was retired
  and point to `vizoalica console`.
- **FR-034**: Existing setups, including the mode that keeps the administrator credential out of a file,
  MUST keep working after installing the package.
- **FR-035**: The README, documentation site, quick starts, agent instructions, and issue and pull request
  templates MUST describe the npm path and the console, MUST state that the source checkout is for
  contributors, and MUST NOT tell a new user to run the retired command. The statement that Vizoalica is
  distributed as source only MUST be updated.
- **FR-036**: The console MUST meet WCAG 2.2 AA across the first-run flow, the journey, the deployment
  flow, and every role's screens, with keyboard operation and status announcements.

### Key Entities *(include if feature involves data)*

- **Role**: operator, website owner, or analyst; determines which screens and actions exist and which
  credential the console must hold.
- **Setup stage**: one of console running, backend connected, website configured, data arriving; derived
  from the state of the backend and its websites, never stored by hand.
- **Backend connection**: the address of a backend and the credential this computer holds for it (or
  the way it obtains it); has health, version, and compatibility.
- **Deployment plan and record**: the resources to be created, the operator's approval, the ordered steps and
  their outcomes, and the resulting audit entry (no secrets).
- **Website setup details**: the public values a website owner needs, plus a read-only key limited to
  their website; never includes the administrator credential.
- **Read-only access**: the analyst's credential; issued, shown once, revocable, valid for reading analytics
  only.
- **Installation**: the installed package and its version, and the saved settings that survive updates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a clean macOS or Linux machine with only Node.js 22, a new operator goes from the install
  command to a running console in the browser in under two minutes, using exactly two commands and no
  repository.
- **SC-002**: An operator with a Cloudflare account and no backend can go from a running console to a
  verified, connected backend without leaving the console except to sign in to Cloudflare, in under ten
  minutes, and nothing is created before they approve the plan.
- **SC-003**: With no backend connected, 100% of controls that would create or change anything are
  unavailable, each with a stated reason and a next step, and none sends a request.
- **SC-004**: In a test of new users, at least 9 in 10 can say what the next setup step is within ten
  seconds of looking at the console at each of the four stages.
- **SC-005**: Using the analyst credential, 100% of attempts at every state-changing operation are refused
  by the backend, and 100% of read-only analytics reads succeed.
- **SC-006**: A website owner with only the shared setup details can install, check, and see their website's
  first data without ever being offered a backend-managing control or seeing the administrator credential.
- **SC-007**: No secret appears in the installed package, in any log, or in any screen after its single
  display, verified across a full deploy, rotate, and issue-access cycle.
- **SC-008**: The footer shows the brand, tagline, both link groups, and version on 100% of console
  screens at phone and desktop widths in both themes with zero automated accessibility violations.
- **SC-009**: An existing checkout-based setup, in either credential mode, is recognized and used by the
  npm-installed console with no questions and no loss of access, in 100% of tested configurations.
- **SC-010**: New and changed screens have zero automated accessibility violations at WCAG 2.2 AA and are
  fully operable by keyboard alone.
- **SC-011**: Repository-wide automated test coverage remains above 90% for lines and branches.

## Assumptions

- **Scope for a patch release**: The owner calls this a patch release. It is larger than the previous
  patches (a new distribution path, a guided deployment, and a read-only credential). Stories are ordered
  so the release can ship in slices: Stories 1 to 4 need no backend change; Stories 5 to 8 build on them.
  What ships together is the owner's call at planning time.
- **Package name**: `vizoalica` is currently unclaimed on the npm registry. Publishing is an owner
  action (account, two-factor authentication) and outside this specification; the release process will
  describe it. The existing statement that Vizoalica is source-only is replaced by the npm path.
- **Where the first-run questions are asked**: In the console, not in the terminal, so that one place
  serves all three roles and stays accessible. `vizoalica console` therefore starts without terminal
  questions.
- **Roles are credentials, not accounts**: There are no user accounts, sign-ups, or logins. A role is what
  a person's credential allows, held on their own computer. The console adapts to the credential it
  holds and to the role the person chose, and the backend enforces the credential's limits.
- **Read-only keys are new**: The backend today has one administrator credential and no scoped
  credentials, so the analyst and website-owner roles need a read-only key the backend enforces. One
  kind of key serves both: an analyst's key covers everything or one project, and a website owner's key
  is limited to their one website. This is a database change, so, like the 0.5 and 0.6 lines, it
  applies to fresh installs and is added by hand to an existing database.
- **Known limit for website owners**: A website's token service signs with a secret the backend shares
  across websites, so an owner who holds that secret could mint tokens for another website. This feature
  does not change that; per-website signing is a separate, later specification. The owner role therefore
  does not receive the administrator credential, and the documentation states this limit plainly.
- **Deployment tooling**: The console drives Cloudflare's own command-line tool on the operator's computer
  and the operator's own Cloudflare sign-in; it does not receive or store Cloudflare account credentials
  itself. The tool is fetched when first needed if it is not already present.
- **Retired command**: `vizoalica install` is retired. Lower-level commands stay for scripts and
  advanced use (the exact list is decided at planning) but are not the documented path. A short
  non-interactive way to deploy for automation is a follow-up if needed.
- **Platforms**: macOS and Linux with Node.js 22 or newer, as today. Windows remains unsupported.
- **No telemetry**: The console makes no request about the user; it does not check for updates on its own.
  Updating is an explicit npm action.
- **Compatibility policy**: The package version and the backend version move together. The 0.5 and 0.6
  lines support fresh installs only for schema changes, and the console reports that state rather than
  attempting an in-place change.
- **Footer content**: Uses only local assets and static links; the documentation link goes to the
  documentation section of the website. An npm link is added once the package is published.
- **OneCLI mode**: Continues to work exactly as today for operators who use it; the console reads its
  existing settings.

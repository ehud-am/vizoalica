# Feature Specification: Install from npm and a Console-First Setup

**Feature Branch**: `018-npm-console-first-setup`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "let's start to work on the next iteration. this will be another patch release. 1. Let's fix the footer of the console. we want the foot to include a link to vizoalica.dev as well as to the github project.please see the gitlocal.dev footer as example. 2. i want to continue to improve the deployment process. What do you think about install from npm? We probably need to remove the "vizoalica install" command that does everything, it is a bit too much. My thinking the deployment process looks like this: 1. npm install -g vizoalica. 2. run "vizoalica console" if this is first run it will ask you few questions and adjust the flow based on that. We want to get to a running console first, then get to running backend in cloudflare, then get the websites configured, then see results. I should be able to do all from the console. The flow should be very clear about what i can do when, e.g. can't create projects/websites, if i still do not have a backend. Make sure that we still diffrentiate between an operator that can manage the backend, vs. owner of a wesite that needs to configure the website, vs. an analyst that can just see the data"

**Follow-up (2026-09-22)**: "let's add worker and database schema versions and abolity to update those from the console. To clarify the roles, admin - can do everything. analyst - van view the analytics, and see the configuration but change nothing. Website owner - can view analytics, can manager projects and websites, but can not change the backend workers and databases"

## Who this is for

Three roles use Vizoalica, and this feature keeps them apart. The backend enforces each one; the console
only reflects it.

- **Admin**: looks after the backend in a Cloudflare account and can do everything: deploy and update the
  Worker and the database, change secrets, issue and revoke access, manage projects and websites, and see all
  data.
- **Analyst**: can view the analytics and see the configuration (projects, websites, installation details,
  health, and the backend's versions), but can change nothing.
- **Website owner**: can view the analytics and manage projects and websites (create, edit, enable,
  disable, and delete them, within the scope the admin gave), but cannot change the backend: the Worker, the
  database, its secrets, or who has access.

One person can be all three (a solo maintainer), but a team can split them, because each role uses a
different credential.

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

As an admin, I install Vizoalica with one command and start the console with one more, without
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
rest of what I see follows from my answers. It asks who I am here (admin, website owner, or
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
2. **Given** I say I am an admin with no backend, **When** I continue, **Then** I am taken to
   deploying a backend (Story 5).
3. **Given** I say I am an admin with an existing backend, **When** I continue, **Then** I am asked
   only for what is needed to connect to it, and connect (Story 5).
4. **Given** I say I am a website owner, **When** I continue, **Then** I am asked for the setup details
   my admin gave me (Story 6).
5. **Given** I say I am an analyst, **When** I continue, **Then** I am asked for the read-only access my
   admin gave me (Story 7).
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

### User Story 5 - The Admin Deploys and Maintains the Backend from the Console (Priority: P2)

As an admin, I deploy the Vizoalica backend into my Cloudflare account from the console, without a
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

1. **Given** I am an admin with no backend, **When** I choose to deploy, **Then** the console first
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
8. **Given** an existing backend that is behind this console, **When** the console detects it, **Then** it
   offers the update in Story 9 instead of asking for a fresh install.
9. **Given** I am an admin, **When** I use the backend screen, **Then** I can rotate a secret,
   purge deleted websites and projects, and (optionally) add or remove sample data, each with a
   confirmation that names what will happen.
10. **Given** any admin action that changes the account, **When** it is done, **Then** an
    auditable record of what was done (no secret values) is available.

---

### User Story 6 - A Website Owner Manages Their Projects and Websites (Priority: P2)

As a website owner, I use access my admin gave me to manage projects and websites: add a website to a
project, configure it, enable or disable it, get its installation steps and the SDK file, and check that
data has arrived. I can view the analytics. I cannot change the backend, so I never need the administrator
credential. My access covers everything, one project, or one website, as my admin chose.

**Why this priority**: Website owners are a different person from the admin in a team, and today they would
need the admin's full credential just to add a website or read its installation steps.

**Independent Test**: As an owner with only an owner key, create or configure a website within scope, follow
the console through installing it until the check reports data, then try every backend-level operation and
every out-of-scope operation and confirm each is refused.

**Acceptance Scenarios**:

1. **Given** the admin issues owner access (everything, one project, or one website), **When** I connect
   with it, **Then** I see the analytics and a Manage area limited to the projects and websites in my scope.
2. **Given** owner access to everything, **When** I create a project and add a website, **Then** the backend
   creates them and they appear in my Manage area and in the setup journey.
3. **Given** owner access limited to one project, **When** I use the console, **Then** I can add and manage
   websites in that project, and I cannot create projects or see any other project.
4. **Given** owner access limited to one website, **When** I use the console, **Then** I can edit, enable,
   disable, and delete that website and see its installation steps, and I cannot add websites or projects.
5. **Given** the owner role, **When** I look at the backend screen, **Then** I can read its versions and health
   but every control that would change the Worker, the database, its secrets, sample data, purging, or access
   is shown unavailable with the reason "Only an admin can change the backend."
6. **Given** owner access, **When** any operation outside my scope or above my role is attempted directly
   against the backend, **Then** the backend refuses it and out-of-scope things are reported as not found.
7. **Given** I have installed the SDK on my website, **When** I run the check, **Then** the console tells me
   whether data has arrived, and if not, what to look at first.
8. **Given** a website I created needs its token service to sign visitors' requests, **When** the console
   shows the next step, **Then** it says the admin provides the signing secret through the documented step;
   I never see it.
9. **Given** my access is revoked, **When** I next use the console, **Then** it says so and what to do,
   without showing stale data.

---

### User Story 7 - An Analyst Sees the Data and the Configuration, and Changes Nothing (Priority: P2)

As an analyst, I open the console with read-only access my admin gave me and see the analytics, and I can
also see how things are configured: the projects and websites, their installation details, their health, and
the backend's versions. Nothing I can reach changes anything, and the backend itself refuses any attempt.

**Why this priority**: The owner wants to be sure that a person who needs to understand the numbers can see
the setup behind them, and that this cannot change anything, by enforcement and not only by hiding controls.

**Independent Test**: As an analyst, use every analytics and configuration screen, then attempt every
state-changing operation directly against the backend with the analyst credential and confirm each is
refused.

**Acceptance Scenarios**:

1. **Given** the admin issues analyst access from the console, **When** it is shown, **Then** it is shown
   once, can be copied, can be revoked, and can be replaced, and it works only for reading.
2. **Given** I choose the analyst role and enter that access, **When** the console verifies it, **Then** I
   see the Analytics area and read-only configuration screens for projects, websites, health, and the backend.
3. **Given** the configuration screens, **When** I look at any control that would change something, **Then** it
   is shown unavailable with the reason "Your access is read-only", and it sends nothing.
4. **Given** the analyst credential, **When** it is used to try any operation that creates, edits, enables,
   disables, deletes, updates the backend, or manages secrets or access, **Then** the backend refuses it and
   records nothing.
5. **Given** the configuration screens, **When** I read them, **Then** they never show an administrator
   secret, a signing secret, or any access key.
6. **Given** the admin revokes my access, **When** I next load data, **Then** the console tells me my access
   was revoked and what to do, instead of showing stale data.

---

### User Story 8 - The Old "install" Command Is Retired and Existing Setups Keep Working (Priority: P3)

As an existing user of the checkout-based commands, my setup keeps working, and the documentation
points to the one new path. The single command that does everything (`vizoalica install`) is removed
and replaced by the console flow. Lower-level admin commands remain available for scripts and
for people who prefer them, but the documented path is the console.

**Why this priority**: The owner explicitly wants the all-in-one command gone, but the maintainer's
own running installation and any existing admins must not be broken by the change.

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

### User Story 9 - See the Worker and Database Versions and Update Them from the Console (Priority: P2)

As an admin, I can see three versions at a glance: this console, the Worker running in Cloudflare, and the
database schema, and whether each is up to date. When the Worker or the database is behind what this console
carries, I update it from the console. It shows what will change, takes a backup first, updates the database
and then the Worker, checks the result, and reports. Data keeps being collected throughout.

**Why this priority**: Until now a schema change meant a fresh install, which made every release that touched
the database a reason not to upgrade. Versioned, updatable backends remove that, and they are what makes
console-driven maintenance safe.

**Independent Test**: With a backend one release behind, open the versions panel, update from the console,
and confirm the plan was shown first, a backup was taken, the database changed before the Worker, the
versions now match, no accepted event was lost, and an audit record exists.

**Acceptance Scenarios**:

1. **Given** a connected backend, **When** I open the backend screen, **Then** I see the console version, the
   Worker version, and the database schema version (and the version this console expects), each with a status:
   up to date, update available, the console is older (update the console), or unknown.
2. **Given** any role, **When** I open the backend screen, **Then** I can read the versions and statuses, and
   only an admin sees update controls that are available.
3. **Given** an update is available, **When** I choose to update, **Then** the console shows a plan: the Worker
   version from and to, each pending database change with a plain description and whether it only adds, the
   backup that will be taken, and the order; nothing changes until I approve.
4. **Given** I approve, **When** the update runs, **Then** a backup of the database is saved first (and its
   location shown), then pending database changes are applied in order, then the Worker is updated, then the
   result is checked (health, versions, administrator access), with each step visible.
5. **Given** only the Worker or only the database is behind, **When** I update, **Then** only what is behind is
   changed.
6. **Given** a step fails, **When** the flow stops, **Then** it says what failed and what was already applied,
   the backend keeps serving (the previous Worker works with the newer database), and I can resume without
   repeating finished steps.
7. **Given** I decline the backup, **When** I confirm that I understand the risk, **Then** the update
   proceeds and the record says no backup was taken.
8. **Given** the update is running, **When** visitors' events arrive, **Then** they are accepted and none is
   lost.
9. **Given** the backend is newer than this console, **When** I look at it, **Then** the console says to update
   the console and offers no downgrade.
10. **Given** a backend older than the oldest version that can be updated in place, **When** I look at it,
    **Then** the console says so and explains what to do instead of attempting an unsafe change.
11. **Given** I am not signed in to Cloudflare, **When** I start an update, **Then** the console guides me to
    sign in first and changes nothing until I have.
12. **Given** an update finished, **When** I look for a record, **Then** an auditable record (no secret values)
    lists what was changed, from which versions to which, and the backup location.

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
- **A database change fails part-way**: each change is applied on its own and recorded, so earlier ones stay
  applied; the console says which one failed and why, keeps the backend serving, and can retry only the rest.
- **The backup fails or is too large to take**: the console says so and requires an explicit choice to
  continue without one; it never continues silently.
- **Two admins update at the same time**: the second sees that the changes were already applied (or that an
  update is in progress) and repeats nothing.
- **A version cannot be determined** (for example a Worker from before versions were reported): it is shown as
  unknown and treated as behind, so the update is offered.
- **The database has changes that were added by hand**: the update adopts them safely instead of failing or
  duplicating them.
- **A newer console meets an older backend, or the reverse**: the console explains which side to update and
  never offers a downgrade.
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
  data anywhere except to the user's own backend and to Cloudflare when the admin deploys.

**First run and roles**

- **FR-011**: On first run (no saved settings) the console MUST show a first-run flow that asks at most
  three questions on any path: the role (admin, website owner, or analyst) and what the person
  already has (a backend or none for admins), and only what that path needs to connect.
- **FR-012**: Each role choice MUST state in plain words what it allows and what it does not.
- **FR-013**: The person MUST be able to review and change their role and connection later from a
  settings screen, and the console MUST NOT re-ask the first-run questions once they are answered.
- **FR-014**: The console MUST detect an existing setup from the checkout-based commands (both credential
  modes) and use it without the first-run questions.
- **FR-015**: The console MUST show only the controls and screens the current role and credential can use.
  A role's limits MUST also be enforced by the backend, not only by the console.

**Roles and credentials**

- **FR-016**: The **admin** role MUST have the administrator credential and Cloudflare access and MUST be
  able to do everything: deploy, connect, and update the backend (the Worker and the database), rotate
  secrets, purge deleted data, add and remove sample data, issue and revoke access for the other roles,
  manage projects and websites, and see all data. It MUST be the only role that can do any of the
  backend-level operations in this list.
- **FR-017**: The **analyst** role MUST use a read-only key that the backend accepts only for reading
  analytics and configuration (projects, websites, installation details, health, and the backend's
  versions) and refuses for every other operation, including reading any secret or access key.
- **FR-018**: The **website owner** role MUST use a key that lets it do everything an analyst can read, and
  also create, edit, enable, disable, and delete projects and websites within the scope of the key. The
  backend MUST refuse an owner key for every backend-level operation: deploying or updating the Worker or the
  database, secrets, purging, sample data, access keys, and the automation interface.
- **FR-019**: A key's scope MUST be everything, one project, or one website, and MUST decide what its holder
  can create: with everything, projects (and websites); limited to a project, websites in that project only;
  limited to a website, nothing new. Resources outside the scope MUST be reported as not found. Keys MUST be
  issuable (with a role and a scope), shown once, listed without secrets, revocable, and replaceable by the
  admin from the console, and MUST NOT allow obtaining any other credential. The setup details an admin
  shares MUST never contain the administrator credential or the token signing secret; the admin places the
  signing secret on the website's own token service through the existing documented step (see the known
  limit in Assumptions).
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

- **FR-026**: The console MUST let the admin deploy the backend into their Cloudflare account, connect to
  an existing backend, update a backend, rotate secrets, purge deleted data, and add or remove sample data.
- **FR-027**: Before creating anything the console MUST verify the admin is signed in to Cloudflare
  (guiding sign-in if not), show a plan of every resource it will create with names, purposes, and the
  cost model, and create nothing until the admin approves.
- **FR-028**: The deployment MUST run as visible, ordered steps; a failed step MUST stop the flow with what
  failed, what already exists, and how to continue or clean up. A run MUST be resumable without creating
  duplicates and MUST NOT delete anything silently.
- **FR-029**: On success the console MUST verify the backend answers and accepts the administrator
  credential, and MUST connect itself to it.
- **FR-030**: Generated secrets MUST be shown once, be copyable, be stored only in the protected place
  the current credential mode uses, and never appear in logs, screens after the first view, or files
  other people on the computer can read.
- **FR-031**: The console MUST show the connected backend's address, health, and versions (see the version
  requirements below) and whether it is compatible with this console, with a clear path when it is not.
- **FR-032**: Every admin action that changes the account MUST leave an auditable record without secret
  values. The flow MUST request only the Cloudflare access it needs and MUST NOT bypass the admin's
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
  flow, the update flow, and every role's screens, with keyboard operation and status announcements.

**Versions and updates**

- **FR-037**: The backend MUST report the version of the Worker that is running, the version of the database
  schema that is applied, and the schema version the running Worker expects. The console MUST show, on the
  backend screen, its own version, the Worker version, and the database schema version (and the version this
  console carries), each with a status: up to date, update available, the console is older, or unknown.
- **FR-038**: Every role MUST be able to read the versions and statuses. Only the admin MUST be able to start
  an update.
- **FR-039**: Every database change MUST ship as a numbered, ordered, forward-only change. Applied changes MUST
  be recorded so the applied version can be read from the database itself. The database MUST be brought from
  any supported earlier version to the current one by applying the pending changes in order, and the result
  MUST equal a fresh installation.
- **FR-040**: Within a release line a database change MUST be additive, so that the previous Worker keeps
  working against a newer database. A change that is not additive MUST be called out in the release notes,
  MUST be shown in the update plan, and MUST require a confirmed backup.
- **FR-041**: The console MUST be able to update the Worker and the database from a connected admin
  connection through the same plan, approval, ordered steps, and resume rules as a deployment: it shows what
  will change (the Worker from and to, each pending database change with a plain description and whether it
  only adds), creates nothing and changes nothing before approval, and changes only what is behind.
- **FR-042**: Before changing the database an update MUST take a backup and report where it is; skipping it
  MUST need an explicit confirmation and MUST be recorded. Then it MUST apply pending database changes in
  order, then update the Worker, then verify health, versions, and administrator access.
- **FR-043**: An update MUST NOT interrupt event collection: events sent while it runs MUST be accepted, and
  a failed step MUST leave the backend serving and be resumable without repeating finished steps.
- **FR-044**: The console MUST NOT downgrade a Worker or a database. For a backend newer than the console it
  MUST say to update the console, and for one older than the oldest version that can be updated in place it
  MUST say so and explain what to do instead.
- **FR-045**: A database that has changes added by hand MUST be adopted safely by an update (no failure, no
  duplicate objects). An update MUST leave an auditable record of what changed and from which versions to
  which, without secret values, and MUST be repeatable when a version is unknown.

### Key Entities *(include if feature involves data)*

- **Role**: admin, website owner, or analyst; determines which screens and actions exist and which
  credential the console must hold.
- **Setup stage**: one of console running, backend connected, website configured, data arriving; derived
  from the state of the backend and its websites, never stored by hand.
- **Backend connection**: the address of a backend and the credential this computer holds for it (or
  the way it obtains it); has health, version, and compatibility.
- **Deployment plan and record**: the resources to be created, the admin's approval, the ordered steps and
  their outcomes, and the resulting audit entry (no secrets).
- **Website setup details**: the public values a website owner needs, plus an access key limited to
  their website; never includes the administrator credential.
- **Access key**: the analyst's and owner's credential; carries a role (analyst or owner) and a scope
  (everything, one project, or one website); issued, shown once, revocable.
- **Version status**: for the console, the Worker, and the database schema: the current version, the version
  the console carries, and a status (up to date, update available, console older, unknown).
- **Database change**: a numbered, ordered, forward-only, additive change with a plain description; applied
  changes are recorded in the database itself.
- **Update run**: like a deployment run, with a backup step, the pending database changes, the Worker step,
  and a verification; resumable; recorded without secrets.
- **Installation**: the installed package and its version, and the saved settings that survive updates.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a clean macOS or Linux machine with only Node.js 22, a new admin goes from the install
  command to a running console in the browser in under two minutes, using exactly two commands and no
  repository.
- **SC-002**: An admin with a Cloudflare account and no backend can go from a running console to a
  verified, connected backend without leaving the console except to sign in to Cloudflare, in under ten
  minutes, and nothing is created before they approve the plan.
- **SC-003**: With no backend connected, 100% of controls that would create or change anything are
  unavailable, each with a stated reason and a next step, and none sends a request.
- **SC-004**: In a test of new users, at least 9 in 10 can say what the next setup step is within ten
  seconds of looking at the console at each of the four stages.
- **SC-005**: Using an analyst key, 100% of attempts at every state-changing operation are refused by the
  backend, and 100% of reads of analytics and configuration succeed. Using an owner key, 100% of
  backend-level operations and of operations outside its scope are refused, and 100% of in-scope project and
  website operations succeed.
- **SC-006**: A website owner with only an owner key can create or configure a website within their scope,
  install it, and see its first data without ever being offered a backend-changing control or seeing the
  administrator credential.
- **SC-007**: No secret appears in the installed package, in any log, or in any screen after its single
  display, verified across a full deploy, rotate, and issue-access cycle.
- **SC-008**: The footer shows the brand, tagline, both link groups, and version on 100% of console
  screens at phone and desktop widths in both themes with zero automated accessibility violations.
- **SC-009**: An existing checkout-based setup, in either credential mode, is recognized and used by the
  npm-installed console with no questions and no loss of access, in 100% of tested configurations.
- **SC-010**: New and changed screens have zero automated accessibility violations at WCAG 2.2 AA and are
  fully operable by keyboard alone.
- **SC-011**: Repository-wide automated test coverage remains above 90% for lines and branches.
- **SC-012**: On 100% of tested backends (current, one release behind, and with hand-added changes) the
  console shows the correct Worker and database versions and statuses to every role.
- **SC-013**: An admin brings a backend that is one release behind (Worker and database) up to date from the
  console in under ten minutes, with a backup taken first, no event lost during the update, the database
  equal to a fresh installation, and an auditable record.
- **SC-014**: 100% of updates either take a backup before changing the database or record an explicit,
  confirmed decision not to.

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
- **Access keys are new**: The backend today has one administrator credential and no scoped credentials, so
  the analyst and website-owner roles need keys the backend enforces. One kind of key carries a role (analyst
  or owner) and a scope (everything, one project, or one website). Deleting is part of managing: an owner can
  delete the projects and websites in their scope, with the same named confirmations the console already
  asks for.
- **Schema changes become updatable (this ends fresh-install-only)**: Database changes become numbered,
  forward-only, additive changes that the console applies, so the earlier rule that a schema change needs a
  fresh install no longer applies from this release. The oldest schema that can be updated in place is the
  one shipped in 0.5.2; older databases need a fresh installation. Changes are additive within a release
  line (FR-040), so an update is safe to resume and the previous Worker keeps working if a step fails.
- **Backups**: The default backup is an export of the database saved on the admin's computer in a private
  location. A database too large to export this way requires the explicit skip in FR-042.
- **Known limit for website owners**: A website's token service signs with a secret the backend shares
  across websites, so an owner who holds that secret could mint tokens for another website. This feature
  does not change that; per-website signing is a separate, later specification. The owner role therefore
  does not receive the administrator credential, and the documentation states this limit plainly.
- **Deployment tooling**: The console drives Cloudflare's own command-line tool on the admin's computer
  and the admin's own Cloudflare sign-in; it does not receive or store Cloudflare account credentials
  itself. The tool is fetched when first needed if it is not already present.
- **Retired command**: `vizoalica install` is retired. Lower-level commands stay for scripts and
  advanced use (the exact list is decided at planning) but are not the documented path. A short
  non-interactive way to deploy for automation is a follow-up if needed.
- **Platforms**: macOS and Linux with Node.js 22 or newer, as today. Windows remains unsupported.
- **No telemetry**: The console makes no request about the user; it does not check for updates on its own.
  Updating is an explicit npm action.
- **Compatibility policy**: The package, the Worker, and the database schema each carry a version. The console
  and the Worker are compatible when their major and minor versions match; the schema must be at least the
  version the Worker expects. Anything else is reported with which side to update.
- **Footer content**: Uses only local assets and static links; the documentation link goes to the
  documentation section of the website. An npm link is added once the package is published.
- **OneCLI mode**: Continues to work exactly as today for admins who use it; the console reads its
  existing settings.

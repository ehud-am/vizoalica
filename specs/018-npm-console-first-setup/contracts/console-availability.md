# Contract: Roles, stages, and what the console shows

## Capabilities

Classes: `view` (analytics and configuration reads), `operate` (creating and managing projects and websites,
including enabling, disabling, and deleting them), and `backend` (changing the Worker or database, secrets,
purging, sample data, and access keys). The former `administer` class is renamed `backend`, and `delete-website`
and `delete-project` move to `operate`.

| Capability id                                    | Class   | Admin | Analyst | Website owner         |
| ------------------------------------------------ | ------- | ----- | ------- | --------------------- |
| `view-analytics`                                 | view    | ✓     | ✓       | ✓ (in scope)          |
| `view-configuration` (projects, websites, install details, health) | view | ✓ | ✓ | ✓ (in scope) |
| `view-backend` (versions, health, compatibility) | view    | ✓     | ✓       | ✓                     |
| `download-sdk`                                   | view    | ✓     | ✓       | ✓                     |
| `set-theme`                                      | view    | ✓     | ✓       | ✓                     |
| `create-project`                                 | operate | ✓     | -       | ✓ (scope everything)  |
| `add-website`                                    | operate | ✓     | -       | ✓ (scope everything or that project) |
| `edit-website`, `toggle-website`, `delete-website` | operate | ✓   | -       | ✓ (in scope)          |
| `delete-project`                                 | operate | ✓     | -       | ✓ (project in scope)  |
| `deploy-backend`, `update-backend`               | backend | ✓     | -       | -                     |
| `rotate-secret`, `purge-deleted`, `manage-demo`  | backend | ✓     | -       | -                     |
| `manage-access-keys`, `share-website-setup`      | backend | ✓     | -       | -                     |
| `manage-environments` (create, remove)           | backend | ✓     | -       | -                     |

Connecting to a backend is not a capability: every role does it on first run with its own credential.

"-" means the holder **cannot** do it. On a screen the role can see, the control is shown unavailable with the
role's reason (below); screens the role can never use (the deployment and update wizard, the access keys screen)
are absent from its navigation, and their routes redirect to the role's home with a notice.

## Navigation by role

| Role          | Analytics area | Manage area                                                                                | Extra                          |
| ------------- | -------------- | ------------------------------------------------------------------------------------------ | ------------------------------ |
| Admin         | all views      | Projects, Websites, Backend (with the update flow), Access, Health                          | Setup journey until complete   |
| Analyst       | all views      | Projects, Websites, Health, Backend, all read-only                                          | -                              |
| Website owner | all views in scope | Projects and Websites in scope (with their create and manage controls), Health, Backend (read-only) | Setup journey (stages 3 and 4) |

## Availability of a present control

`availability(role, stage, capability)` returns `{ available, reason, next }`. A present control that is not
available is rendered as follows, and sends no request:

| Element                | Requirement                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| State                  | `aria-disabled="true"`, focusable, not activated by click or key                                    |
| Reason                 | Plain text next to it and referenced by `aria-describedby`; never color alone                       |
| Next step              | A link to where to fix it, when there is one                                                        |

Reasons (exact wording is UI copy; the meaning is the contract):

| Situation                                              | Reason                                                | Next                                  |
| ------------------------------------------------------ | ----------------------------------------------------- | ------------------------------------- |
| No backend connected, action needs one                 | "Connect or deploy a backend first."                  | Backend step                          |
| No project yet, adding a website                       | "Create a project first."                             | Create a project                      |
| Analyst, any change                                    | "Your access is read-only."                           | -                                     |
| Owner, a backend-level action                          | "Only an admin can change the backend."               | -                                     |
| Owner, creating outside its scope                      | "Your access does not allow creating this here."      | -                                     |
| Backend unreachable                                    | "The backend is not answering. Check it and retry."   | Backend screen                        |
| Backend older than the console, key management         | "This backend needs an update before it can issue keys." | The update flow (admin) or "ask your admin" |
| Backend newer than the console                         | "This backend is newer than this console. Update the console (npm update -g vizoalica)." | Update note |
| Key revoked or invalid                                 | "Your access was revoked. Ask your admin for a new key." | Connect step                       |

## Versions panel (backend screen, every role)

Three rows: **Console** (installed version), **Worker** (running version), **Database schema** (applied version).
Each shows the current version, the version this console carries, and a status with text and an icon:
*Up to date*, *Update available*, *Console is older* (with "Update the console: npm update -g vizoalica"),
*Unknown* (with why), or *Unsupported* (with what to do). The admin sees an **Update backend** control when the
Worker or the schema is behind; everyone else sees it unavailable with the role's reason.

## Journey

Four stages: **Console running**, **Backend connected**, **Website configured**, **Data arriving**. It shows the
current stage, what is done, and one next action. Next actions by role and state:

| State                                   | Admin                                | Website owner                               | Analyst                                   |
| --------------------------------------- | --------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| No backend                              | Deploy or connect a backend             | Enter the setup details you were given      | Enter the access key you were given       |
| Backend, no project or website          | Create a project and add a website      | Ask your admin to register your website  | "Nothing to see yet." Ask your admin   |
| Website registered, no data             | Follow the install steps, then Check    | Follow the install steps, then Check        | "Waiting for the first data."             |
| Data arriving                           | Journey hides                           | Journey hides                               | -                                         |

## First-run questions (in the console)

At most three per path. Q1 role: **Admin** ("I look after the backend"), **Website owner** ("I need to make a
website send data"), **Analyst** ("I only look at results"), each with one sentence on what it allows and does
not. For an admin, naming the first environment happens alongside Q2 (one combined step: name it, then "I
need a backend" or "I already have one"), not as a fourth question, since a single default name (for example
the environment's own suggestion) is offered and can be accepted with one action. Q3 the credential needed:
for an existing backend the address and administrator secret; for an owner the setup details (paste or file);
for an analyst the address and key. Deploying needs no Q3: it goes to the deployment flow. A website owner or
analyst never names an environment; their key already determines it.

## Environment switcher

Shown once more than one environment is saved (a single environment shows only a small, unobtrusive label,
per the "one environment is the common case" assumption); present in the shell alongside the footer, visible
from every screen. Lists every saved environment by name with its connection status; selecting one calls
`POST /api/environments/:name/select` and every screen's data (journey, versions, projects, websites,
analytics, access keys) refreshes to the newly selected environment with no leftover data from the previous
one. An admin can create a new environment or remove an existing one from the same control (removal needs a
confirmation naming the environment and stating that this does not delete its Cloudflare resources). A
website owner or analyst never sees the switcher: their key fixes their environment.

## Footer

Present on every screen and state. Content: brand mark and name; tagline "Privacy-first analytics that runs in
your own Cloudflare account."; column **Vizoalica**: Website (vizoalica.dev), Documentation, Get started,
Privacy; column **Project**: GitHub, Discussions, Issues, Release notes, License (npm is added once the package is published);
bottom line: © year Vizoalica and "Version x.y.z". Requirements: local assets only, no request until a link is
followed, external links `rel="noopener noreferrer"` and `target="_blank"`, single column at phone width, AA
contrast in both themes, visible focus, each link has a distinct accessible name.

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
*Unknown* (with why), or *Unsupported* (with what to do). Every role sees the same read-only statuses; nothing on this screen changes the backend (updating is
`pnpm vizoalica backend` in a checkout).

## Journey

Four stages: **Console running**, **Backend connected**, **Website configured**, **Data arriving**. It shows the
current stage, what is done, and one next action. Next actions by role and state:

| State                                   | Admin                                | Website owner                               | Analyst                                   |
| --------------------------------------- | --------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| Backend, no project or website          | Create a project and add a website      | Ask your admin to register your website  | "Nothing to see yet." Ask your admin   |
| Website registered, no data             | Follow the install steps, then Check    | Follow the install steps, then Check        | "Waiting for the first data."             |
| Data arriving                           | Journey hides                           | Journey hides                               | -                                         |

## Welcome page (Revision 3; replaces the first-run questions)

Shown instead of any console screen when no environment is usable. It asks nothing. It says: what an
environment is (one sentence); then, depending on the case, **no environments yet** (with
`vizoalica env add <name>`), **the file is broken** (its reason and path), or, for each environment, the
problems found (rejected or revoked secret, wrong role, unreachable Worker, incompatible version, OneCLI not
usable) with `vizoalica env update <name>`; and where to see everything (`vizoalica env list`). One button,
**Check again**, re-verifies. It offers no field or control that changes an environment.

## Environment picker

The only environment control in the console. With one usable environment, a small label; with more, a select in
the top bar listing every environment by name and role. Unusable ones are shown disabled with their first
problem. Choosing one calls `POST /api/environments/:name/select` and the console reloads every screen for it
with nothing left over from the previous one. There is no creation, removal, or credential control anywhere in
the console. A website owner or analyst sees the picker only if their file lists more than one environment.

## Footer

Present on every screen and state. Content: brand mark and name; tagline "Privacy-first analytics that runs in
your own Cloudflare account."; column **Vizoalica**: Website (vizoalica.dev), Documentation, Get started,
Privacy; column **Project**: GitHub, Discussions, Issues, Release notes, License (npm is added once the package is published);
bottom line: © year Vizoalica and "Version x.y.z". Requirements: local assets only, no request until a link is
followed, external links `rel="noopener noreferrer"` and `target="_blank"`, single column at phone width, AA
contrast in both themes, visible focus, each link has a distinct accessible name.

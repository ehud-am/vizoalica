# Contract: Roles, stages, and what the console shows

## Capabilities

The existing matrix keeps its ids and gains the backend actions. Classes: `view`, `operate`, `administer`.

| Capability id                     | Class      | Area      | Operator | Analyst | Website owner |
| --------------------------------- | ---------- | --------- | -------- | ------- | ------------- |
| `view-analytics`                  | view       | analytics | ✓        | ✓       | ✓ (own website) |
| `view-health`                     | view       | manage    | ✓        | ✓       | ✓ (own website) |
| `view-installation`               | view       | manage    | ✓        | -       | ✓ (own website) |
| `download-sdk`                    | view       | manage    | ✓        | -       | ✓             |
| `set-theme`                       | view       | shell     | ✓        | ✓       | ✓             |
| `create-project`, `add-website`, `edit-website`, `toggle-website` | operate | manage | ✓ | - | - |
| `delete-website`, `delete-project` | administer | manage   | ✓        | -       | -             |
| `connect-backend`, `deploy-backend`, `update-backend` | administer | manage | ✓ | - | -   |
| `rotate-secret`, `purge-deleted`, `manage-demo`       | administer | manage | ✓ | - | -   |
| `manage-access-keys`, `share-website-setup`           | administer | manage | ✓ | - | -   |

"-" means the control is **absent** for that role (not disabled): the navigation, routes, and buttons are built
from the role the backend reports. A route a role cannot use redirects to that role's home with a notice.

## Navigation by role

| Role          | Analytics area | Manage area                                                            | Extra                          |
| ------------- | -------------- | ---------------------------------------------------------------------- | ------------------------------ |
| Operator      | all views      | Projects, Websites, Backend, Access, Health                            | Setup journey until complete   |
| Analyst       | all views      | none                                                                   | -                              |
| Website owner | all views for their website | their Website page (install steps, SDK download, check, health) | Setup journey (stages 3 and 4) |

## Availability of a present control

`availability(role, stage, capability)` returns `{ available, reason, next }`. A present control that is not
available is rendered as follows, and sends no request:

| Element                | Requirement                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| State                  | `aria-disabled="true"`, focusable, not activated by click or key                                    |
| Reason                 | Plain text next to it and referenced by `aria-describedby`; never color alone                       |
| Next step              | A link to where to fix it (for example the connect step)                                           |

Reasons (exact wording is UI copy; the meaning is the contract):

| Situation                                        | Reason                                             | Next                                  |
| ------------------------------------------------ | -------------------------------------------------- | ------------------------------------- |
| No backend connected, action needs one           | "Connect or deploy a backend first."               | Backend step                          |
| No project yet, adding a website                 | "Create a project first."                          | Create a project                      |
| Backend unreachable                              | "The backend is not answering. Check it and retry." | Backend screen                        |
| Backend older than the console, key management   | "This backend is older and cannot issue keys. Update it."   | Backend screen                |
| Backend newer than the console                   | "This backend is newer than this console. Update the console (npm update -g vizoalica)." | Update note |
| Key revoked or invalid                           | "Your access was revoked. Ask your operator for a new key." | Connect step                    |

## Journey

Four stages: **Console running**, **Backend connected**, **Website configured**, **Data arriving**. It shows the
current stage, what is done, and one next action. Next actions by role and state:

| State                                   | Operator                                | Website owner                               | Analyst                                   |
| --------------------------------------- | --------------------------------------- | ------------------------------------------- | ----------------------------------------- |
| No backend                              | Deploy or connect a backend             | Enter the setup details you were given      | Enter the access key you were given       |
| Backend, no project or website          | Create a project and add a website      | Ask your operator to register your website  | "Nothing to see yet." Ask your operator   |
| Website registered, no data             | Follow the install steps, then Check    | Follow the install steps, then Check        | "Waiting for the first data."             |
| Data arriving                           | Journey hides                           | Journey hides                               | -                                         |

## First-run questions (in the console)

At most three per path. Q1 role: **Operator** ("I look after the backend"), **Website owner** ("I need to make a
website send data"), **Analyst** ("I only look at results"), each with one sentence on what it allows and does
not. Q2 (operator only): **I need a backend** or **I already have one**. Q3 the credential needed: for an
existing backend the address and administrator secret; for an owner the setup details (paste or file); for an
analyst the address and key. Deploying needs no Q3: it goes to the deployment flow.

## Footer

Present on every screen and state. Content: brand mark and name; tagline "Privacy-first analytics that runs in
your own Cloudflare account."; column **Vizoalica**: Website (vizoalica.dev), Documentation, Get started,
Privacy; column **Project**: GitHub, Discussions, Issues, Release notes, License (and npm once published);
bottom line: © year Vizoalica and "Version x.y.z". Requirements: local assets only, no request until a link is
followed, external links `rel="noopener noreferrer"` and `target="_blank"`, single column at phone width, AA
contrast in both themes, visible focus, each link has a distinct accessible name.

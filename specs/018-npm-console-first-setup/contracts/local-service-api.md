# Contract: The local service (console API)

The service listens on `127.0.0.1:4318` only. `/api/*` routes need the session cookie
(`POST /api/session` first, as today) and an exact allowlisted `Origin` (`http://127.0.0.1:4318`, plus the
Vite origin `http://127.0.0.1:5173` in a checkout). Errors use the existing shape
`{ "error": "<code>", "recovery": "…" }`. `A` below means the connection's principal must be the admin. Read routes are available to every role and follow
the Worker's per-role rules; a role that the Worker would refuse is refused locally first (`403`) as defense in depth.

**Environments (Revision 3, R28).** Environments are defined in `~/.config/vizoalica/environments.json` and
managed only by `vizoalica env`; the service **reads** that file (re-reading it when it changes, and
re-verifying at most every 30 seconds) and never writes it. Every data route operates on the **selected**
environment, which must be usable. There is no route that creates, changes, or removes an environment, and no
route that connects, disconnects, deploys, updates, rotates, or purges.

## Environments

| Route                                  | Purpose                                                                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /api/environments`                | `{ file: { status: "ok" \| "broken", path, reason? }, environments: [state], selected }`      |
| `POST /api/environments/recheck`       | Same answer, after re-reading the file and re-verifying every environment now                 |
| `POST /api/environments/:name/select`  | Selects a usable environment, remembers it in `preferences.json`, and returns the setup state |

`state` is `{ name, url?, role?, secretSource?: "file" \| "onecli", cloudflare: "none" \| "file" \| "onecli",
usable, problems: [{ code, message }] }` and never contains a secret. Problem codes: `invalid`, `onecli`,
`unauthorized`, `wrong_role`, `unreachable`, `incompatible`, `cloudflare_rejected`, `cloudflare_unreachable`.
Errors: `404 environment_not_found`; `409 environment_unusable`. `selected` is `null` when no environment is
usable, and the console then shows the welcome page.

## Console and assets (no session needed, `GET` and `HEAD` only)

| Path                                   | Behavior                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `/` and any path that is not `/api/*` or an asset | The built console (`index.html`); assets under `/assets/` and `/brand/`           |
| `/api/sdk/vizoalica.js`, `/api/sdk/vizoalica-loader.js` | The SDK files shipped in the package, `text/javascript`, for every role       |

Headers on console pages: `content-security-policy: default-src 'self'; img-src 'self' data:; style-src 'self'
'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`, `x-content-type-options: nosniff`,
`cache-control: no-store` for `index.html`, long-lived for hashed assets. Paths are normalized and must stay
inside the console directory (`..`, encoded separators, and absolute paths give 404); no directory listing.

## Setup state

### `GET /api/setup/state`

Returns the setup state (see the data model): version, the selected `environment`, connection, principal,
backend compatibility, and the four stages, computed from the live backend. A backend that cannot be reached
gives `connection.status: "unreachable"` and the stages marked `blocked`. `409 no_usable_environment` (with the
same body as `GET /api/environments`) when nothing is usable.

## Backend versions

| Route              | Roles | Purpose                                                                                          |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------ |
| `GET /api/backend` | all   | The Worker and schema versions and their statuses, the versions this console carries, and health |

Read-only. The console does not deploy, update, rotate, purge, or add sample data; those are `vizoalica
backend`, `rotate`, `purge-deleted`, and `demo` in a source checkout.

## Access keys and sharing (A)

| Route                                   | Purpose                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `GET/POST/DELETE /api/access-keys[/:id]` | Proxies the Worker routes; `POST` takes `{ label, role: "analyst" or "owner", projectId?, sourceId? }` and returns the key once |
| `POST /api/websites/:id/share`          | Issues an owner key limited to that website (or an analyst key, by `role`) and returns the setup details (see the data model) |

## Existing routes

`/api/projects`, `/api/projects/:id/websites`, `/api/projects/:id/analytics[/actions]`, and the website routes keep
their shapes. Reads are available to every role. Creating, editing, enabling, disabling, and deleting projects and
websites are available to the admin and to an owner within scope. Every other write is admin-only. The service
refuses what the Worker would refuse (`403`) before calling it, and forwards the rest with the caller's own
credential.

## Refusals by stage

Every route that needs a backend answers `409 backend_not_connected` with `recovery: "connect_backend"` when
no environment is usable, so the console can explain instead of failing. (`connect_backend` now means: fix an
environment with `vizoalica env`.)

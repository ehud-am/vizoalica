# Contract: The local service (console API)

The service listens on `127.0.0.1:4318` only. `/api/*` routes need the session cookie
(`POST /api/session` first, as today) and an exact allowlisted `Origin` (`http://127.0.0.1:4318`, plus the
Vite origin `http://127.0.0.1:5173` in a checkout). Errors use the existing shape
`{ "error": "<code>", "recovery": "…" }`. `A` below means the connection's principal must be the admin. Read routes are available to every role and follow
the Worker's per-role rules; a role that the Worker would refuse is refused locally first (`403`) as defense in depth.

## Console and assets (no session needed, `GET` and `HEAD` only)

| Path                                   | Behavior                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `/` and any path that is not `/api/*` or an asset | The built console (`index.html`); assets under `/assets/` and `/brand/`           |
| `/api/sdk/vizoalica.js`, `/api/sdk/vizoalica-loader.js` | The SDK files shipped in the package, `text/javascript`, for every role       |

Headers on console pages: `content-security-policy: default-src 'self'; img-src 'self' data:; style-src 'self'
'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`, `x-content-type-options: nosniff`,
`cache-control: no-store` for `index.html`, long-lived for hashed assets. Paths are normalized and must stay
inside the console directory (`..`, encoded separators, and absolute paths give 404); no directory listing.

## Setup

### `GET /api/setup/state`

Returns the setup state (see the data model): version, `needsFirstRun`, connection, principal, backend
compatibility, and the four stages. Computed from the live backend; a backend that cannot be reached gives
`connection.status: "unreachable"` and the last known stages marked `blocked`.

### `POST /api/setup/connect`

`{ "workerUrl": "https://…workers.dev", "credential": "…", "roleHint": "admin" }`. The service normalizes
the URL (https origin only; loopback http allowed), calls `whoami` with the credential, and on success saves
the connection file (0600, atomic) and switches its client. Response: the new setup state. Errors:
`400 invalid_request`; `401 unauthorized` (credential rejected); `503 unreachable`; `409 wrong_credential_kind`
when an administrator secret was entered where the caller's `roleHint` is not `admin` (the state is still
saved as the admin it is, with `notice: "administrator_secret_used"`); `422 incompatible` with the
compatibility message when the backend is unusable with this console. A backend without `whoami` is accepted
for an administrator secret (via the project list) with `backend.compatibility: "backend-older"`.

### `POST /api/setup/disconnect`

Removes the saved credential (revoked marker, as `revoke` does today). The state returns to first run.

### `POST /api/setup/role`

`{ "roleHint": "admin" | "website-owner" | "analyst" }` changes only the remembered hint used to word the
console; it never changes access.

## Deployment and updates (A)

| Route                                       | Purpose                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET  /api/deploy/preflight`                | Is the deployment tool ready (and being fetched)? Is Cloudflare signed in? Accounts. Existing Vizoalica resources |
| `POST /api/deploy/tool`                     | Start preparing the pinned deployment tool (first time only); progress appears in `preflight`     |
| `POST /api/deploy/signin`                   | Start the Cloudflare sign-in; returns `{ "url": "…" }` when the tool prints one; completion appears in `preflight` |
| `POST /api/deploy/plan`                     | `{ mode, accountId, names }` with `mode` `first-install` or `update-backend` → the plan and a `planId`; creates nothing. For `update-backend` the plan lists the Worker version from and to, each pending database change with its plain description and whether it only adds (with the `non-additive` flag and a required backup when it is not), and the backup that will be taken |
| `POST /api/deploy/runs`                     | `{ planId }` approves that plan and starts the run → `{ id }`. For an update `{ planId, skipBackup: { confirm: true } }` declines the backup (recorded); it is refused when the plan has a non-additive change |
| `GET  /api/deploy/runs/:id`                 | The run record: steps with statuses, errors, `created`, `result`, and whether secrets can be revealed |
| `POST /api/deploy/runs/:id/resume`          | Continue a failed or interrupted run without repeating finished steps                              |
| `POST /api/deploy/runs/:id/cleanup`         | `{ confirm: true }` removes only resources this run created, listed back                            |
| `POST /api/deploy/runs/:id/reveal`          | Returns the generated secrets **once** (`200`), then `410 gone`; wiped after 10 minutes unrevealed  |
| `POST /api/deploy/connect-existing`         | `{ workerUrl }` and the credential path; same verification as `setup/connect`                       |

Rules: plan is required and unmodified before a run starts (a changed name needs a new plan); a run refuses
resources it did not create; the sign-in and Wrangler processes are spawned without a shell using argument
arrays; nothing writes a secret to a log, a run record, or a response other than the single reveal;
`cleanup` never runs without `confirm: true`. Run records carry names and statuses only.

## Backend, versions, and maintenance

| Route                                    | Roles | Purpose                                                                     |
| ---------------------------------------- | ----- | --------------------------------------------------------------------------- |
| `GET  /api/backend`                      | all   | Address, health, the Worker and schema versions and their statuses, the versions this console carries, the pending database changes, and whether keys are supported |
| `POST /api/backend/rotate/:kind`         | A     | `admin`, `token`, or `digest`; shows the new value once via the same reveal  |
| `POST /api/backend/purge-deleted`        | A     | `{ apply: false }` dry run, or `{ apply: true }` after confirmation           |
| `POST /api/backend/demo`, `DELETE /api/backend/demo` | A | Add or remove sample data                                          |

Updating the Worker and the database is done through the deployment routes above with `mode: "update-backend"`.

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
no connection exists, so the console can explain instead of failing.

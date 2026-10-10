# Contract: Roles, access keys, and versions on the Worker

## Roles

| Role      | Credential                     | Can                                                                                                   |
| --------- | ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **admin** | The administrator secret       | Everything: all routes, key management, purging, and (from the admin's computer, through Wrangler) deploying and updating the Worker and database |
| **analyst** | An access key with role `analyst` | Read analytics and configuration (projects, websites, installation details, health, versions); change nothing |
| **owner** | An access key with role `owner`   | Everything an analyst can read, plus create, edit, enable, disable, and delete projects and websites within the key's scope; nothing at backend level |

## Bearer resolution

Every `/v1/admin/*` request carries `Authorization: Bearer <token>`.

1. If the token equals the administrator secret (constant-time compare) the principal is the **admin**. This
   path is unchanged.
2. Otherwise, if it matches `^vzk_([a-z0-9]{12})_([A-Za-z0-9_-]{43})$`, look the id up, require
   `revoked_at IS NULL`, and compare `sha256(secret)` to `secret_hash` in constant time. A match makes the
   principal an **analyst** or **owner** (the row's role) with the key's scope.
3. Anything else is `401 unauthorized` (and audited under the existing denial gate).

If the `access_keys` table is absent (a database that has not been updated) step 2 answers 401 and the key routes
answer `501 access_keys_unavailable`; the admin is unaffected.

## Who may call what

`A` admin, `N` analyst, `W` owner, both subject to scope. `-` is refused with `403 forbidden` and nothing is
recorded. A resource outside the key's scope is `404 not_found` (existence is not revealed).

| Route                                                              | A | N | W                                                                   |
| ------------------------------------------------------------------ | - | - | ------------------------------------------------------------------- |
| `GET /v1/admin/whoami`                                             | ✓ | ✓ | ✓                                                                   |
| `GET /v1/admin/backend` (versions and health)                      | ✓ | ✓ | ✓                                                                   |
| `GET /v1/admin/projects`                                           | ✓ | ✓ scoped | ✓ scoped                                                     |
| `GET /v1/admin/projects/:id/sources`, `…/sources/:sid`, `/snippet`, `/status` | ✓ | ✓ scoped | ✓ scoped                                          |
| `GET …/analytics`, `…/analytics/actions`, `…/sources/:sid/analytics` | ✓ | ✓ scope forced | ✓ scope forced                                          |
| `POST /v1/admin/projects` (create a project)                       | ✓ | - | ✓ only with scope **everything**                                     |
| `PATCH`/`DELETE /v1/admin/projects/:id` (edit, disable, delete)    | ✓ | - | ✓ if the project is in scope (everything, or that project)          |
| `POST …/projects/:id/sources` (add a website)                      | ✓ | - | ✓ if scope is everything, or that project                            |
| `PATCH`/`DELETE …/sources/:sid` (edit, enable, disable, delete)    | ✓ | - | ✓ if the website is in scope (everything, its project, or that website) |
| `POST /v1/admin/purge-deleted`                                     | ✓ | - | -                                                                   |
| `GET`/`POST /v1/admin/access-keys`, `DELETE /v1/admin/access-keys/:id` | ✓ | - | -                                                               |
| The MCP adapter                                                    | ✓ | - | -                                                                   |
| Any route not listed                                               | per its current rule | - | -                                                        |

**Scope.** A key has a scope of everything, one project, or one website (`project_id`, `source_id`). Reads and
writes outside it are `404`. For reads that span websites (an overview or actions request without `source_id`)
a website-scoped key is forced to its website, and one naming another website gets `404`. What a scope lets an
owner **create**: everything → projects and websites; one project → websites in it; one website → nothing.

**Audit.** Every write by an owner is recorded in `administrative_audit` with the key id in a new `actor`
column (null for the admin). Issuing and revoking keys are audited. Failed authorization uses the existing
denial gate. No entry contains a key, a hash, or label text beyond what audit entries already allow.

## `GET /v1/admin/whoami`

```json
{
  "role": "admin",
  "scope": { "projectId": null, "sourceId": null },
  "keyLabel": null,
  "workerVersion": "0.6.4",
  "features": { "accessKeys": true, "versions": true }
}
```

`role` is `admin`, `analyst`, or `owner`; `keyLabel` is set for keys. `workerVersion` is baked in at build time.

## `GET /v1/admin/backend`

Readable by every role. Never includes a secret.

```json
{
  "workerVersion": "0.6.4",
  "schema": {
    "applied": 2,
    "expected": 2,
    "appliedNames": ["0001_initial.sql", "0002_access_keys.sql"],
    "status": "current"
  },
  "health": { "database": "ok", "storage": "ok" }
}
```

`schema.applied` is the highest number in the database's `d1_migrations` table; `expected` is the highest
migration number this Worker was built with; `status` is `current`, `behind` (applied lower than expected),
`ahead` (applied higher), or `unknown` (no `d1_migrations` table). `health` is a cheap read of each store
(`ok` or `unavailable`).

## `POST /v1/admin/access-keys` (admin)

Request: `{ "label": "Jane, analyst", "role": "analyst", "projectId": "…", "sourceId": "…" }`. `role` is
`analyst` or `owner`; `projectId` and `sourceId` are optional (`sourceId` requires `projectId`), must exist and be
active; label 1 to 64 characters, no control characters. Response `201`:

```json
{ "id": "k3m9x2a7q1zp", "label": "Jane, analyst", "role": "analyst",
  "scope": { "projectId": null, "sourceId": null },
  "createdAt": "2026-09-22T12:00:00.000Z", "key": "vzk_k3m9x2a7q1zp_…" }
```

`key` appears only here. Errors: `400 invalid_request`, `404 not_found` (scope target), `409 too_many_keys` (more
than 200 active keys), `501 access_keys_unavailable`.

## `GET /v1/admin/access-keys` (admin)

`[{ id, label, role, scope, createdAt, revokedAt }]`, newest first. Never includes secrets or hashes.

## `DELETE /v1/admin/access-keys/:id` (admin)

Sets `revoked_at`; idempotent; `200 { "status": "revoked" }`, `404` for an unknown id. A revoked key is refused on
its next request.

## Compatibility

New routes and a new column only; existing routes keep their behavior for the admin. A Worker from before this
release answers `404` for `whoami` and `backend`, which the console treats as an older backend with unknown
versions (see the local service contract).

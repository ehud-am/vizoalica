# Contract: Access keys and roles on the Worker

## Bearer resolution

Every `/v1/admin/*` request carries `Authorization: Bearer <token>`.

1. If the token equals the administrator secret (constant-time compare) the principal is the **operator**.
   This path is unchanged.
2. Otherwise, if it matches `^vzk_([a-z0-9]{12})_([A-Za-z0-9_-]{43})$`, look the id up, require
   `revoked_at IS NULL`, and compare `sha256(secret)` to `secret_hash` in constant time. A match makes the
   principal a **reader** with the key's scope.
3. Anything else is `401 unauthorized` (and audited under the existing denial gate).

If the `access_keys` table is absent (a database from before this release) step 2 answers 401 and the key
routes answer `501 access_keys_unavailable`; the administrator is unaffected.

## Who may call what

`O` operator, `R` reader (subject to scope), `-` refused (`403 forbidden`, nothing recorded).

| Route                                                             | O | R                                             |
| ----------------------------------------------------------------- | - | --------------------------------------------- |
| `GET /v1/admin/whoami`                                            | ✓ | ✓                                             |
| `GET /v1/admin/projects`                                          | ✓ | ✓ only projects in scope                      |
| `GET /v1/admin/projects/:id/sources`                              | ✓ | ✓ only websites in scope                      |
| `GET /v1/admin/projects/:id/sources/:sid` and `/snippet`, `/status` | ✓ | ✓ only within scope                          |
| `GET /v1/admin/projects/:id/analytics` and `/analytics/actions`   | ✓ | ✓ scope forced (below)                        |
| `GET /v1/admin/projects/:id/sources/:sid/analytics` (summary)     | ✓ | ✓ only within scope                           |
| `GET /v1/admin/access-keys`, `POST /v1/admin/access-keys`, `DELETE /v1/admin/access-keys/:id` | ✓ | - |
| Every `POST`, `PATCH`, `DELETE` on projects and sources, `purge-deleted` | ✓ | -                                     |
| The MCP adapter                                                   | ✓ | -                                             |
| Anything not listed                                               | per its current rule | -                          |

**Scope forcing.** A key with `project_id` set can only name that project; any other project returns
`404 not_found` (not 403, so existence is not revealed). A key with `source_id` set is forced to that website:
an overview or actions request without `source_id` is answered for that website only, and a request naming a
different website returns 404. A key without scope sees everything readable.

## `GET /v1/admin/whoami`

```json
{
  "role": "operator",
  "scope": { "projectId": null, "sourceId": null },
  "keyLabel": null,
  "workerVersion": "0.6.3",
  "features": { "accessKeys": true }
}
```

`role` is `operator` or `reader`; `keyLabel` is set for readers. `workerVersion` is the version baked into
the Worker at build time. `features.accessKeys` is `false` when the table is absent.

## `POST /v1/admin/access-keys` (operator)

Request: `{ "label": "Jane, analyst", "projectId": "…", "sourceId": "…" }` (`projectId` and `sourceId`
optional; `sourceId` requires `projectId`; both must exist and be active; label 1 to 64 characters, no
control characters). Response `201`:

```json
{ "id": "k3m9x2a7q1zp", "label": "Jane, analyst", "scope": { "projectId": null, "sourceId": null },
  "createdAt": "2026-09-22T12:00:00.000Z", "key": "vzk_k3m9x2a7q1zp_…" }
```

`key` appears only here. Errors: `400 invalid_request`, `404 not_found` (scope target), `409 too_many_keys`
(more than 200 active keys), `501 access_keys_unavailable`.

## `GET /v1/admin/access-keys` (operator)

`[{ id, label, scope, createdAt, revokedAt }]`, newest first. Never includes secrets or hashes.

## `DELETE /v1/admin/access-keys/:id` (operator)

Sets `revoked_at`; idempotent; `200 { "status": "revoked" }`, `404` for an unknown id. A revoked key is refused
on its next request.

## Audit

Issuing and revoking write `administrative_audit` entries (operation, outcome, the key `id` as the target,
never the key or label text beyond what audit entries already allow). Failed reader authorization uses the
existing denial gate.

## Compatibility

New routes only. Existing routes keep their behavior for the administrator. An older Worker answers `404` for
`whoami`, which the console treats as "older backend" (see the local service contract).

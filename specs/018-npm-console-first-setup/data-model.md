# Data Model: Install from npm, a Console-First Setup, and Multiple Backend Environments

> Revision 3 (2026-09-24): environments are one editable file managed by `vizoalica env`; the deployment run
> record, per-environment files, active pointer, and connection-file fields are gone.

Phase 1 output for [plan.md](./plan.md). Decisions are in [research.md](./research.md).

## Environments file (this computer, `~/.config/vizoalica/environments.json`, mode 0600) — Revision 3

Replaces the per-environment files, `active-environment.json`, and the pending role hint of the earlier
design (R24, R25). One JSON object, edited by `vizoalica env` or by hand, read (never written) by the service:

```json
{ "version": 1, "environments": { "<name>": { "url": "…", "role": "admin", "secret": "…", "cloudflare": { "token": "…" } } } }
```

| Field              | Meaning                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| key (`<name>`)     | The environment's name; also its Cloudflare resource-name prefix (R26): lowercase letters, digits, dashes, starting with a letter |
| `url`              | The Worker's https origin: `workers.dev` or a custom domain; no path, query, or credentials; loopback http allowed |
| `role`             | `admin`, `owner`, or `analyst`; must equal the role the Worker reports for `secret` (checked)         |
| `secret`           | The administrator secret (admin) or access key (owner, analyst): a string, or `{ "onecli": { "workspace", "agent", "gateway" } }` (OneCLI as a local vault) |
| `cloudflare.token` | Admin only, optional: a Cloudflare API token, a string or the same OneCLI form; checked active with Cloudflare |

A missing file or empty map means no environments. A file that is not JSON, has the wrong shape, an unknown
`version`, is a symbolic link, or is readable by other users is **broken** (reason and path shown). One
invalid entry does not break the file: it is listed as unusable with its reason, and `vizoalica env` refuses to
rewrite the file while an entry would be dropped. The selected environment is stored separately in
`preferences.json` as `environment`.

**Environment state** (derived, never stored, never contains a secret): `name`, `url`, `role`, `secretSource`
(`file`/`onecli`), `cloudflare` (`none`/`file`/`onecli`), `usable`, and `problems[]` (`code`, `message`).
Usable means: the secret resolves, the Worker accepts it, its reported role equals `role`, versions are
compatible, and any Cloudflare token is active.

## Access key (backend, D1 table `access_keys`, added by migration `0002_access_keys.sql`)

The credential for the analyst and website-owner roles.

| Column        | Type | Constraint and meaning                                                                          |
| ------------- | ---- | ----------------------------------------------------------------------------------------------- |
| `id`          | TEXT | Primary key. 12 characters of `[a-z0-9]`; appears in the key, so it is not secret               |
| `label`       | TEXT | `NOT NULL`, 1 to 64 characters, who or what the key is for                                      |
| `role`        | TEXT | `NOT NULL`, `CHECK (role IN ('analyst', 'owner'))`                                               |
| `secret_hash` | TEXT | `NOT NULL`, lowercase hex SHA-256 of the key's secret; the secret itself is never stored        |
| `project_id`  | TEXT | Nullable. `NULL` means every project                                                            |
| `source_id`   | TEXT | Nullable. Allowed only with a `project_id` (`CHECK (source_id IS NULL OR project_id IS NOT NULL)`) |
| `created_at`  | TEXT | `NOT NULL`, ISO 8601 UTC                                                                        |
| `revoked_at`  | TEXT | Nullable. Non-null means the key no longer works                                                |

Index: `(project_id)` for removing keys when a project is deleted. The migration also adds a nullable
`actor` column (`TEXT`) to `administrative_audit`, holding the key id for writes made by an owner (null for the
admin). Purging a deleted project or website also
deletes the keys scoped to it (the existing purge lists gain the table). Retention: keys live until revoked or
their scope is deleted.

**Key format**: `vzk_<id>_<secret>`, where `<secret>` is 32 random bytes in base64url (43 characters). The
whole string is shown once, at issue time.

**States**: `active` (revoked_at is null) then `revoked`. There is no un-revoke; a new key replaces it.

## Principal (derived per request, not stored)

| Field       | Values                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------ |
| `role`      | `admin` (administrator secret), `analyst`, or `owner` (the role of an active access key)    |
| `scope`     | `{ projectId: string or null, sourceId: string or null }`; the admin's is null, null       |
| `keyLabel`  | Keys only                                                                                  |

## Database changes (migrations) and versions

Numbered, forward-only files in `deploy/cloudflare/migrations/`, named `NNNN_description.sql`. Applied ones are
recorded by name in the database's `d1_migrations` table (kept by Wrangler).

| Number | File                     | What it does                                                                                     |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------ |
| 1      | `0001_initial.sql`       | The schema as shipped, including the two action tables from 0.6.0. Never edited again            |
| 2      | `0002_access_keys.sql`   | Creates `access_keys` and its index; adds `administrative_audit.actor`; creates the two action tables `IF NOT EXISTS` so a 0.5.2 database and one with hand-added tables both reach the fresh-install state |

Rules (tested): only additive statements (`CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE … ADD COLUMN`, `INSERT OR
IGNORE`), guarded with `IF NOT EXISTS` where SQLite allows; a file containing `DROP`, `RENAME`, `DELETE`, or `UPDATE`
must carry the annotation `-- vizoalica:non-additive`, which the update plan and release notes then surface and which
requires a confirmed backup.

| Version            | Meaning                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------- |
| Applied schema     | Highest number among the names in `d1_migrations`; `unknown` if the table is absent           |
| Expected schema    | Highest migration number the Worker was built with (baked in) or the console's package carries |
| Worker version     | The release version baked into the Worker at build time                                       |
| Console version    | The installed package's version                                                               |

**Version status** (per component, computed by the console):

| Status             | Rule                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `current`          | Equal to what this console carries (Worker: same major and minor; schema: applied = expected) |
| `update-available` | Worker older by major or minor, or applied schema below the console's expected               |
| `console-older`    | Worker newer by major or minor, or applied schema above the console's expected               |
| `unknown`          | No version reported (older Worker) or no `d1_migrations` table                                |
| `unsupported`      | Applied schema below 1 or a database older than the 0.5.2 schema: in-place update refused     |

## Setup state (derived on demand by the local service)

| Field        | Meaning                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `version`    | The installed package version                                                                                      |
| `environment` | The selected environment's name (the list of environments comes from `GET /api/environments`)                     |
| `connection` | The selected environment's connection: `status`: `connected`, `unreachable`, `revoked`, `incompatible`; `workerHost` |
| `principal`  | The role, scope, and key label reported by the backend, when connected                                             |
| `backend`    | `workerVersion`, the applied and expected schema versions, a `status` for each of the Worker and the schema (see Version status), and a plain message |
| `stages[]`   | Four entries: `id`, `label`, `status` (`done`, `current`, `todo`, `blocked`), and for the current one a `next` action |

Stage rules: **console running** is always done; **backend connected** when the connection is `connected` and
compatible enough to use; **website configured** when the principal can see at least one website; **data arriving**
when any visible website reports accepted data. The current stage is the first not done; a stage is `blocked`
when an earlier one is not done and the principal could not act on it anyway.

## Website setup details (produced by the admin's "Share setup", never stored by the service)

| Field                  | Meaning                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `workerUrl`            | The ingestion backend address                                                 |
| `projectId`, `websiteId`, `publicSourceKey`, `allowedOrigins` | Public identifiers already shown in the console        |
| `readKey`              | A newly issued access key limited to this website                             |
| `guidance`             | Consent and installation notes                                                |

Delivered as a copyable block and a downloadable JSON file. Never contains the administrator secret or the
token signing secret.

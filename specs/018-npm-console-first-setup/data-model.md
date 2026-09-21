# Data Model: Install from npm and a Console-First Setup

Phase 1 output for [plan.md](./plan.md). Decisions are in [research.md](./research.md).

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

## Connection (this computer, `~/.config/vizoalica/local-operations.json`, mode 0600)

Existing file, same permission rules and atomic replace. Keys:

| Key                        | Meaning                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `VIZOALICA_REMOTE_URL`     | The backend's https origin (loopback http allowed for local development)            |
| `VIZOALICA_ADMIN_SECRET`   | The administrator secret, or the placeholder `onecli-managed` in OneCLI mode        |
| `VIZOALICA_READ_KEY`       | An access key. Exactly one of this and the administrator secret is present          |
| `VIZOALICA_ROLE_HINT`      | Optional: `admin`, `website-owner`, or `analyst`; only remembers the first-run choice and grants nothing |

Validation: the pair is verified against the backend (`whoami`) before it is saved; a file with both
credentials, or neither, is invalid; a placeholder is only valid under the OneCLI wrapper.

## Setup state (derived on demand by the local service)

| Field        | Meaning                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `version`    | The installed package version                                                                                      |
| `needsFirstRun` | `true` when no connection is saved                                                                              |
| `connection` | `status`: `none`, `connected`, `unreachable`, `revoked`, `incompatible`; `workerHost`; `mode`: `file` or `onecli`  |
| `principal`  | The role, scope, and key label reported by the backend, when connected                                             |
| `backend`    | `workerVersion`, the applied and expected schema versions, a `status` for each of the Worker and the schema (see Version status), and a plain message |
| `stages[]`   | Four entries: `id`, `label`, `status` (`done`, `current`, `todo`, `blocked`), and for the current one a `next` action |

Stage rules: **console running** is always done; **backend connected** when the connection is `connected` and
compatible enough to use; **website configured** when the principal can see at least one website; **data arriving**
when any visible website reports accepted data. The current stage is the first not done; a stage is `blocked`
when an earlier one is not done and the principal could not act on it anyway.

## Deployment run (local, `~/.config/vizoalica/deployments/<runId>.json`, no secrets)

| Field         | Meaning                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`          | Random, `[a-z0-9]{16}`                                                                                      |
| `mode`        | `first-install` or `update-backend` (Worker and database, with backup and migrations)                      |
| `names`       | `worker`, `database`, `bucket`, each 3 to 63 lowercase letters, digits, or dashes (existing name rule)      |
| `accountId`, `accountName` | The Cloudflare account chosen                                                                  |
| `plan[]`      | Each resource: `kind`, `name`, `purpose`; shown before approval                                             |
| `approvedAt`  | Set when the admin approves the plan; nothing runs before                                                |
| `steps[]`     | `id`, `label`, `status` (`pending`, `running`, `done`, `failed`, `skipped`), times, `error` text, `created` list |
| `result`      | `workerUrl`, `healthy`, and which secrets were generated by name only                                        |
| `versions`    | For updates: the Worker and schema versions before and after, the migrations applied, and the backup path (or that it was declined) |

Steps for an **update of the Worker and database**, in order: `prepare-tool`, `check-signin`, `read-versions`, `backup`,
`migrate` (skipped when the schema is current), `deploy-worker` (skipped when the Worker is current), `verify`, `record`.
The `backup` step writes `~/.config/vizoalica/backups/<database>-<timestamp>.sql` (mode 0600) and records its path
and size, or records that it was declined after explicit confirmation.

Steps for a first install, in order: `prepare-tool`, `check-signin`, `detect`, `create-database`,
`create-bucket`, `write-config`, `create-tables`, `deploy-worker`, `store-secrets`, `verify-health`,
`connect`. The existing `backend` CLI command keeps its own Worker-only update for scripts. A run can be resumed: steps already `done` are not repeated, and `detect` refuses resources
this run did not create unless the admin chose to connect to them.

**Secrets of a run** live only in memory: the three generated values, a single-use reveal that returns them
once and then wipes them, expiring after 10 minutes if never revealed. The administrator secret is also
written to the connection file when the run connects.

## Website setup details (produced by the admin's "Share setup", never stored by the service)

| Field                  | Meaning                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `workerUrl`            | The ingestion backend address                                                 |
| `projectId`, `websiteId`, `publicSourceKey`, `allowedOrigins` | Public identifiers already shown in the console        |
| `readKey`              | A newly issued access key limited to this website                             |
| `guidance`             | Consent and installation notes                                                |

Delivered as a copyable block and a downloadable JSON file. Never contains the administrator secret or the
token signing secret.

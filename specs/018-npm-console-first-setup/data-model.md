# Data Model: Install from npm and a Console-First Setup

Phase 1 output for [plan.md](./plan.md). Decisions are in [research.md](./research.md).

## Access key (backend, D1 table `access_keys`, added to the `0001_initial.sql` baseline)

A read-only credential for the analyst and website-owner roles.

| Column        | Type | Constraint and meaning                                                                          |
| ------------- | ---- | ----------------------------------------------------------------------------------------------- |
| `id`          | TEXT | Primary key. 12 characters of `[a-z0-9]`; appears in the key, so it is not secret               |
| `label`       | TEXT | `NOT NULL`, 1 to 64 characters, who or what the key is for                                      |
| `secret_hash` | TEXT | `NOT NULL`, lowercase hex SHA-256 of the key's secret; the secret itself is never stored        |
| `project_id`  | TEXT | Nullable. `NULL` means every project                                                            |
| `source_id`   | TEXT | Nullable. Allowed only with a `project_id` (`CHECK (source_id IS NULL OR project_id IS NOT NULL)`) |
| `created_at`  | TEXT | `NOT NULL`, ISO 8601 UTC                                                                        |
| `revoked_at`  | TEXT | Nullable. Non-null means the key no longer works                                                |

Index: `(project_id)` for removing keys when a project is deleted. Purging a deleted project or website also
deletes the keys scoped to it (the existing purge lists gain the table). Retention: keys live until revoked or
their scope is deleted.

**Key format**: `vzk_<id>_<secret>`, where `<secret>` is 32 random bytes in base64url (43 characters). The
whole string is shown once, at issue time.

**States**: `active` (revoked_at is null) then `revoked`. There is no un-revoke; a new key replaces it.

## Principal (derived per request, not stored)

| Field       | Values                                                                                |
| ----------- | ------------------------------------------------------------------------------------- |
| `role`      | `operator` (administrator secret) or `reader` (an active access key)                  |
| `scope`     | `{ projectId: string or null, sourceId: string or null }`; the operator's is null, null |
| `keyLabel`  | Readers only                                                                          |

## Connection (this computer, `~/.config/vizoalica/local-operations.json`, mode 0600)

Existing file, same permission rules and atomic replace. Keys:

| Key                        | Meaning                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `VIZOALICA_REMOTE_URL`     | The backend's https origin (loopback http allowed for local development)            |
| `VIZOALICA_ADMIN_SECRET`   | The administrator secret, or the placeholder `onecli-managed` in OneCLI mode        |
| `VIZOALICA_READ_KEY`       | An access key. Exactly one of this and the administrator secret is present          |
| `VIZOALICA_ROLE_HINT`      | Optional: `operator`, `website-owner`, or `analyst`; only remembers the first-run choice and grants nothing |

Validation: the pair is verified against the backend (`whoami`) before it is saved; a file with both
credentials, or neither, is invalid; a placeholder is only valid under the OneCLI wrapper.

## Setup state (derived on demand by the local service)

| Field        | Meaning                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| `version`    | The installed package version                                                                                      |
| `needsFirstRun` | `true` when no connection is saved                                                                              |
| `connection` | `status`: `none`, `connected`, `unreachable`, `revoked`, `incompatible`; `workerHost`; `mode`: `file` or `onecli`  |
| `principal`  | The role, scope, and key label reported by the backend, when connected                                             |
| `backend`    | `version` and `compatibility`: `compatible`, `backend-older`, `backend-newer`, or `unknown`, with a plain message  |
| `stages[]`   | Four entries: `id`, `label`, `status` (`done`, `current`, `todo`, `blocked`), and for the current one a `next` action |

Stage rules: **console running** is always done; **backend connected** when the connection is `connected` and
compatible enough to use; **website configured** when the principal can see at least one website; **data arriving**
when any visible website reports accepted data. The current stage is the first not done; a stage is `blocked`
when an earlier one is not done and the principal could not act on it anyway.

## Deployment run (local, `~/.config/vizoalica/deployments/<runId>.json`, no secrets)

| Field         | Meaning                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`          | Random, `[a-z0-9]{16}`                                                                                      |
| `mode`        | `first-install` or `update`                                                                                 |
| `names`       | `worker`, `database`, `bucket`, each 3 to 63 lowercase letters, digits, or dashes (existing name rule)      |
| `accountId`, `accountName` | The Cloudflare account chosen                                                                  |
| `plan[]`      | Each resource: `kind`, `name`, `purpose`; shown before approval                                             |
| `approvedAt`  | Set when the operator approves the plan; nothing runs before                                                |
| `steps[]`     | `id`, `label`, `status` (`pending`, `running`, `done`, `failed`, `skipped`), times, `error` text, `created` list |
| `result`      | `workerUrl`, `healthy`, and which secrets were generated by name only                                        |

Steps for a first install, in order: `prepare-tool`, `check-signin`, `detect`, `create-database`,
`create-bucket`, `write-config`, `create-tables`, `deploy-worker`, `store-secrets`, `verify-health`,
`connect`. For an update: `prepare-tool`, `check-signin`, `detect`, `write-config`, `deploy-worker`,
`verify-health`. A run can be resumed: steps already `done` are not repeated, and `detect` refuses resources
this run did not create unless the operator chose to connect to them.

**Secrets of a run** live only in memory: the three generated values, a single-use reveal that returns them
once and then wipes them, expiring after 10 minutes if never revealed. The administrator secret is also
written to the connection file when the run connects.

## Website setup details (produced by the operator's "Share setup", never stored by the service)

| Field                  | Meaning                                                                       |
| ---------------------- | ----------------------------------------------------------------------------- |
| `workerUrl`            | The ingestion backend address                                                 |
| `projectId`, `websiteId`, `publicSourceKey`, `allowedOrigins` | Public identifiers already shown in the console        |
| `readKey`              | A newly issued access key limited to this website                             |
| `guidance`             | Consent and installation notes                                                |

Delivered as a copyable block and a downloadable JSON file. Never contains the administrator secret or the
token signing secret.

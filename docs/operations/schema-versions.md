---
title: 'Database and Worker versions'
description: 'What the three versions the console shows mean, and how database changes ship.'
---

# Database and Worker versions

Starting at 0.6.4, the console's Backend screen shows three versions to every role: the **console**
you installed, the **Worker** deployed to your Cloudflare account, and the **database schema** the
Worker's D1 database has applied. Each has a status: up to date, an update is available, the console
is older than the backend, unknown (an older backend that predates this), or unsupported (a database
older than this feature can update in place).

Since 0.7.0, this is tracked **per environment** (research R24): if you manage more than one backend
from this console (`dev`, `stage`, `prod`, or any names you chose), each environment has its own
Worker, its own database, and its own versions, shown for whichever environment is currently
selected. Updating one environment never touches another's Worker, database, or credential.

## How a database change ships

Database changes are files in `deploy/cloudflare/migrations/`, named `NNNN_description.sql` and
numbered from `0001` upward. `0001_initial.sql` is the schema as first released and is never edited
again. Every file after it must be **additive only**: `CREATE TABLE`, `CREATE INDEX`,
`ALTER TABLE … ADD COLUMN`, and `INSERT OR IGNORE` are always allowed. A file that needs anything
else (`DROP`, `RENAME`, `DELETE`, `UPDATE`) must carry the line `-- vizoalica:non-additive`, so it is
called out in the update plan and in that release's changelog entry, and a backup is required before
it runs. `deploy/cloudflare/wrangler.production.toml` points Wrangler at this directory
(`migrations_dir = "migrations"`), and it keeps a `d1_migrations` table recording which files it has
applied.

The applied schema version is the highest number recorded in that table; the expected version is the
highest migration number this release was built with. `0002_access_keys.sql`, the first migration
after the fresh-install-only baseline, adds the `access_keys` table (for the analyst and
website-owner roles) and an `actor` column on the audit log. Because two of 0.6.0's tables
(`dashboard_minute_actions` and `dashboard_minute_action_visitors`) were added by hand to some
existing databases before they were folded into `0001`, it creates both with `IF NOT EXISTS`, so
either a stock 0.5.2 database or one with those tables already present reaches the same schema.

## Updating a backend

The console shows the Worker's and the schema's current and expected versions on the Backend screen, for every
role, and tells you when the backend is behind (or newer than the console). It does not change the backend.
Update it from the checkout that installed it with `pnpm vizoalica backend` (answer "update"), or by hand as
below. An environment whose database is newer than the console expects is not usable until you update the
console (`npm update -g vizoalica`); `vizoalica env check` says so.

## Applying a migration by hand

Take a backup first:

```sh
wrangler d1 export <database> --remote --output backup.sql
```

Then apply the pending migrations:

```sh
wrangler d1 migrations apply <database> --remote --config <this environment's rendered wrangler.toml>
```

This only runs files not already recorded in `d1_migrations`, so it is safe to run again. Deploy the
matching Worker build afterward (`wrangler deploy --config <same config> <packaged Worker bundle>`),
since the database change and the Worker code that expects it ship together. The console keeps each
environment's rendered configuration under `~/.config/vizoalica/deploy/<worker-name>/wrangler.toml`.

## Restoring a backup

A backup taken before an update is a plain SQL export. To restore it to the same database:

```sh
wrangler d1 execute <database> --remote --file <backup path>
```

Restoring rolls the database back to the moment of the backup; redeploy the matching older Worker
build afterward if the Worker was also updated, so the two stay in step.

## The oldest schema this can update

A schema from the original 0.5.0 release (before the action tables) or later can be brought forward
with these migrations. A database from before that point, or one that failed to apply `0001`
cleanly, is out of scope for an in-place update; set up a new backend instead.

## Writing a new migration

- Name it the next number, `NNNN_description.sql`.
- Make it additive only, unless there is truly no other way — then add the
  `-- vizoalica:non-additive` marker and say why in the file and in the release's changelog entry.
- `apps/ingest-worker/tests/migrations.test.ts` checks the numbering, the additivity rule, and that
  applying it reaches the same schema from both an empty database and the fixture in
  `apps/ingest-worker/tests/fixtures/schema-0.5.2.sql`. Update `EXPECTED_SCHEMA_VERSION` in
  `apps/ingest-worker/src/schema-version.ts` to match the new highest number.

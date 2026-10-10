# Contract: Setup Journeys and Fresh Deployment Guard

## Documentation Contract

The root README is the authoritative selector. It must show these exact cardinalities and paths:

| Story | Outcome | Run frequency | Primary guide |
| --- | --- | --- | --- |
| US1 | Customer Cloudflare backend | Once per customer environment | `docs/operations/cloudflare.md` |
| US2A | Direct-credential operator workstation | Once per operator choosing direct storage | `docs/operations/local-analytics.md` |
| US2B | OneCLI operator workstation | Once per operator choosing OneCLI | `docs/operations/ops-cli.md` |
| US3 | Website collection | Once per website | `docs/operations/pages.md` |

Each primary guide must include, without requiring another primary guide for omitted steps:

1. Scope, actor, and frequency.
2. Prerequisites and named inputs.
3. Credential/security boundary.
4. Ordered setup actions with stop-on-failure checkpoints.
5. Verification that proves the guide's outcome.
6. Redacted outputs/handoff.
7. Retry, revocation/removal, and scoped troubleshooting.
8. A statement of what the guide does not perform.

Cross-links may explain prerequisites or optional advanced behavior. They may not replace a
required action within the current guide.

## Fresh Deployment Contract

- Active release guidance says fresh deployments only.
- `deploy/cloudflare/migrations/` contains exactly one SQL migration: `0001_initial.sql`.
- The baseline creates the current schema directly and contains no schema rename, historical data
  copy, backfill, or down-migration.
- Both native and profile preflight inspect the selected remote database before a receipt or apply
  can authorize mutations.
- Apply repeats the inspection after validating exact-plan approval and before its first mutation.
- A result containing any known application table or the configured D1 migration tracking table is
  rejected as `existing_schema` (or an equivalent stable, user-facing failure).
- A failed or unparsable inspection is `ambiguous`, fails closed, and never proceeds to migration.
- Failure guidance directs the operator to select a new empty database. It does not delete, rename,
  alter, or adopt the existing database.

## Freshness Inspection Interface

The deployment provider exposes a read-only operation before mutation:

```text
d1.schema.inspect
```

Expected provider behavior:

- Executes one bounded query against the configured remote database.
- Returns machine-readable Wrangler output.
- Uses the selected profile/provider only and never falls back to ambient credentials.
- Shares the normal 60-second read timeout and output redaction.

Expected semantic result:

```text
empty       no known application or migration-tracking tables returned
existing    one or more known tables returned
ambiguous   command failed, output was truncated, or output could not be validated
```

## Verification Contract

Repository validation must prove:

- The consolidated baseline applies to an empty SQLite database and exposes every schema element
  used by the current application.
- Preflight and apply accept a valid empty inspection and reject existing/ambiguous state.
- All four story headings, frequencies, primary links, inputs, outputs, and fresh-only statements
  are consistent.
- No active guide or release note tells users to upgrade an existing Vizoalica database, apply the
  retired migration sequence, perform a backfill, or use a down-migration.
- Existing secret-redaction, exact-plan approval, provider isolation, Pages content/token checks,
  real-event proof, and host-site failure tests continue to pass.

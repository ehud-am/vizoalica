# Deployment CLI Contract

## Compatibility and ownership

The deployment CLI is the sole Vizoalica component that resolves a Cloudflare credential provider
and launches Cloudflare management commands. Existing `pnpm deploy:check`, `pnpm deploy:apply`, and
`pnpm deploy:verify` commands remain public entry points and delegate to it.

When `VIZOALICA_DEPLOY_PROFILE` is absent, the compatibility wrappers retain the current
Cloudflare-native behavior. When it is present, the profile's explicit provider is authoritative.
No provider is selected by probing the machine.

All commands support:

- `--profile <path>`: explicit profile path, overriding `VIZOALICA_DEPLOY_PROFILE`;
- `--json`: emit exactly one result matching [deployment-result.schema.json](./deployment-result.schema.json);
- `--help`: print safe usage without reading provider state.

Human output uses the same allowlisted result data as JSON output, does not rely on color, and never
passes through raw upstream output.

## Commands

### `configure`

```text
vizoalica-deploy configure
  --profile <path>
  --provider <onecli|cloudflare-native>
  --environment <name>
  --wrangler-config <path>
  --account-id <id>
  [--onecli-project <slug>]
  [--onecli-agent-id <id>]
  [--onecli-agent <identifier>]
  [--onecli-connection <id>]
  [--audit-retention-days <days>]
```

- Writes a profile matching [deployment-profile.schema.json](./deployment-profile.schema.json)
  atomically with user-only permissions.
- Requires every OneCLI field for `onecli` and rejects every OneCLI field for
  `cloudflare-native`.
- Accepts no token, key, secret, email, authorization-header, or generic passthrough option.
- Refuses to overwrite an existing profile unless `--replace` is supplied. Replacement records a
  safe audit event.
- Does not contact Cloudflare or mutate OneCLI grants.

### `plan`

```text
vizoalica-deploy plan --profile <path> --out <plan-path>
```

- Validates the profile and selected Wrangler configuration locally.
- Produces a canonical, user-only plan containing only operations from this catalog:
  `cloudflare.identity.read`, `d1.database.read`, `r2.bucket.read`, `worker.secrets.read`,
  `worker.bundle.dry_run`, `d1.migrations.apply`, `worker.deploy`, and `worker.health.verify`.
- Lists affected non-secret resource names, mutation status, and approval class.
- Computes `planId`, `profileDigest`, and `wranglerConfigDigest` from canonical content.
- Does not invoke OneCLI, Cloudflare, or Wrangler and never creates a receipt.

### `check`

```text
vizoalica-deploy check --profile <path> --plan <plan-path> [--receipt <path>]
```

- Rejects plan/profile/config digest differences before provider access.
- For OneCLI profiles, performs these read-only validations:
  1. OneCLI CLI version is at least 2.11.
  2. OneCLI authentication and configured project are available.
  3. The connection ID exists and reports provider `cloudflare`.
  4. The configured agent ID and identifier refer to the same agent.
  5. The connection is present in attached grants and effective credentials.
  6. No second effective Cloudflare connection can satisfy which credential will be injected.
- Runs Cloudflare identity/resource checks and the Worker dry-run through the selected provider.
- Confirms the authenticated Cloudflare account exactly equals the profile account.
- Verifies that `VIZOALICA_TOKEN_SECRET` and `VIZOALICA_ADMIN_SECRET` exist by name only.
- Writes a receipt bound to the plan, profile, Wrangler config, actor, provider, account, and
  connection. The receipt expires after 15 minutes.
- Performs no Cloudflare mutation.

### `apply`

```text
vizoalica-deploy apply
  --profile <path>
  --plan <plan-path>
  --receipt <receipt-path>
  --approve <plan-id>
```

- Requires `--approve` to exactly match the plan ID shown to the human reviewer or supplied by the
  protected CI approval step.
- Rejects an expired receipt or any profile, plan, config, actor, provider, account, or connection
  mismatch.
- Rechecks effective OneCLI access and Cloudflare account identity immediately before the first
  mutation.
- Applies pending D1 migrations before deploying the Worker, preserving the existing operation
  order.
- Stops after the first failed or denied mutation and reports completed and pending operation IDs.
- Never retries with a different provider or credential. A retry requires a fresh `check` receipt.

### `verify`

```text
vizoalica-deploy verify --profile <path> --worker-url <https-url> [--plan <plan-path>]
```

- Requires HTTPS and verifies the deployed health endpoint.
- Validates the response body against the existing bounded health contract.
- Does not require Cloudflare management authorization.
- Emits an audit record linked to the plan when provided.

### `status`

```text
vizoalica-deploy status --profile <path> [--plan-id <id>]
```

- Reads only local allowlisted audit records.
- Reports the most recent outcome and any known completed/pending operations.
- Never reads plan files or raw provider logs from outside the profile's state directory.

## Provider contract

The internal provider interface has two capabilities:

1. `inspect(profile)` returns a normalized Credential Health Result from provider-owned metadata.
2. `run(operation, arguments, context)` executes one closed-catalog Wrangler operation and returns
   a bounded, redacted result.

The OneCLI adapter:

- uses JSON output from `onecli apps connections list --provider cloudflare`, `onecli agents grants
  list`, and `onecli agents credentials` for inspection;
- uses `onecli run --project <project> --agent <identifier> -- pnpm exec wrangler ...` for
  Cloudflare operations;
- builds arguments as arrays with no shell interpolation;
- removes ambient Cloudflare token, global-key, email, auth-path, and account-selection variables;
- restores only the profile's expected non-secret account ID;
- permits OneCLI's own authentication context without reading or logging its values.

The Cloudflare-native adapter preserves the existing Wrangler authentication behavior but still
uses the same operation catalog, redaction, plan, result, and audit contracts.

## Error and exit contract

| Exit | Category | Example stable codes |
| --- | --- | --- |
| `0` | Success | — |
| `2` | Invalid command, profile, plan, or configuration | `invalid_profile`, `invalid_plan`, `unsafe_path` |
| `3` | OneCLI setup or availability | `onecli_missing`, `onecli_unauthenticated`, `provider_unavailable` |
| `4` | Authorization or permission denial | `connection_missing`, `grant_denied`, `credential_revoked`, `insufficient_permission` |
| `5` | Identity ambiguity or account mismatch | `ambiguous_connection`, `agent_mismatch`, `account_mismatch` |
| `6` | Approval or receipt failure | `approval_required`, `plan_changed`, `receipt_expired`, `receipt_mismatch` |
| `7` | Cloudflare mutation failed or was interrupted | `migration_failed`, `deploy_failed`, `operation_interrupted` |
| `8` | Post-deployment verification failed | `invalid_worker_url`, `health_check_failed` |

Messages are composed locally from stable codes. Raw command lines, environment values, request
headers, tokens, upstream bodies, and stack traces are never included in normal output or audit
records.

## Process and redaction rules

- Child processes are launched directly with argument arrays; no user value is passed through a
  shell.
- Profile and generated artifact paths must resolve outside the repository unless they are
  committed example files; symlinks and overly broad filesystem targets are rejected.
- Captured output has a strict byte limit and is redacted before parsing, logging, persistence, or
  rendering.
- Redaction recognizes authorization headers, Cloudflare's current scannable token prefixes,
  legacy token/key variables, OneCLI credential variables, and configured secret sentinel values
  used by tests.
- On timeout or interruption, the child is terminated, the outcome is recorded as `interrupted`,
  and the result directs the operator to inspect status and obtain a fresh preflight receipt.
- Audit serialization uses an allowlist and cannot accept arbitrary provider context.

## Approval boundary

The repository-owned deployment skill may generate a plan and run `check` autonomously because
both are non-mutating. It must display the exact plan ID and mutation list, then stop for explicit
human approval before `apply`. A CI runner may proceed only after its protected environment or
equivalent external approval mechanism supplies the matching plan ID. Neither path may infer
approval from the existence of credentials.

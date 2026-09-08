# Quickstart: Validate OneCLI Cloudflare Credentials

This guide describes the expected workflow after implementation. Use a non-production Cloudflare
account or isolated test environment. Never paste a real token into a command, repository file,
terminal transcript shared with an AI agent, or test fixture.

## Prerequisites

- Node.js 22, pnpm 9, repository dependencies, and Wrangler 4.x.
- OneCLI CLI 2.11 or newer, authenticated to the intended OneCLI project.
- A OneCLI agent dedicated to the test deployment.
- A Cloudflare connection created through the OneCLI human-controlled interface, using an API token
  scoped to the test account and the documented Vizoalica permission matrix.
- The connection attached to the test agent with only the required tools allowed or approval-gated.
- A completed `deploy/cloudflare/wrangler.production.toml` targeting the test resources.

Confirm only non-secret metadata:

```sh
onecli auth status
onecli apps connections list --provider cloudflare
onecli agents list --with-grants
onecli agents credentials --id <agent-id> --project <project-slug>
```

Expected: the selected connection ID appears for exactly one intended deployment agent and its
effective access is no broader than the planned Vizoalica operations. Do not use a connection label
as identity.

## Create a non-secret deployment profile

```sh
pnpm deploy:configure -- \
  --profile <operator-config-directory>/vizoalica/staging.json \
  --provider onecli \
  --environment staging \
  --wrangler-config deploy/cloudflare/wrangler.production.toml \
  --account-id <32-character-cloudflare-account-id> \
  --onecli-project <project-slug> \
  --onecli-agent-id <agent-id> \
  --onecli-agent <agent-identifier> \
  --onecli-connection <connection-id>
```

Expected: a user-only profile is created outside the repository. It contains the non-secret values
shown above and no token, key, authorization header, email credential, or Worker secret value.

## Generate and inspect the plan

```sh
pnpm deploy:plan -- \
  --profile <operator-config-directory>/vizoalica/staging.json \
  --out <operator-state-directory>/vizoalica/staging-plan.json
```

Expected: plan generation performs no network request and lists the exact read, migration, deploy,
and verification operations. Record the displayed plan ID only after reviewing the target account,
environment, resource names, and mutation list.

## Run non-mutating preflight

```sh
pnpm deploy:check -- \
  --profile <operator-config-directory>/vizoalica/staging.json \
  --plan <operator-state-directory>/vizoalica/staging-plan.json \
  --receipt <operator-state-directory>/vizoalica/staging-receipt.json
```

Expected:

- OneCLI project, agent, connection, attached grant, and effective credential agree.
- The authenticated Cloudflare account exactly matches the profile.
- D1, R2, required Worker secret names, and the Worker dry-run pass.
- A user-only receipt is created with a 15-minute expiry.
- No Cloudflare resource changes.
- No raw OneCLI or Cloudflare credential appears in output, artifacts, or audit records.

## Apply only after explicit approval

After a human reviews the plan, substitute its exact non-secret plan ID:

```sh
pnpm deploy:apply -- \
  --profile <operator-config-directory>/vizoalica/staging.json \
  --plan <operator-state-directory>/vizoalica/staging-plan.json \
  --receipt <operator-state-directory>/vizoalica/staging-receipt.json \
  --approve <reviewed-plan-id>
```

Expected: access and account identity are rechecked, pending migrations run before Worker deploy,
and a safe result lists completed operations. A changed plan/config, wrong plan ID, expired receipt,
revoked grant, or account mismatch blocks mutation.

## Verify the deployed Worker

```sh
pnpm deploy:verify -- \
  --profile <operator-config-directory>/vizoalica/staging.json \
  --worker-url https://<test-worker-host> \
  --plan <operator-state-directory>/vizoalica/staging-plan.json
```

Expected: the bounded health contract passes and the local audit record links verification to the
reviewed plan.

## Validate rotation and revocation

1. Replace the token inside the same OneCLI Cloudflare connection using a OneCLI-controlled human
   interface.
2. Run `deploy:check` again with a newly generated plan.
3. Confirm the Vizoalica profile did not change and preflight succeeds.
4. Detach the connection from the test agent or revoke it in OneCLI.
5. Run `deploy:check` and `deploy:apply` again.

Expected: rotation succeeds without a profile edit. Revocation produces a safe denial before any
Cloudflare mutation and never falls back to native Wrangler authentication.

## Validate no-fallback behavior

Run the integration test suite with a recognizable fake ambient Cloudflare token while the OneCLI
provider mock reports a missing or denied connection.

Expected: the fake value is removed from the wrapped child environment, no native provider process
is launched, no mutation is attempted, and the value is absent from captured output and audit
artifacts.

## Required automated checks

```sh
pnpm typecheck
pnpm test -- --run
pnpm lint
pnpm format:check
pnpm build
pnpm coverage
pnpm audit --audit-level high
```

Feature tests must cover profile schemas, safe file permissions, command argument isolation,
provider selection, OneCLI JSON parsing, attached-versus-effective grants, connection ambiguity,
account mismatch, least-privilege denial, revocation, rotation, no fallback, redaction, plan and
receipt tampering, expiry, interruption, retry guidance, native compatibility, audit retention, and
the non-production end-to-end path. Repository-wide line and branch coverage must remain above 90%.

## Migration and rollback check

1. Run the existing Cloudflare-native preflight with no deployment profile and confirm unchanged
   behavior.
2. Create a OneCLI profile and confirm only that profile uses OneCLI.
3. Explicitly create a `cloudflare-native` profile to roll back provider selection.

Expected: neither migration nor rollback copies a token through Vizoalica, and provider choice never
changes through auto-detection.

## Implementation validation record

Validated on 2026-09-07 with Node.js 22, pnpm 9, OneCLI 2.11.0, and Wrangler 4.127.1:

- Repository lint, formatting, type checking, all tests, and all production builds passed.
- 165 automated tests passed, including fake-process
  contract, integration, security-negative, lifecycle, native compatibility, and full command-flow
  coverage.
- Repository coverage passed the mandatory thresholds with 96.48% lines and 90.24% branches.
- The versioned `vizoalica-cloudflare-deploy` skill passed its structural validator.
- The package audit reported no known vulnerabilities.
- A local command smoke test created a private profile and offline plan through the documented pnpm
  entry points; it performed no provider request or Cloudflare mutation.

Live mutation remains an operator-owned boundary: run check/apply against an isolated
non-production OneCLI connection only after reviewing and explicitly approving the generated plan
ID.
